/**
 * Page boot — applies ONE wave of tools/pageboot/manifest.json.
 *
 *   node tools/pageboot/apply.js --wave N [--dry-run]
 *
 * --dry-run checks every step, prints what it would do, and writes nothing.
 *
 * All-or-nothing: every patch and copy is checked first; if any is not in the
 * state the plan was written against, NOTHING is written and the reason is
 * printed. A step that is already applied is reported as such and skipped, so
 * running the same wave twice is safe.
 *
 *   patch  exactly one occurrence of the find text (line endings follow the
 *          target file); already applied = find absent and replace present.
 *   copy   the target's content (line endings ignored) must hash to «before»;
 *          already applied = it already equals the new file.
 *   run    a node script, from the repository root, after the files.
 *
 * Exit 0 = the wave is in place. Exit 1 = nothing was changed; read the FAIL.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = __dirname;
const arg = process.argv.indexOf('--wave');
const wave = arg === -1 ? '' : String(process.argv[arg + 1] || '');
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const plan = manifest.waves[wave];
if (!plan) { console.error('usage: node tools/pageboot/apply.js --wave N   (N in ' + Object.keys(manifest.waves).join(', ') + ')'); process.exit(2); }

const lf = s => s.replace(/\r\n/g, '\n');
const sha = s => crypto.createHash('sha256').update(lf(s)).digest('hex');
const eolOf = s => (s.indexOf('\r\n') !== -1 ? '\r\n' : '\n');
const withEol = (s, eol) => lf(s).replace(/\n/g, eol);
const readRoot = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('wave ' + wave + ' — ' + plan.title);
const writes = [];      // { file, text }
const runs = [];
const pending = {};     // file -> text as it will be after earlier steps of this wave
let bad = 0;

plan.steps.forEach(function (step, i) {
  const label = '  step ' + (i + 1) + ' ' + step.type + ' ';
  if (step.type === 'patch') {
    const cur = pending[step.file] !== undefined ? pending[step.file] : readRoot(step.file);
    const eol = eolOf(cur);
    const find = withEol(fs.readFileSync(path.join(HERE, step.find), 'utf8'), eol);
    const repl = withEol(fs.readFileSync(path.join(HERE, step.replace), 'utf8'), eol);
    const nFind = cur.split(find).length - 1;
    const nRepl = cur.split(repl).length - 1;
    if (nFind === 1) {
      pending[step.file] = cur.replace(find, () => repl);
      console.log(label + step.file + ' (' + step.find + '): will apply');
    } else if (nFind === 0 && nRepl === 1) {
      console.log(label + step.file + ' (' + step.find + '): already applied');
    } else {
      bad++;
      console.log(label + step.file + ' (' + step.find + '): FAIL — find text found ' + nFind + ' time(s), replacement found ' + nRepl + ' time(s). The file is not in the state the plan expects. Stop and report.');
    }
  } else if (step.type === 'copy') {
    const target = path.join(ROOT, step.to);
    const src = fs.readFileSync(path.join(HERE, step.from), 'utf8');
    const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (cur !== null && sha(cur) === sha(src)) {
      console.log(label + step.to + ': already applied');
    } else if (cur !== null && sha(cur) === step.before) {
      pending[step.to] = withEol(src, eolOf(cur));
      console.log(label + step.to + ': will replace');
    } else {
      bad++;
      console.log(label + step.to + ': FAIL — the file changed since the plan was written (sha ' + (cur === null ? 'missing' : sha(cur)) + ', expected ' + step.before + '). Stop and report.');
    }
  } else if (step.type === 'run') {
    runs.push(step.cmd);
    console.log(label + 'node ' + step.cmd.join(' ') + ': will run');
  } else {
    bad++;
    console.log(label + ': FAIL — unknown step type');
  }
});

if (bad) { console.log('\nwave ' + wave + ': ' + bad + ' step(s) FAILED — nothing was changed.'); process.exit(1); }
if (process.argv.indexOf('--dry-run') !== -1) { console.log('\nwave ' + wave + ': dry run — every step is ready; nothing was written.'); process.exit(0); }

Object.keys(pending).forEach(function (f) { fs.writeFileSync(path.join(ROOT, f), pending[f]); console.log('  wrote ' + f); });
runs.forEach(function (cmd) { execFileSync(process.execPath, cmd, { cwd: ROOT, stdio: 'inherit' }); });
console.log('\nwave ' + wave + ': applied. Next: node tools/pageboot/check.js --wave ' + wave);
