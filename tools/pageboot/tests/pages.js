/**
 * Page boot — every switched-on page, end to end, in the harness.
 *
 * For each page in waves 1..N (tools/pageboot/waves.json) it builds the
 * __PAGE_BOOT__ the server would build — the page's reads from
 * Page_Boot_Reads.js, tokens resolved against the harness's own URL values and
 * clock — installs the REAL runtime (Page_Boot.html), runs the page, and
 * checks that every declared read was answered from the page and none of them
 * reached the server. A failure means the page no longer sends what the
 * inventory recorded: regenerate the inventory and look at the diff.
 *
 * Run from the repository root: node tools/pageboot/tests/pages.js --wave N
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { runPage } = require('../harness');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = process.argv.indexOf('--wave');
const wave = arg === -1 ? NaN : Number(process.argv[arg + 1]);
if (!Number.isInteger(wave) || wave < 1) { console.error('usage: node tools/pageboot/tests/pages.js --wave N  (N >= 1)'); process.exit(2); }

const rtSrc = fs.readFileSync(path.join(ROOT, 'Page_Boot.html'), 'utf8');
const RUNTIME = rtSrc.slice(rtSrc.indexOf('<script>') + 8, rtSrc.lastIndexOf('</script>'));
const readsCtx = {};
vm.createContext(readsCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'Page_Boot_Reads.js'), 'utf8') + '\nthis.__map = PAGE_BOOT_READS;', readsCtx);
const MAP = readsCtx.__map;
const inv = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'inventory.json'), 'utf8'));
const byAction = {};
inv.pages.forEach(p => { byAction[p.action] = p; });

/* The harness's clock (see harness.js) and URL values. */
const BASE = new Date('2026-09-15T10:00:00Z');
const pad = n => ('0' + n).slice(-2);
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function resolve(v) {
  if (typeof v === 'string' && v.charAt(0) === '$') {
    if (v.indexOf('$param:') === 0) return '__P_' + v.slice(7) + '__';
    if (v === '$sessionToken') return 'tok';
    if (v === '$scriptUrl') return 'BASE';
    if (v === '$date:today') return ymd(BASE);
    if (v === '$date:monthStart') return ymd(new Date(BASE.getFullYear(), BASE.getMonth(), 1));
    if (v === '$date:monthEnd') return ymd(new Date(BASE.getFullYear(), BASE.getMonth() + 1, 0));
    if (v === '$date:year') return BASE.getFullYear();
    return v;
  }
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = resolve(v[k]); }); return o; }
  return v;
}
function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

/* Which pages this wave switches on — the same rule as gen_reads.js. */
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'waves.json'), 'utf8'));
const want = new Set();
Object.keys(cfg.waves).map(Number).filter(k => k <= wave).forEach(k => {
  const w = cfg.waves[String(k)];
  inv.pages.forEach(p => { if (p.decision === 'BOOT' && ((w.pages || []).indexOf(p.action) !== -1 || (w.companies || []).indexOf(p.company) !== -1)) want.add(p.action); });
});

let failed = 0;
function check(ok, label, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label);
  if (!ok) { failed++; if (extra !== undefined) console.log('        ' + JSON.stringify(extra).slice(0, 700)); }
}

(async function () {
  const missing = Array.from(want).filter(a => !MAP[a]);
  const extra = Object.keys(MAP).filter(a => !want.has(a));
  check(!missing.length && !extra.length, 'Page_Boot_Reads.js lists exactly the ' + want.size + ' page(s) of waves 1..' + wave, { missing, extra });

  for (const action of Array.from(want).sort()) {
    const spec = MAP[action];
    const page = byAction[action];
    if (!spec || !page) continue;
    const reads = spec.reads.map(r => ({ action: r.action, data: resolve(r.data || {}), ok: true, ms: 1,
      reply: r.action === 'get_page_versions' ? { status: 'success', versions: {} } : { status: 'success' } }));
    const boot = { page: action, company: spec.company, mode: 'embed', admin: false, waitFor: spec.waitFor || '', query: '', server_ms: 1, reads: reads };
    const run = await runPage({ action: action, template: page.template }, { boot: boot, runtime: RUNTIME });
    for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
    const keyOf = c => (c.payload && c.payload.target_system) + '|' + (c.payload && c.payload.module_action) + '|' + canon(c.payload && c.payload.data === undefined ? {} : c.payload && c.payload.data);
    const declared = reads.filter(r => r.action !== 'get_page_versions').map(r => spec.company + '|' + r.action + '|' + canon(r.data));
    const answered = new Set(run.calls.filter(c => c.via === 'boot').map(keyOf));
    const toServer = run.calls.filter(c => c.via === 'API.call' && c.route === 'company_action').map(keyOf);
    const notAnswered = declared.filter(k => !answered.has(k));
    const leaked = toServer.filter(k => declared.indexOf(k) !== -1);
    check(!notAnswered.length && !leaked.length, action + ' — ' + declared.length + ' declared read(s) answered from the page',
      { notAnswered, leaked, sentToServer: toServer.slice(0, 4) });
  }

  /* The two pilots keep their later part as a background call. */
  const later = { et_customers: 'get_et_parties|{"balancesOnly":true}', et_products: 'get_et_products|{"stockOnly":true}' };
  for (const action of Object.keys(later)) {
    if (!want.has(action)) continue;
    const spec = MAP[action];
    const reads = spec.reads.map(r => ({ action: r.action, data: resolve(r.data || {}), ok: true, ms: 1,
      reply: r.action === 'get_page_versions' ? { status: 'success', versions: {} } : (action === 'et_customers' ? { status: 'success', parties: [{ id: 1 }] } : { status: 'success', products: [{ id: 1 }] }) }));
    const run = await runPage({ action: action, template: byAction[action].template },
      { boot: { page: action, company: spec.company, mode: 'embed', admin: false, waitFor: spec.waitFor, query: '', server_ms: 1, reads: reads }, runtime: RUNTIME });
    for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
    const sent = run.calls.filter(c => c.via === 'API.call' && c.route === 'company_action').map(c => c.payload.module_action + '|' + canon(c.payload.data));
    check(sent.indexOf(later[action]) !== -1, action + ' — its later part (' + later[action] + ') is still fetched in the background', sent);
  }

  console.log(failed ? '\n' + failed + ' page check(s) FAILED' : '\npage boot page checks pass (' + want.size + ' page(s))');
  process.exit(failed ? 1 : 0);
})();
