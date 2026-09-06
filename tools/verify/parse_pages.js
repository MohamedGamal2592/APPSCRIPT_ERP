/**
 * Parse-check the inline <script> blocks of .html templates.
 *
 * Apps Script templates are not modules and never see a bundler, so a syntax
 * error in one of them is discovered by a user opening the page. This is the
 * cheapest guard available offline.
 *
 *   node tools/verify/parse_pages.js [file.html ...]
 *
 * With no arguments it checks every file this run touches.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

const DEFAULTS = [
  'UI_Components.html',
  'Company_ValleyFoods_MfgOrderView.html',
  'Company_ValleyFoods_MfgOrders.html',
  'Company_ValleyFoods_Purchasing.html',
  'Company_ValleyFoods_Sales.html',
  'design_preview/vf_mfg_batch.html'
];

const files = process.argv.slice(2);
const targets = files.length ? files : DEFAULTS;

let failed = 0;
targets.forEach(function (rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.log('  SKIP  ' + rel + ' (not found)');
    return;
  }
  const src = fs.readFileSync(abs, 'utf8');
  const isTemplate = rel.split('\\').join('/').indexOf('design_preview/') === -1;
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m, n = 0, bad = 0;
  while ((m = re.exec(src)) !== null) {
    n++;
    /* Apps Script templating: <?= x ?> / <?!= x ?> / <? ... ?> are substituted
       server-side before the browser ever sees the page, so they are not JS.
       Replace each with a harmless literal of the same shape so the surrounding
       real JavaScript can still be parsed.
       design_preview/ pages are plain HTML opened from disk, never templates —
       substituting there would mangle their own '<?' string literals. */
    const body = isTemplate ? m[1].replace(/<\?[\s\S]*?\?>/g, '0') : m[1];
    if (!body.trim()) continue;
    /* Line number of this block's start, so an error points somewhere real. */
    const line = src.slice(0, m.index).split('\n').length;
    try {
      new vm.Script(body, { filename: rel + ' (script block at line ' + line + ')' });
    } catch (e) {
      bad++; failed++;
      console.log('  FAIL  ' + rel + ' block ' + n + ' (line ' + line + '): ' + e.message);
    }
  }
  if (!bad) console.log('  PASS  ' + rel + ' — ' + n + ' script block(s) parse');
});

console.log('\n' + (failed === 0 ? 'All inline scripts parse.' : failed + ' block(s) FAILED to parse'));
process.exit(failed === 0 ? 0 : 1);
