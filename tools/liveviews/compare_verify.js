// Compares two `npm run verify` outputs check by check.
// Usage: node tools/liveviews/compare_verify.js <baseline.txt> <head.txt>
'use strict';
var fs = require('fs');
function parse(file) {
  var lines = fs.readFileSync(file, 'utf8').split('\n');
  var out = {}; var cur = null; var prev = null;
  lines.forEach(function (l) {
    var m = /^── (\S+)/.exec(l);
    if (m) { cur = m[1]; var n = 2; while (cur in out || cur === prev) { cur = m[1] + "#" + n++; } prev = cur; return; }
    if (cur && /^\s+OK\s*$/.test(l)) { out[cur] = 'OK'; cur = null; }
    else if (cur && /^\s+FAILED\s*$/.test(l)) { out[cur] = 'FAILED'; cur = null; }
  });
  return out;
}
var a = parse(process.argv[2]); var b = parse(process.argv[3]);
var fa = Object.keys(a).filter(function (k) { return a[k] === 'FAILED'; });
var fb = Object.keys(b).filter(function (k) { return b[k] === 'FAILED'; });
var added = Object.keys(b).filter(function (k) { return !(k in a); });
var newFail = fb.filter(function (k) { return a[k] !== 'FAILED'; });
var fixed = fa.filter(function (k) { return b[k] === 'OK'; });
console.log('baseline: ' + Object.keys(a).length + ' checks, ' + fa.length + ' failed');
console.log('head:     ' + Object.keys(b).length + ' checks, ' + fb.length + ' failed');
console.log('added checks: ' + (added.join(', ') || '(none)'));
console.log('NEW FAILURES: ' + (newFail.join(', ') || '(none)'));
console.log('now passing:  ' + (fixed.join(', ') || '(none)'));
process.exit(newFail.length ? 1 : 0);
