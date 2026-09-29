/*
 * Company two-file boundary.
 *
 * This is intentionally a structural/offline check. It does not execute Apps
 * Script services. The allowlist is limited to the four lazy registration
 * calls and the company IDs used by those calls; all company behavior must be
 * reached through an Actions hook instead of being embedded in Code.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const COMPANIES = ['Assessment', 'TopChemical', 'TopLight', 'ValleyFoods'];
const REQUIRED = new Set([
  'Code.js',
  ...COMPANIES.flatMap(function (name) {
    return ['Company_' + name + '_Actions.js', 'Company_' + name + '_Registry.js'];
  })
]);

/* These are source filenames, not implementation allowlists. They are built
 * from fragments so this verifier does not match itself when scanning callers. */
const OBSOLETE = [
  ['JS_Simplification', 'Helpers.js'],
  ['Theme', '_Builders.js'],
  ['Box_Analysis', '_Engine.js'],
  ['DbLive', '_Connector.js'],
  ['Code', '_Telemetry.js'],
  ['TEMP_Firestore', 'Authorization.js'],
  ['00', '_Config.js'], ['01', '_Registry.js'],
  ['02', '_DataAccess.js'], ['02', '_Firestore.js'],
  ['02', '_StorageConfig.js'], ['02', '_SystemSchema.js'],
  ['02', '_SystemStore.js'], ['03', '_Security.js'],
  ['05', '_Admin.js'], ['07', '_Backup.js'],
  ['08', '_Staging.js'], ['09', '_Inventory.js'],
  ['10', '_Retention.js'], ['11', '_DailyBackup.js'],
  ['99', '_AuditTools.js']
].map(function (parts) { return parts.join(''); });

const IO_MARKERS = [
  'SpreadsheetApp', 'DriveApp', 'Jdbc', 'UrlFetchApp', 'CacheService',
  'PropertiesService', 'Firestore', 'Logger', 'ScriptApp', 'Utilities'
];

function read(name) { return fs.readFileSync(path.join(ROOT, name), 'utf8'); }
function rootJs() {
  return fs.readdirSync(ROOT).filter(function (name) {
    return name.endsWith('.js') && fs.statSync(path.join(ROOT, name)).isFile();
  }).sort();
}
function fail(message) { throw new Error(message); }

const files = rootJs();
const expectedCompanyFiles = Array.from(REQUIRED).filter(function (name) { return name !== 'Code.js'; }).sort();
assert.deepStrictEqual(
  files.filter(function (name) { return name.startsWith('Company_') && name.endsWith('.js'); }).sort(),
  expectedCompanyFiles,
  'root Company_*.js deployment set must contain exactly one Actions and one Registry per company'
);
assert.deepStrictEqual(files, Array.from(REQUIRED).sort(), 'root deployed JavaScript set must be exactly nine files');

COMPANIES.forEach(function (company) {
  const actions = 'Company_' + company + '_Actions.js';
  const registry = 'Company_' + company + '_Registry.js';
  assert.ok(files.includes(actions), 'missing ' + actions);
  assert.ok(files.includes(registry), 'missing ' + registry);
  const source = read(registry);
  IO_MARKERS.forEach(function (marker) {
    assert.ok(!new RegExp('\\b' + marker.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\b').test(source),
      registry + ' contains I/O marker ' + marker);
  });
  const executable = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/\bfunction\s*\(/.test(executable), registry + ' contains an inline executable function');
  assert.ok(!/=>/.test(executable), registry + ' contains an executable arrow function');
  assert.ok(!/\b(?:SpreadsheetApp|DriveApp|Jdbc|UrlFetchApp|CacheService|PropertiesService)\b/.test(executable),
    registry + ' contains service access');
});

/* Active source/tooling references to a retired root module are forbidden.
 * Plans, result reports, and this verifier may describe the migration. */
const scanRoots = [ROOT, path.join(ROOT, 'tools')];
const scanFiles = [];
scanRoots.forEach(function (dir) {
  if (!fs.existsSync(dir)) return;
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop();
    fs.readdirSync(current, { withFileTypes: true }).forEach(function (entry) {
      const full = path.join(current, entry.name);
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.codex' || entry.name === 'apps_script_maintenance' || entry.name === 'src_html' || entry.name === 'Backup' || entry.name === 'design_preview') return;
      if (entry.isDirectory()) pending.push(full);
      else if (/\.(?:js|json)$/.test(entry.name)) scanFiles.push(full);
    });
  }
});
const uniqueScanFiles = Array.from(new Set(scanFiles));
OBSOLETE.forEach(function (name) {
  uniqueScanFiles.forEach(function (file) {
    if (file === __filename) return;
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes(name)) fail('obsolete source filename is still referenced: ' + name + ' in ' + path.relative(ROOT, file));
  });
});

/* Code.js is allowed to know generic company-registry/bootstrap vocabulary,
 * but not company page IDs, sheet names, IDs, or implementation prefixes. */
const code = read('Code.js');
const codeForScan = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const forbiddenSharedMarkers = [
  '3fe1b5cb67b7223e', '8df5c89a117fe9a5', '9940659bd83035d7', '32fafd256ccb7a1c',
  'tc_', 'tl_', 'vf_', 'assessment_'
];
forbiddenSharedMarkers.forEach(function (marker) {
  assert.ok(!codeForScan.includes(marker), 'non-allowlisted company identifier remains in Code.js: ' + marker);
});

console.log('Company two-file boundary: OK');
