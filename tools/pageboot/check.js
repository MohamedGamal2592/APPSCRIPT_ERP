/**
 * Page boot — the checks after each wave. Read-only: it never changes a file.
 *
 *   node tools/pageboot/check.js --baseline   BEFORE wave 1: records which
 *                                             `npm run verify` checks pass now
 *   node tools/pageboot/check.js --wave N     after `apply.js --wave N`
 *
 * Every line is PASS or FAIL. Exit 0 only when every line is PASS.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASELINE = path.join(__dirname, 'verify_baseline.json');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let failed = 0;
function line(ok, label, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  if (!ok) { failed++; if (detail) console.log('      ' + String(detail).split('\n').slice(0, 12).join('\n      ')); }
}

/* `npm run verify` → { "<title>#<n>": "OK" | "FAILED" } */
function runVerify() {
  const r = spawnSync(process.execPath, [path.join('tools', 'verify', 'run_all.js')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const lines = String(r.stdout || '').split(/\r?\n/);
  const out = {};
  const seen = {};
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('── ') !== 0) continue;
    const title = lines[i].slice(3).trim();
    seen[title] = (seen[title] || 0) + 1;
    const status = String(lines[i + 1] || '').trim();
    out[title + '#' + seen[title]] = status === 'OK' ? 'OK' : (status === 'FAILED' ? 'FAILED' : status);
  }
  return out;
}

const argv = process.argv.slice(2);
if (argv[0] === '--baseline') {
  const v = runVerify();
  const n = Object.keys(v).length;
  if (!n) { console.log('FAIL  npm run verify produced no checks'); process.exit(1); }
  fs.writeFileSync(BASELINE, JSON.stringify(v, null, 1) + '\n');
  const bad = Object.keys(v).filter(k => v[k] !== 'OK').length;
  console.log('PASS  baseline recorded: ' + n + ' checks, ' + bad + ' already failing (tools/pageboot/verify_baseline.json)');
  process.exit(0);
}
const wave = argv[0] === '--wave' ? Number(argv[1]) : NaN;
if (!Number.isInteger(wave) || wave < 1) { console.error('usage: node tools/pageboot/check.js --baseline | --wave N'); process.exit(2); }

/* 1 — the files are there and parse */
function scriptsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1].replace(/<\?!?=[\s\S]*?\?>/g, 'null').replace(/<\?[\s\S]*?\?>/g, ''));
  return out;
}
function parses(label, src) {
  try { new vm.Script(src); line(true, label); } catch (e) { line(false, label, e.message); }
}
['Code.js', 'Page_Boot_Reads.js'].forEach(f => parses(f + ' parses', read(f)));
[['Page_Boot.html'], ['Client_Helpers.html'], ['Company_ErpTest_Customers.html'], ['Company_ErpTest_Products.html']].forEach(function (x) {
  const scripts = scriptsOf(read(x[0]));
  let bad = '';
  scripts.forEach((s, i) => { try { new vm.Script(s); } catch (e) { bad = bad || ('script ' + (i + 1) + ': ' + e.message); } });
  line(!bad && scripts.length > 0, x[0] + ' scripts parse (' + scripts.length + ')', bad);
});
line(read('Page_Boot.html').indexOf('<?') === -1, 'Page_Boot.html has no «<?» (it is injected verbatim, never evaluated as a template)');

/* 2 — line endings: every file this plan touches keeps ONE style */
['Code.js', 'Client_Helpers.html', 'Page_Boot.html', 'Page_Boot_Reads.js', 'Company_ErpTest_Customers.html', 'Company_ErpTest_Products.html'].forEach(function (f) {
  const s = read(f);
  const crlf = (s.match(/\r\n/g) || []).length;
  const bare = (s.match(/(^|[^\r])\n/g) || []).length;
  line(crlf === 0 || bare === 0, f + ' line endings consistent (' + crlf + ' CRLF, ' + bare + ' LF)');
});

/* 3 — the anchors are in place, once */
const code = read('Code.js');
const helpers = read('Client_Helpers.html');
const once = (s, t) => s.split(t).length - 1 === 1;
line(once(code, 'function pageBootInject_(') && once(code, 'function pageBootRun_(') && once(code, 'function pageBootResolve_('), 'Code.js: pageBootInject_, pageBootRun_, pageBootResolve_ defined once');
line(once(code, 'var bootHead = pageBootInject_(action, authUser, e.parameter || {}, scriptUrl);') && once(code, 'var headInjection = bootHead + '), 'Code.js: doGet prepends the page boot to <head>');
line(once(helpers, 'API._callInner = function (action, payload, sessionToken, opts) {') && once(helpers, 'var booted = PageBoot.answer(action, payload);'), 'Client_Helpers.html: API.call asks PageBoot first, then API._callInner');
line(!/PageBoot\.(wrap|panel)\(|BOOT_MODE|pageBootJson_\(user/.test(read('Company_ErpTest_Customers.html') + read('Company_ErpTest_Products.html')), 'pilot pages carry no page-level boot code (the framework does it)');

/* 4 — Page_Boot_Reads.js is exactly what gen_reads.js makes for this wave */
const current = read('Page_Boot_Reads.js');
execFileSync(process.execPath, [path.join('tools', 'pageboot', 'gen_reads.js'), '--wave', String(wave)], { cwd: ROOT, stdio: 'ignore' });
const fresh = read('Page_Boot_Reads.js');
fs.writeFileSync(path.join(ROOT, 'Page_Boot_Reads.js'), current);   // read-only: put back exactly what was there
line(current.replace(/\r\n/g, '\n') === fresh.replace(/\r\n/g, '\n'), 'Page_Boot_Reads.js = gen_reads.js --wave ' + wave + ' (not edited by hand)');

/* 5 — behaviour */
function sub(label, args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  line(r.status === 0, label, out.split('\n').filter(l => /FAIL|Error|error/.test(l)).join('\n') || out.slice(-800));
}
sub('server: pageBootInject_ / tokens / off switch / read-only / size cap (tests/server.js)', [path.join('tools', 'pageboot', 'tests', 'server.js')]);
sub('client: answer once / stamps window / off mode / timing (tests/client.js)', [path.join('tools', 'pageboot', 'tests', 'client.js')]);
sub('pages: every switched-on page answered from its HTML (tests/pages.js --wave ' + wave + ')', [path.join('tools', 'pageboot', 'tests', 'pages.js'), '--wave', String(wave)]);

/* 6 — nothing that passed before fails now */
if (!fs.existsSync(BASELINE)) {
  line(false, 'npm run verify: no baseline — run `node tools/pageboot/check.js --baseline` BEFORE wave 1');
} else {
  const before = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const now = runVerify();
  const broke = Object.keys(before).filter(k => before[k] === 'OK' && now[k] !== 'OK');
  const gone = Object.keys(before).filter(k => now[k] === undefined);
  const nFail = Object.keys(now).filter(k => now[k] !== 'OK').length;
  line(broke.length === 0, 'npm run verify: no check that passed before fails now (' + Object.keys(now).length + ' checks, ' + nFail + ' failing, baseline ' + Object.keys(before).filter(k => before[k] !== 'OK').length + ')',
    broke.concat(gone.map(g => 'missing now: ' + g)).join('\n'));
}

console.log(failed ? '\nwave ' + wave + ': ' + failed + ' check(s) FAILED — do not continue; report the FAIL lines.' : '\nwave ' + wave + ': all checks PASS');
process.exit(failed ? 1 : 0);
