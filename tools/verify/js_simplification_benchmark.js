/**
 * Offline benchmark and differential fixture for JS simplification Phase 3/4.
 *
 * Each measured variant runs in its own Node child process (`--variant`), after
 * warmup, for 30 repetitions over the same deterministic fixtures. The
 * candidate calls the same pure helper shipped to Apps Script; the sales
 * projection mirrors the production one-pass contract. This does not model
 * Apps Script service latency or heap limits.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'results', 'js_simplification_benchmark.json');
const REPS = 30;
const VARIANT = (process.argv.find(a => a.indexOf('--variant=') === 0) || '').slice(10) || null;

function fixture(n) {
  const batches = [];
  for (let i = 0; i < n; i++) batches.push({ BatchID: i % 37 === 0 ? 'دفعة|' + i : 'B' + i });
  const assignments = [];
  for (let i = 0; i < n * 5; i++) assignments.push({
    BatchID: i % 19 === 0 ? 'دفعة|' + (i % n) : 'B' + (i % n),
    Status: i % 7 === 0 ? 'Invited' : 'Completed'
  });
  const questions = [];
  for (let i = 0; i < n; i++) questions.push({ QuestionID: i % 41 === 0 ? '' : 'Q' + i });
  const scored = [];
  for (let i = 0; i < n * 5; i++) scored.push({ QuestionID: 'Q' + (i % n), Score: i % 11, Max: 10 });
  const sales = [];
  for (let i = 0; i < n * 2; i++) sales.push({
    invoice_unique_id: 'I' + i,
    'رقم الفاتورة': String(i), 'اسم العميل': i % 29 === 0 ? 'عميل عربي' : 'Customer ' + i,
    'تاريخ الفاتورة': i % 17 === 0 ? 'not-a-date' : new Date(2026, i % 12, (i % 27) + 1),
    'المبلغ الصافي': i, 'قيمة الضريبة': i / 10, 'إجمالي': i * 1.1,
    tax_system: i % 2 ? ' STANDARD ' : 'TABLE', approval_status: i % 3 ? 'Pending' : 'Approved'
  });
  return { batches, assignments, questions, scored, sales };
}

function loadAlgorithms() {
  const sandbox = { Set, Map, Array, Object, String };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Company_Assessment_Actions.js'), 'utf8'), sandbox);
  return sandbox.ERPReadAlgorithms_;
}

function baselineAlgorithms(f) {
  let comparisons = 0;
  const invited = f.batches.map(b => f.assignments.some(a => {
    comparisons++;
    return a.BatchID === b.BatchID && a.Status === 'Invited';
  }));
  const firstScores = f.questions.map(q => {
    const items = f.scored.filter(it => { comparisons++; return it.QuestionID === q.QuestionID; });
    return items[0] || {};
  });
  return { invited, firstScores, comparisons, retainedIndexEntries: 0 };
}

function candidateAlgorithms(f) {
  const algo = loadAlgorithms();
  const invitedSet = algo.invitedBatchMembership(f.assignments);
  const invited = f.batches.map(b => invitedSet.has(b.BatchID));
  const scoreIndex = algo.firstScoreIndex(f.scored);
  const firstScores = f.questions.map(q => scoreIndex.get(q.QuestionID) || {});
  return { invited, firstScores, comparisons: f.assignments.length + f.scored.length, retainedIndexEntries: invitedSet.size + scoreIndex.size };
}

function project(r, i) {
  return {
    invoice_unique_id: r.invoice_unique_id, 'رقم الفاتورة': r['رقم الفاتورة'], 'اسم العميل': r['اسم العميل'],
    'تاريخ الفاتورة': r['تاريخ الفاتورة'], 'المبلغ الصافي': Number(r['المبلغ الصافي']) || 0,
    'قيمة الضريبة': Number(r['قيمة الضريبة']) || 0, 'إجمالي': Number(r['إجمالي']) || 0,
    tax_system: String(r.tax_system || '').trim().toLowerCase(), approval_status: r.approval_status || 'Pending', 'مسلسل': i + 1
  };
}
function baselineSales(rows) {
  const slim = rows.map(project).sort(() => 0);
  slim.forEach((s, i) => { s._sheetRow = i + 2; });
  slim.sort((a, b) => a._sheetRow - b._sheetRow);
  slim.forEach((s, i) => { s['مسلسل'] = i + 1; delete s._sheetRow; });
  return slim;
}
function candidateSales(rows) { return rows.map(project); }

function workload(size, variant) {
  const f = fixture(size);
  const a = variant === 'candidate' ? candidateAlgorithms(f) : baselineAlgorithms(f);
  const before = process.memoryUsage();
  const sales = variant === 'candidate' ? candidateSales(f.sales) : baselineSales(f.sales);
  const after = process.memoryUsage();
  const payload = JSON.stringify({ a, sales });
  return {
    comparisons: a.comparisons,
    projectedObjects: sales.length,
    retainedIndexEntries: a.retainedIndexEntries,
    payloadBytes: Buffer.byteLength(payload, 'utf8'),
    heapDeltaBytes: Math.max(0, after.heapUsed - before.heapUsed),
    rssBytes: after.rss
  };
}
function once(size, variant) {
  const t0 = process.hrtime.bigint();
  const metrics = workload(size, variant);
  metrics.elapsedNs = Number(process.hrtime.bigint() - t0);
  return metrics;
}
function summarize(samples) {
  const sorted = samples.map(s => s.elapsedNs).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)];
  const avg = key => samples.reduce((n, s) => n + s[key], 0) / samples.length;
  return {
    medianMs: median / 1e6, p95Ms: p95 / 1e6,
    comparisons: avg('comparisons'), projectedObjects: avg('projectedObjects'),
    retainedIndexEntries: avg('retainedIndexEntries'), payloadBytes: avg('payloadBytes'),
    sampledHeapDeltaBytes: avg('heapDeltaBytes'), sampledRssBytes: avg('rssBytes')
  };
}
function child() {
  const sizes = [0, 10, 1000];
  const out = {};
  for (const size of sizes) {
    for (let i = 0; i < 5; i++) once(size, VARIANT);
    const samples = []; for (let i = 0; i < REPS; i++) samples.push(once(size, VARIANT));
    out[size] = summarize(samples);
  }
  process.stdout.write(JSON.stringify({ variant: VARIANT, node: process.version, out }));
}
function parent() {
  const all = {};
  for (const variant of ['baseline', 'candidate']) {
    all[variant] = JSON.parse(execFileSync(process.execPath, [__filename, '--variant=' + variant], { encoding: 'utf8' }));
  }
  const small = fixture(17);
  const ba = baselineAlgorithms(small), ca = candidateAlgorithms(small);
  const bs = baselineSales(small.sales), cs = candidateSales(small.sales);
  if (JSON.stringify(ba.invited) !== JSON.stringify(ca.invited) || JSON.stringify(ba.firstScores) !== JSON.stringify(ca.firstScores) || JSON.stringify(bs) !== JSON.stringify(cs)) {
    throw new Error('differential fixture mismatch');
  }
  const result = { recordedAt: new Date().toISOString(), node: process.version, repetitions: REPS, fixtures: ['empty', 'small', 'representative', 'duplicate IDs', 'blank keys', 'Arabic text', 'delimiter values', 'mixed dates', 'wide-row-compatible projection'], variants: all, differential: { pass: true, sampleSize: 17 }, limitations: ['local Node child-process measurements; no Apps Script service latency or heap claim'] };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log('benchmark written: ' + OUT);
  console.log(JSON.stringify(result, null, 2));
}
if (VARIANT) child(); else parent();

