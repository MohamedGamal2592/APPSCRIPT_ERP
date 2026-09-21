'use strict';
/* Customs-office path correction: pure prefix-preview contract (offline).
 * Run: node tools/verify/customs_office_path_repair.js
 * Covers sheet `مكتب الجمارك`, cols `تكليف المطالبة` / `تخليص الشحنة` only.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('D:/Work/Script/Code.js', 'utf8') + '\n' +
  fs.readFileSync('D:/Work/Script/Company_TopChemical_Actions.js', 'utf8');
function grab(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  const next = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, next < 0 ? source.length : next);
}
const ctx = { console, Math, Number, String, Object, Array, Date, JSON, isNaN, isFinite, RegExp };
vm.createContext(ctx);
vm.runInContext(grab('customsOfficePathPreview_'), ctx);
const preview = ctx.customsOfficePathPreview_;
assert.ok(preview, 'preview helper must load');

// Route + registry wiring must exist.
assert.match(source, /'customs_office_path_repair':\s*\{\s*handler:\s*companyArtifactRoute_,\s*requireAuth:\s*true\s*\}/, 'repair route must be registered with auth');
assert.match(source, /tc_customs_office\s*:\s*\{[^}]*sheet:\s*'مكتب الجمارك'[^}]*folder:\s*'customs_office_Files_'/, 'registry must keep target folder');
assert.ok(source.indexOf('function customsOfficePathRepair_(') > 0, 'repair handler must exist');

// Blank cells -> blank, never rewritten.
assert.strictEqual(preview('').action, 'blank');
assert.strictEqual(preview('   ').action, 'blank');
assert.strictEqual(preview(null).action, 'blank');

// Already-correct paths unchanged.
assert.strictEqual(preview('customs_office_Files_/10.تكليف المطالبة.175015.jpg').action, 'already-correct');
assert.strictEqual(preview('customs_office_Files_/11.تخليص الشحنة.180215.pdf  ').action, 'already-correct', 'outer whitespace trimmed before classify');

// The two recognized legacy prefixes -> rewrite, filename byte-preserved.
const ex1 = 'مكتب الجمارك_Images/10.تكليف المطالبة.175015.jpg';
const r1 = preview(ex1);
assert.strictEqual(r1.action, 'rewrite', ex1);
assert.strictEqual(r1.newRef, 'customs_office_Files_/10.تكليف المطالبة.175015.jpg');
const ex2 = 'مكتب الجمارك_Files_/11.تخليص الشحنة.180215.pdf';
const r2 = preview(ex2);
assert.strictEqual(r2.action, 'rewrite', ex2);
assert.strictEqual(r2.newRef, 'customs_office_Files_/11.تخليص الشحنة.180215.pdf');
const ex3 = 'مكتب الجمارك_Images/11.تكليف المطالبة.175730.jpg';
assert.strictEqual(preview(ex3).newRef, 'customs_office_Files_/11.تكليف المطالبة.175730.jpg');
const ex4 = 'مكتب الجمارك_Files_/12.تخليص الشحنة.180335.pdf';
assert.strictEqual(preview(ex4).newRef, 'customs_office_Files_/12.تخليص الشحنة.180335.pdf');

// Inner spaces preserved exactly; no space introduced; never &#x20;.
const spaced = 'مكتب الجمارك_Files_/12.تخليص الشحنة 180335 .pdf';
const rs = preview(spaced);
assert.strictEqual(rs.action, 'rewrite');
assert.strictEqual(rs.newRef, 'customs_office_Files_/12.تخليص الشحنة 180335 .pdf');
assert.ok(rs.newRef.indexOf('&#x20;') === -1, 'must never emit &#x20;');
assert.strictEqual(rs.newRef.split('/').pop(), '12.تخليص الشحنة 180335 .pdf', 'filename must be intact');

// URLs / Drive IDs skipped, never rewritten.
assert.strictEqual(preview('https://drive.google.com/file/d/ABC123XYZ45678901234/view').action, 'skip');
assert.strictEqual(preview('A'.repeat(25)).action, 'skip');

// Formulas malformed, never rewritten.
assert.strictEqual(preview('=HYPERLINK("x")').action, 'malformed');
assert.strictEqual(preview('+foo').action, 'malformed');
assert.strictEqual(preview('-foo').action, 'malformed');
assert.strictEqual(preview('@foo').action, 'malformed');

// Malformed shapes.
assert.strictEqual(preview('barefile.pdf').action, 'malformed', 'bare filename has no prefix');
assert.strictEqual(preview('a/b/c.pdf').action, 'malformed', 'three segments rejected');
assert.strictEqual(preview('customs_office_Files_/').action, 'malformed', 'empty filename rejected');
assert.strictEqual(preview('مكتب الجمارك_Images/').action, 'malformed');

// Unknown folder prefixes -> unexpected, never rewritten.
assert.strictEqual(preview('Other_Files_/x.pdf').action, 'unexpected');
assert.strictEqual(preview('untrusted/file.pdf').action, 'unexpected');

// Idempotence: rewrite output re-classifies as already-correct.
assert.strictEqual(preview(r1.newRef).action, 'already-correct');
assert.strictEqual(preview(r2.newRef).action, 'already-correct');

// Handler safety properties (static, offline).
const handlerSrc = grab('customsOfficePathRepair_');
assert.match(handlerSrc, /isSuperAdmin/, 'handler must require superAdmin');
assert.match(handlerSrc, /dryRun/, 'handler must support dry-run');
assert.match(handlerSrc, /findDriveFolderIdByName_\(TARGET\)/, 'handler must verify target Drive folder first');
assert.match(handlerSrc, /executeWithLock_/, 'apply path must hold the script lock');
assert.match(handlerSrc, /Math\.min\(500/, 'batch must stay bounded');
assert.match(handlerSrc, /path_backup_/, 'apply path must capture a recoverable backup');
assert.match(handlerSrc, /missingInTarget/, 'missing physical files must block apply');
assert.match(handlerSrc, /getRange\(c\.row, c\.col\)\.setValue\(c\.newRef\)/, 'writes must target only the two in-scope columns');
assert.ok(handlerSrc.indexOf('&#x20;') === -1, 'handler must never contain &#x20;');

console.log('customs_office_path_repair: PASS (blank/already-correct/2 legacy prefixes/urls-ids/formulas/malformed/unknown/idempotent/locked+bounded+backup)');
