/**
 * S23 — a URL parameter must come from the server, not from window.location.
 *
 * HtmlService serves every page inside a sandboxed iframe whose own URL is a
 * googleusercontent.com address carrying NONE of the caller's query string. So
 * `new URLSearchParams(window.location.search)` is empty in production, always.
 *
 * Session-bearing pages never noticed, because they fall back to
 * API.getSession() reading localStorage. Any OTHER parameter has no such
 * fallback and simply arrives blank. That is what made a candidate assessment
 * link report «رابط التقييم غير مكتمل» for a token that was in the URL the
 * whole time, and it silently broke two more Assessment pages the same way.
 *
 * doGet injects the real query string as `pageParams`. This checks every page
 * that reads a non-session parameter takes it from there — and RUNS the three
 * that were broken under a simulated iframe, where window.location.search is
 * empty, to prove the parameter still arrives.
 *
 * Run: node tools/verify/s23_page_params.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
}

/* ══ 1. doGet still injects it, for public pages too ════════════════════ */
console.log('\n1 — the server hands every page its real query string\n');
{
  const CODE = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
  check(/tmpl\.pageParams = JSON\.stringify\(e\.parameter \|\| \{\}\)/.test(CODE),
    'doGet injects e.parameter as pageParams');

  /* It must not sit inside the `if (!page.public)` block, or the one kind of
     page that CANNOT fall back to a session would be the one without it. */
  const gate = CODE.indexOf('if (!page.public) {');
  const inject = CODE.indexOf('tmpl.pageParams =');
  check(gate !== -1 && inject > gate, 'the injection is located after the auth gate');
  const between = CODE.slice(gate, inject);
  let depth = 0, closed = false;
  for (let i = between.indexOf('{'); i < between.length; i++) {
    if (between[i] === '{') depth++;
    else if (between[i] === '}') { depth--; if (depth === 0) { closed = true; break; } }
  }
  check(closed, 'and OUTSIDE it — a public page gets pageParams too, which is the ' +
    'whole point: it has no session to fall back on');
}

/* ══ 2. no page reads a non-session param from the iframe URL alone ═════ */
console.log('\n2 — no page depends on window.location for a parameter\n');
{
  const offenders = [];
  fs.readdirSync(ROOT).filter(f => /\.html$/.test(f)).sort().forEach(function (f) {
    const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const src = stripComments(raw);
    if (src.indexOf('window.location.search') === -1) return;

    const names = new Set();
    const re = /\.get\('([A-Za-z_][A-Za-z0-9_]*)'\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      /* sessionToken is exempt: every session page falls back to
         API.getSession(), so it survives an empty query string. */
      if (m[1] !== 'sessionToken') names.add(m[1]);
    }
    if (!names.size) return;

    /* Either it reads the server's copy, or it prefers a server-injected
       global (UIC._dtColKey uses window.CURRENT_ACTION that way). */
    const fromServer = /PAGE_PARAMS\s*=\s*<\?/.test(raw) || /window\.CURRENT_ACTION\s*\|\|/.test(src);
    if (!fromServer) offenders.push('        ' + f + ' — ' + Array.from(names).join(', '));
  });
  check(offenders.length === 0,
    'every page reading a non-session parameter takes it from the server',
    offenders.join('\n'));
}

/* ══ 3. the three that were broken, under a simulated iframe ════════════ */
console.log('\n3 — the parameter arrives when window.location.search is EMPTY\n');
{
  /* An iframe whose URL carries no query string — production, exactly. */
  function readParams(file, scriptletValue) {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    /* the block that DECLARES the params — a page may open with a small
       unrelated one (Take.html sets UIC_PUBLIC_PAGE before the includes) */
    const blocks = raw.match(/<script>[\s\S]*?<\/script>/g) || [];
    const block = blocks.filter(b2 => /PAGE_PARAMS\s*=/.test(b2))[0];
    if (!block) return null;
    let js = block.replace(/^<script>/, '').replace(/<\/script>$/, '');
    /* keep the top-level declarations only, stopping at the first top-level
       function DECLARATION — not at the first `function` keyword, which would
       slice through `params = { get: function (k) {...} }` */
    const cut = js.search(/[\r\n]\s{0,6}function [A-Za-z_]/);
    if (cut > 0) js = js.slice(0, cut);
    /* Order matters. pageParams is a BARE scriptlet (var X = <?!= … ?>;) and
       becomes the JSON. Every other scriptlet is usually already inside quotes
       ('<?!= getCompanyLogoUrl_() ?>'), so it is replaced together WITH its
       quotes — replacing just the scriptlet would leave '''' and a syntax
       error. Anything still bare after that becomes 0. */
    js = js.replace(/<\?!=\s*pageParams\s*\?>/g, scriptletValue)
           .replace(/'<\?[\s\S]*?\?>'/g, "''")
           .replace(/"<\?[\s\S]*?\?>"/g, '""')
           .replace(/<\?[\s\S]*?\?>/g, '0');
    const sb = {
      URLSearchParams: function () { return { get: function () { return null; } }; },
      window: { location: { search: '' } },
      API: { getSession: () => null },
      /* these declaration blocks also compute a few capability flags */
      UIC: { canAdd_: () => true, canFull_: () => true, canSee_: () => true },
      String, Number, Boolean, Object, Array, JSON, console, Date, Math
    };
    sb.window.API = sb.API;
    vm.createContext(sb);
    try { vm.runInContext(js, sb, { filename: file }); } catch (e) { return { __error: e.message }; }
    return sb;
  }

  /* -- the candidate link -- */
  {
    const TOKEN = '42e6e636-5de1-4e25-b802-11c15148e4f55e862d65-23bf-47aa-8552-f38b6654330e';
    const sb = readParams('Company_Assessment_Take.html', JSON.stringify({ action: 'ac_take', token: TOKEN }));
    check(sb && !sb.__error, 'Company_Assessment_Take.html evaluates', sb && sb.__error);
    check(sb && sb.TOKEN === TOKEN,
      'the candidate token arrives in full from the server (72 chars, two uuids)',
      'got ' + JSON.stringify(sb && sb.TOKEN));

    /* and with no token anywhere it is still blank, so the error still fires */
    const empty = readParams('Company_Assessment_Take.html', JSON.stringify({ action: 'ac_take' }));
    check(empty && empty.TOKEN === '', 'a link with no token still yields a blank token',
      JSON.stringify(empty && empty.TOKEN));
  }

  /* -- the authoring form -- */
  {
    const sb = readParams('Company_Assessment_AssessmentForm.html',
      JSON.stringify({ action: 'ac_assessment_form', id: 'ASM-42', autoprint: '1' }));
    check(sb && !sb.__error, 'Company_Assessment_AssessmentForm.html evaluates', sb && sb.__error);
    check(sb && sb.params && sb.params.get('id') === 'ASM-42',
      'the assessment id arrives — it used to be null, so an edit opened as a new one',
      JSON.stringify(sb && sb.params && sb.params.get('id')));
    check(sb && sb.params && sb.params.get('autoprint') === '1', 'and autoprint too');
    check(sb && sb.params && sb.params.get('nothing') === null,
      'a parameter that was not sent is still null');
  }

  /* -- the result view -- */
  {
    const sb = readParams('Company_Assessment_ResultView.html',
      JSON.stringify({ action: 'ac_result_view', assignment: 'ASG-7' }));
    check(sb && !sb.__error, 'Company_Assessment_ResultView.html evaluates', sb && sb.__error);
    check(sb && sb.params && sb.params.get('assignment') === 'ASG-7',
      "the assignment id arrives — a candidate's result used to open empty",
      JSON.stringify(sb && sb.params && sb.params.get('assignment')));
  }

  /* -- the pattern this followed -- */
  {
    const sb = readParams('Company_ValleyFoods_MfgOrderView.html',
      JSON.stringify({ action: 'vf_mfg_order_view', mo: 'MO-9', sessionToken: 'tok' }));
    check(sb && !sb.__error, 'Company_ValleyFoods_MfgOrderView.html evaluates', sb && sb.__error);
    check(sb && sb.PAGE_PARAMS && sb.PAGE_PARAMS.mo === 'MO-9',
      'the page that already did this keeps working');
  }
}

console.log('\n' + (failed === 0
  ? 'S23 — parameters come from the server, so they survive the iframe.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
