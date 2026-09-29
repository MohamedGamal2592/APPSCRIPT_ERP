/**
 * S22 — a registered page whose HTML file is not deployed.
 *
 * A registry entry can name a template that is not in the deployment — a page
 * registered on one branch whose HTML landed on another, or a file left out of
 * a push. HtmlService.createTemplateFromFile then throws a raw Apps Script
 * exception ("No HTML file named X was found") which reaches the user as a
 * stack trace on a white page.
 *
 * That is exactly what action=ac_assessments did: the Assessment Center's six
 * page templates live only on feat/assessment-center-work, while the registry
 * entries that name them are on this line of history.
 *
 * The router already handles the two neighbouring cases (an unknown action, and
 * an entry deliberately registered with no template). This checks the third.
 *
 * Run: node tools/verify/s22_missing_template.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CODE = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

/* ══ 1. the guard is where the throw was ════════════════════════════════ */
console.log('\n1 — createTemplateFromFile is guarded\n');
{
  const m = /try\s*\{\s*tmpl = HtmlService\.createTemplateFromFile\(page\.template\);\s*\}\s*catch/.exec(CODE);
  check(!!m, 'the call sits inside a try/catch');
  check(/renderMissingPagePage_\(/.test(CODE), 'and the catch renders a page instead of rethrowing');
  check(/function renderMissingPagePage_\(/.test(CODE), 'that renderer exists');
  /* It must not be confused with the permissions screen — a user sent to
     "not authorised" for a file that was never pushed will ask for a grant
     that would change nothing. */
  const fn = CODE.slice(CODE.indexOf('function renderMissingPagePage_('));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
  check(body.indexOf('NOT_AUTHORIZED') === -1 && body.indexOf('غير مصرح') === -1,
    'it does NOT reuse the access-denied wording — this is a deployment fault');
  check(body.indexOf('مشكلة في النشر') !== -1,
    'it says so plainly');
  check(/templateName/.test(body), 'and names the missing file, for whoever deploys');
}

/* ══ 2. it runs, and returns a page ═════════════════════════════════════ */
console.log('\n2 — the renderer runs against a stubbed HtmlService\n');
{
  const captured = { html: null, title: null };
  const sandbox = {
    console, JSON, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    HtmlService: {
      createHtmlOutput: (html) => {
        captured.html = html;
        return { setTitle: (t) => { captured.title = t; return { __out: true }; } };
      }
    }
  };
  /* _frame is the shared wrapper; the real one adds the outer chrome. */
  sandbox._frame = (o) => o;

  const vm = require('vm');
  vm.createContext(sandbox);
  const start = CODE.indexOf('function renderMissingPagePage_(');
  const end = CODE.indexOf('\n}\n', start) + 3;
  vm.runInContext(CODE.slice(start, end), sandbox, { filename: 'renderMissingPagePage_' });

  const out = sandbox.renderMissingPagePage_(
    'التقييمات', 'Company_Assessment_Assessments', 'https://x/exec?action=ERPDashboard');

  check(!!out, 'it returns something rather than throwing');
  check(typeof captured.html === 'string' && captured.html.indexOf('<!DOCTYPE html>') === 0,
    'it produced a complete HTML document');
  check(captured.html.indexOf('dir="rtl"') !== -1, 'in RTL, like every other page');
  check(captured.html.indexOf('التقييمات') !== -1, 'naming the page the user asked for');
  check(captured.html.indexOf('Company_Assessment_Assessments.html') !== -1,
    'and the missing file, with its extension');
  check(captured.html.indexOf('https://x/exec?action=ERPDashboard') !== -1,
    'with a way back');
  check(typeof captured.title === 'string' && captured.title.length > 0,
    'and a window title', captured.title);

  /* the page title is user-supplied enough to be worth escaping */
  const evil = sandbox.renderMissingPagePage_(
    '<script>alert(1)</script>', 'X"><script>alert(2)</script>', 'back');
  check(captured.html.indexOf('<script>alert(1)</script>') === -1,
    'the page title is escaped, not injected');
  check(captured.html.indexOf('<script>alert(2)</script>') === -1,
    'and so is the template name');
  check(captured.html.indexOf('&lt;script&gt;') !== -1, 'both arrive escaped');
}

/* ══ 3. every registered template either exists or is deliberate ════════ */
console.log('\n3 — which registered pages have no file in this deployment\n');
{
  const registries = fs.readdirSync(ROOT).filter(f => /_Registry\.js$/.test(f));
  const missing = [];
  let total = 0;
  registries.forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const re = /\{\s*action:\s*'([a-z0-9_]+)'\s*,\s*template:\s*'([A-Za-z0-9_]+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      total++;
      if (!fs.existsSync(path.join(ROOT, m[2] + '.html'))) {
        missing.push({ action: m[1], template: m[2], registry: f });
      }
    }
  });
  check(total > 0, total + ' page entries name a template');

  if (missing.length) {
    console.log('\n        These render the missing-page screen rather than a stack trace:');
    missing.forEach(function (x) {
      console.log('          ' + x.action.padEnd(22) + ' -> ' + x.template + '.html');
    });
    console.log('');
  }

  /* This is REPORTED, not failed. The Assessment Center's templates are
     complete on feat/assessment-center-work and simply not merged here; failing
     the suite for that would be failing it for a branch topology, not a defect.
     The guard above is what makes the state survivable. */
  check(true, missing.length === 0
    ? 'every registered template has a file here'
    : missing.length + ' registered page(s) have no file here — reported, and each now ' +
      'renders a page that says which file is missing');
}

console.log('\n' + (failed === 0
  ? 'S22 — a missing template fails as a page, not as a stack trace.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
