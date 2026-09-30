/**
 * Compile every inline <script> of every Company_*.html page (scriptlets
 * blanked) and report the ones that do not parse. Local files only.
 * Run: node tools/liveviews/check_scripts.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
let bad = 0, n = 0;
fs.readdirSync(ROOT).filter(f => /^Company_.*\.html$/.test(f)).forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(src)) !== null) {
    i++;
    if (/\bsrc=/.test(m[0].slice(0, m[0].indexOf('>')))) continue;
    const body = m[1].replace(/<\?[\s\S]*?\?>/g, 'null');
    n++;
    try { new vm.Script(body, { filename: f + '#' + i }); }
    catch (e) { bad++; console.log('  FAIL  ' + f + '#' + i + ': ' + e.message); }
  }
});
console.log(n + ' inline scripts, ' + bad + ' do not parse');
process.exit(bad ? 1 : 0);
