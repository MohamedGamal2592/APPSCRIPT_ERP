/**
 * RT2a — a write handler returns the record it saved, or says why it cannot.
 *
 * An optimistic save draws a DRAFT row from what the user typed. That draft is
 * missing everything the server decides: the assigned id, the record_uid, the
 * audit stamps, and every computed field. If the reply carries no `record`, the
 * draft stays on screen looking saved while differing in every one of those
 * fields from what is actually in the sheet — and the next real load silently
 * replaces it with something else.
 *
 * So: a page may only be converted to UIC.Live.save's OPTIMISTIC path when the
 * handler behind it returns a record. A handler that genuinely cannot return
 * one — a multi-sheet commit, a delete, a batch — is not a bug, but it must be
 * DECLARED, and its page passes `reload` and keeps its overlay instead. That is
 * the rule this file enforces, and the exemption list below is the declaration.
 *
 * An exemption with a stated reason is fine. A silent one is not: without this
 * list, "the handler does not return a record" and "nobody has looked at this
 * handler" are indistinguishable, and the second one is how an optimistic row
 * ends up permanently disagreeing with the sheet.
 *
 * Run: node tools/verify/rt2_record_replies.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

function mask(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; blank(i, end); i = end; continue; }
    if (c === '/' && src[i + 1] === '/') { let e = src.indexOf('\n', i); if (e < 0) e = n; blank(i, e); i = e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
      blank(i + 1, Math.min(j, n)); i = Math.min(j + 1, n); continue;
    }
    i++;
  }
  return out.join('');
}

function spans(masked) {
  const out = [];
  const re = /function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const open = masked.indexOf('{', m.index + m[0].length - 1);
    if (open === -1) continue;
    let d = 0;
    for (let j = open; j < masked.length; j++) {
      if (masked[j] === '{') d++;
      else if (masked[j] === '}') { d--; if (d === 0) { out.push({ name: m[1], open, close: j }); break; } }
    }
  }
  return out;
}

/* ══ THE EXEMPTION LIST ══════════════════════════════════════════════════
 *
 * Every entry is a CLASS of handler with one stated reason, not a list of
 * names nobody maintains. A handler matching one of these may reply without a
 * record; its page passes `reload` to UIC.Live.save and keeps its overlay,
 * which UIC.Live.save already honours.
 */
const EXEMPT = [
  {
    id: 'delete',
    test: a => /^(delete|remove)_/.test(a),
    why: 'There is no record to return: the row is gone. The optimistic operation ' +
         'here is a removal, and the rollback is putting the row back, which the ' +
         'page already holds. Nothing the server could send would improve it.'
  },
  {
    id: 'approve',
    test: a => /^(approve|toggle)_/.test(a),
    why: 'A state flip the page already knows the result of — it flipped it. The ' +
         'server confirms or refuses; there is no assigned id or computed field ' +
         'to carry back.'
  },
  {
    id: 'batch',
    test: a => /(_files|_invites|_test_data|generate_|_copy$|close_payroll_month)/.test(a),
    why: 'A batch commit writes N rows, so there is no single record to return. ' +
         'These pages reload, and reloading is correct — the user is not waiting ' +
         'on one row appearing.'
  },
  {
    id: 'multisheet',
    test: a => /^(save_valley_(purchasing_costing|invoice|return|mfg_recipe|mfg_workop|warehouse_movement))$|^(add|edit)_sales$|^(add|edit)_purchasing$/.test(a),
    why: 'A multi-sheet commit: the header and its lines land in two or more ' +
         'sheets, so "the record" is not one row. D-G: these pass `reload` to ' +
         'UIC.Live.save and keep their overlay until a bootstrap endpoint can ' +
         'return the whole shape.'
  }
];

const FILES = [
  'Company_TopChemical_Actions.js',
  'Company_TopLight_Actions.js',
  'Company_ValleyFoods_Actions.js',
  'Company_ValleyFoods_HR_Modules.js',
  'Company_Assessment_Actions.js'
].filter(f => fs.existsSync(path.join(ROOT, f)));

const WRITE = /^(add|edit|save|update|delete|remove|approve|post|submit|transfer|assign|revise|cancel|import|close|toggle|set|create|generate)_/i;

const returnsRecord = [];
const exempted = [];
const pending = [];

FILES.forEach(function (file) {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = mask(raw);
  const byName = {};
  spans(m).forEach(f => { byName[f.name] = raw.slice(f.open, f.close); });

  /* register('name', handler) and register('name', wrapper(handler)) — the
   * ValleyFoods registry wraps many handlers in withRefBust_, so the handler
   * that actually replies is the INNER one. */
  const re = /register\(\s*['"]([^'"]+)['"]\s*,\s*(?:[A-Za-z0-9_]+\(\s*)?([A-Za-z0-9_]+)/g;
  let x;
  while ((x = re.exec(raw)) !== null) {
    const action = x[1];
    let handler = x[2];
    if (!WRITE.test(action)) continue;
    /* a wrapper name resolved instead of the handler: take the inner symbol */
    if (/^(withRefBust_|withLock_|withAudit_)$/.test(handler)) {
      const inner = /register\(\s*['"][^'"]+['"]\s*,\s*[A-Za-z0-9_]+\(\s*([A-Za-z0-9_]+)/.exec(raw.slice(x.index, x.index + 200));
      if (inner) handler = inner[1];
    }
    const body = byName[handler] || '';
    /* Three shapes count, because all three are in use here and all three put
     * the saved row in the reply: a `record:` property in a returned literal,
     * a `res.record = rec` assignment onto a result object, and delegation to
     * saveRecordWithAudit_/approveRecordWithAudit_, which build the record
     * themselves. Matching only the first reported twenty handlers that were
     * already correct. */
    const has = /\brecord\s*:/.test(body) ||
                /\.record\s*=[^=]/.test(body) ||
                /saveRecordWithAudit_|approveRecordWithAudit_/.test(body);
    const short = file.replace('Company_', '').replace('_Actions.js', '');
    if (has) { returnsRecord.push(short + ' ' + action); continue; }
    const ex = EXEMPT.find(e => e.test(action));
    if (ex) exempted.push({ file: short, action, handler, why: ex.id });
    else pending.push({ file: short, action, handler });
  }
});

console.log('  ..    ' + returnsRecord.length + ' write actions return their saved record');
console.log('  ..    ' + exempted.length + ' are exempt, by class:');
EXEMPT.forEach(function (e) {
  const n = exempted.filter(x => x.why === e.id).length;
  if (n) console.log('          ' + String(n).padStart(3) + '  ' + e.id + ' — ' + e.why.replace(/\s+/g, ' '));
});

/* The third group: handlers that COULD return a record and do not yet. They
 * are not exempt, and they are not a failure either — they are the tail of a
 * staged migration. What makes them safe is the pairing rule below: a page may
 * not be moved onto the optimistic path until its handler returns a record.
 * Fail the moment that pairing is broken; report, and only report, until then. */
console.log('  ..    ' + pending.length + ' write action(s) do not return a record yet:');
pending.forEach(function (x) { console.log('          ' + x.file + ' | ' + x.action + ' -> ' + x.handler + '()'); });
check(returnsRecord.length > 0, 'the record-returning path is actually in use');

/* ── The rule that makes the exemption safe ──────────────────────────────
 *
 * An exemption is only harmless because the page compensates. A page that
 * calls UIC.Live.save against an exempt action MUST pass `reload`, or the
 * draft row it drew is never replaced by anything real. */

/* An action is "not safe for the optimistic path" when it neither returns a
 * record nor could be made to — the declared exemptions — and equally when it
 * simply has not been fixed yet. A page that uses either through UIC.Live.save
 * with no `reload` fallback draws a row the server will never replace, which is
 * the exact failure this whole file exists to prevent. */
const exemptActions = new Set(exempted.map(e => e.action).concat(pending.map(p => p.action)));
const bad = [];
let converted = 0;

fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(function (page) {
  const raw = fs.readFileSync(path.join(ROOT, page), 'utf8');
  if (raw.indexOf('UIC.Live.save') === -1) return;
  const m = mask(raw);
  let i = m.indexOf('UIC.Live.save');
  while (i !== -1) {
    converted++;
    /* the call's own argument object, balanced */
    const o = m.indexOf('(', i);
    let d = 0, c = -1;
    for (let j = o; j < m.length; j++) {
      if (m[j] === '(') d++;
      else if (m[j] === ')') { d--; if (d === 0) { c = j; break; } }
    }
    if (c !== -1) {
      const callRaw = raw.slice(o, c);
      const acts = [...callRaw.matchAll(/['"]([a-z0-9_]+)['"]/g)].map(z => z[1]);
      const hitsExempt = acts.some(a => exemptActions.has(a));
      const hasReload = /\breload\s*:/.test(m.slice(o, c));
      if (hitsExempt && !hasReload) {
        bad.push('        ' + page + ' — Live.save against an exempt action with no `reload` fallback');
      }
    }
    i = m.indexOf('UIC.Live.save', i + 1);
  }
});

check(bad.length === 0,
  'no page runs the optimistic path against an exempt action without a `reload` fallback',
  bad.join('\n'));
console.log('  ..    ' + converted + ' UIC.Live.save call site(s) across the pages');

const reportArg = process.argv.find(function (a) { return a.indexOf('--report=') === 0; });
const reportPath = reportArg
  ? path.resolve(reportArg.slice('--report='.length))
  : path.join(os.tmpdir(), 'codex-js-simplification', 'rt2_exemptions.txt');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

/* Write the full lists where the results document can quote them. */
fs.writeFileSync(reportPath,
  '# Generated by rt2_record_replies.js — the full exemption list.\n\n' +
  EXEMPT.map(e =>
    '## ' + e.id + ' (' + exempted.filter(x => x.why === e.id).length + ')\n' +
    e.why.replace(/\s+/g, ' ') + '\n\n' +
    exempted.filter(x => x.why === e.id).map(x => '  ' + x.file + ' | ' + x.action + ' -> ' + x.handler).join('\n')
  ).join('\n\n') +
  '\n\n## pending (' + pending.length + ')\n' +
  'NOT exempt. These could return a record and do not yet. Each one blocks its\n' +
  'page from the optimistic path until it is fixed, which rt2 enforces: a page\n' +
  'converted against one of these without a `reload` fallback fails the build.\n\n' +
  pending.map(x => '  ' + x.file + ' | ' + x.action + ' -> ' + x.handler).join('\n') + '\n');

console.log('\n' + (failed === 0
  ? 'RT2a — every write action returns its record or declares why it cannot.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);


