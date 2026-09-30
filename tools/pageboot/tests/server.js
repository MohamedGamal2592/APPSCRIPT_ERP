/**
 * Page boot — server checks (Code.js pageBootInject_ / pageBootRun_ /
 * pageBootResolve_) on the REAL Code.js + company files under gasstub.
 * Run from the repository root after phase 1: node tools/pageboot/tests/server.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const gasstub = require('../../verify/gasstub');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const order = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8')).filePushOrder.filter(f => f !== 'Code.js');
const sources = order.concat(fs.existsSync(path.join(ROOT, 'Page_Boot_Reads.js')) ? ['Page_Boot_Reads.js'] : []);
const H = gasstub.createHarness({ sources: sources });

let failed = 0;
function check(ok, label, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label);
  if (!ok) { failed++; if (extra !== undefined) console.log('        ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600)); }
}

/* Services gasstub does not carry. */
let runtimeMissing = false;
H.ctx.HtmlService = { createHtmlOutputFromFile: function (name) {
  if (runtimeMissing) throw new Error('No HTML file named ' + name);
  const src = fs.readFileSync(path.join(ROOT, name + '.html'), 'utf8');
  return { getContent: function () { return src; } };
} };
H.ctx.Session.getScriptTimeZone = function () { return 'Africa/Cairo'; };
H.ctx.Utilities.formatDate = function (d, tz, fmt) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day);
};

H.call('ensureCompaniesRegistered_');
H.override('resolveDbId_', function () { return 'db1'; });
const ET = '37fc50edf1424abd';
const SA = { email: 'sa@x.com', name: 'SA', isSuperAdmin: true, company: ET };

function cfgOf(html) {
  const m = /^<script>window\.__PAGE_BOOT__=([\s\S]*?);<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
}
/* The harness runs on its own clock: the expectation must come from it too. */
const today = H.ctx.Utilities.formatDate(H.eval('new Date()'), 'Africa/Cairo', 'yyyy-MM-dd');
const year = Number(today.slice(0, 4));

console.log('\n1 — the doGet hook and the generated map\n');
const code = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
const once = s => code.split(s).length - 1 === 1;
check(once('function pageBootInject_(') && once('function pageBootRun_(') && once('function pageBootResolve_('), 'Code.js defines pageBootInject_, pageBootRun_, pageBootResolve_ once each');
check(once('var bootHead = pageBootInject_(action, authUser, e.parameter || {}, scriptUrl);') && once('var headInjection = bootHead + '), 'doGet prepends pageBootInject_ to <head>');
check(typeof H.eval('typeof PAGE_BOOT_READS') === 'string' && H.eval('typeof PAGE_BOOT_READS') === 'object', 'PAGE_BOOT_READS is loaded');
const map = H.eval('PAGE_BOOT_READS');
const regs = H.eval('COMPANY_REGISTRY');
const badSpec = Object.keys(map).filter(k => {
  const s = map[k];
  return !s || !regs[s.company] || !Array.isArray(s.reads) || !s.reads.length || s.reads.some(r => !/^get_/.test(r.action));
});
check(badSpec.length === 0, 'every PAGE_BOOT_READS entry names a registered company and only get_ reads (' + Object.keys(map).length + ' pages)', badSpec);
const pagesOfCompanies = {};
Object.keys(regs).forEach(uid => (regs[uid].pages || []).forEach(p => { pagesOfCompanies[p.action] = uid; }));
const wrongOwner = Object.keys(map).filter(k => pagesOfCompanies[k] !== map[k].company);
check(wrongOwner.length === 0, 'every entry is a page of the company it reads from', wrongOwner);

/* A controlled map for the behaviour checks. get_page_versions needs no sheet. */
H.eval(`PAGE_BOOT_READS = {
  t_page: { company: '${ET}', waitFor: 'later', reads: [
    { action: 'get_page_versions', data: { page: 'et_customers' } },
    { action: 'get_page_versions', data: { page: 'et_customers', code: '$param:purchase_code', missing: '$param:nope', d0: '$date:today', d1: '$date:monthStart', d2: '$date:monthEnd', y: '$date:year', s: '$sessionToken', u: '$scriptUrl', keep: '$literal', arr: ['$param:purchase_code'] } }
  ] },
  t_write: { company: '${ET}', reads: [ { action: 'add_et_party', data: { name: 'x' } }, { action: 'get_page_versions', data: { page: 'et_customers' } } ] }
};`);
const params = { action: 't_page', sessionToken: 'SESS', purchase_code: 'PC-9' };

console.log('\n2 — embed\n');
let html = H.call('pageBootInject_', 't_page', SA, params, 'https://app/exec');
let cfg = cfgOf(html);
check(!!cfg && cfg.mode === 'embed' && cfg.page === 't_page' && cfg.company === ET && cfg.admin === true && cfg.waitFor === 'later', 'injects __PAGE_BOOT__ first, mode embed, page/company/admin/waitFor', cfg);
check(html.indexOf('window.PageBoot') !== -1 && html.indexOf('answer: answer') !== -1, 'followed by the runtime (Page_Boot.html)');
check(cfg.reads.length === 2 && cfg.reads.every(r => r.ok && r.reply && r.reply.versions !== undefined), 'both reads ran and embedded their replies', cfg.reads.map(r => [r.ok, r.error]));
const d = cfg.reads[1].data;
const pad = n => ('0' + n).slice(-2);
const mo = Number(today.slice(5, 7));
check(d.code === 'PC-9' && d.missing === '' && d.s === 'SESS' && d.u === 'https://app/exec' && d.keep === '$literal' && d.arr[0] === 'PC-9', 'tokens: $param (and absent → \'\'), $sessionToken, $scriptUrl, unknown $ kept, inside arrays', d);
check(d.d0 === today && d.d1 === today.slice(0, 8) + '01' && d.d2 === year + '-' + pad(mo) + '-' + pad(new Date(year, mo, 0).getDate()) && d.y === year, 'date tokens in Africa/Cairo: today, monthStart, monthEnd, year (number)', d);
check(cfg.query.split('&').sort().join('&') === 'action=t_page&purchase_code=PC-9', 'query carries the parameters without the session', cfg.query);
check(typeof cfg.server_ms === 'number' && cfg.reads.every(r => typeof r.ms === 'number' && typeof r.bytes === 'number'), 'timings and sizes recorded');

console.log('\n3 — off, no user, not listed, off switch, missing runtime\n');
cfg = cfgOf(H.call('pageBootInject_', 't_page', SA, Object.assign({ embed: '0' }, params), 'u'));
check(cfg && cfg.mode === 'off' && cfg.reads.every(r => !r.ok && r.reply === null) && cfg.reads[1].data.code === 'PC-9', '?embed=0: declared (resolved) reads, nothing embedded', cfg);
check(H.call('pageBootInject_', 't_page', null, params, 'u') === '', 'no user → nothing injected');
check(H.call('pageBootInject_', 'not_a_page', SA, params, 'u') === '', 'a page not in the map → nothing injected');
H.setProp('PAGE_BOOT_OFF', '1');
check(H.call('pageBootInject_', 't_page', SA, params, 'u') === '', 'PAGE_BOOT_OFF=1 → nothing injected');
H.setProp('PAGE_BOOT_OFF', '');
runtimeMissing = true;
check(H.call('pageBootInject_', 't_page', SA, params, 'u') === '', 'runtime file missing → nothing injected (never a half page)');
runtimeMissing = false;

console.log('\n4 — read-only, per-read failure, size cap, escaping\n');
let dispatched = [];
H.eval(`(function(){ var d = COMPANY_REGISTRY['${ET}'].dispatch; COMPANY_REGISTRY['${ET}'].dispatch = function(p){ globalThis.__seen = (globalThis.__seen || []).concat([p.module_action]); if (p.data && p.data.evil) return { status: 'success', x: '</script><script>alert(1)</script>' }; if (p.data && p.data.boom) throw new Error('boom'); return d.apply(this, arguments); }; })()`);
H.ctx.__seen = [];
cfg = cfgOf(H.call('pageBootInject_', 't_write', SA, {}, 'u'));
check(cfg.reads[0].ok === false && /read-only/.test(cfg.reads[0].error) && H.ctx.__seen.indexOf('add_et_party') === -1, 'a write in the map is refused before dispatch', cfg.reads[0]);
check(cfg.reads[1].ok === true, '…and the read after it still runs');
H.eval(`PAGE_BOOT_READS.t_evil = { company: '${ET}', reads: [ { action: 'get_page_versions', data: { page: 'et_customers', evil: 1 } }, { action: 'get_page_versions', data: { page: 'et_customers', boom: 1 } } ] };`);
html = H.call('pageBootInject_', 't_evil', SA, {}, 'u');
const head = html.slice(0, html.indexOf(';</script>'));
check(head.slice('<script>'.length).indexOf('<') === -1 && cfgOf(html).reads[0].reply.x === '</script><script>alert(1)</script>', "no raw '<' inside __PAGE_BOOT__; the value survives");
check(cfgOf(html).reads[1].ok === false && cfgOf(html).reads[1].error === 'boom', 'a throwing read embeds null + its error');
H.setProp('PAGE_BOOT_MAX_BYTES', '20');
cfg = cfgOf(H.call('pageBootInject_', 't_page', SA, params, 'u'));
check(cfg.reads.every(r => !r.ok && /too large/.test(r.error)), 'PAGE_BOOT_MAX_BYTES: a reply over the cap is not embedded', cfg.reads.map(r => r.error));
H.setProp('PAGE_BOOT_MAX_BYTES', '');
const other = { email: 'u@x.com', isSuperAdmin: false, company: 'another-company', authorizedPages: {} };
cfg = cfgOf(H.call('pageBootInject_', 't_page', other, params, 'u'));
check(!cfg || cfg.reads.every(r => !r.ok), "another company's user gets nothing embedded (same check as apiRouter)", cfg && cfg.reads.map(r => r.error));
check(cfg === null || cfg.admin === false, 'admin flag is false for a non-super-admin');

console.log(failed ? '\n' + failed + ' server check(s) FAILED' : '\npage boot server checks pass');
process.exit(failed ? 1 : 0);
