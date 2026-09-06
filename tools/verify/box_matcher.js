/**
 * Box analysis — matcher checks (BOX_ANALYSIS_PLAN.md §5).
 *
 *   node tools/verify/box_matcher.js            asserts, exits non-zero on failure
 *   node tools/verify/box_matcher.js --show     prints the full score table
 *
 * The score table is the point of this file as much as the assertions are. A
 * matching threshold that nobody can see is a threshold nobody can tune, and
 * the person who eventually has to tune this one will not have the fixtures in
 * their head — they will have a page that merged two things a reviewer says are
 * different. So every fixture pair prints its four components and its total,
 * against the threshold in force.
 *
 * The corpus is the fixture corpus, which is one real string and a pile of
 * synthetic ones. IDF over ~30 distinct texts is not IDF over a year of
 * production rows. Treat the numbers as a regression baseline, not as evidence
 * about production.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'Box_Analysis_Engine.js'));
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'box_details.json'), 'utf8'));

const SHOW = process.argv.indexOf('--show') !== -1;

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { if (SHOW) console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}

/* ── 1. Stemming, in isolation ─────────────────────────────────────────────
 * The two guards that matter are the ones that DON'T strip. A stemmer that
 * turns زيتون into زيت merges olives with oil, and معجون into معج merges paste
 * with nothing recognisable. Both words are in this vocabulary. */
console.log('stemAr');
[
  ['السلك',    'سلك',    'ال prefix stripped'],
  ['اللحام',   'لحام',   'ال prefix stripped'],
  ['صامولات',  'صامول',  'ات suffix stripped'],
  ['صاموله',   'صامول',  'ه suffix stripped — the same stem as the plural'],
  ['معجون',    'معجون',  'NOT stripped: ون would leave 3 chars, below MIN_STEM'],
  ['زيتون',    'زيتون',  'NOT stripped: زيت would be a different product'],
  ['زيت',      'زيت',    'too short to strip anything'],
  ['ال',       'ال',     'nothing left if stripped, so nothing is'],
  ['سلك',      'سلك',    'unchanged']
].forEach(function (c) {
  const got = E.stemAr(E.normAr(c[0]));
  ok(got === E.normAr(c[1]), 'stemAr("' + c[0] + '") = "' + c[1] + '"  [' + c[2] + ']', '"' + got + '"');
});

/* ── 2. Unit compatibility ─────────────────────────────────────────────── */
console.log('\nunitCompatible');
ok(E.unitCompatible('كيلو', 'كيلو') === 1, 'same unit = 1');
ok(E.unitCompatible('كيلو', 'جرام') === 0.8, 'same dimension (mass) = 0.8');
ok(E.unitCompatible('كيلو', 'لتر') === 0, 'mass vs volume = 0');
ok(E.unitCompatible(null, 'كيلو') === 0.5, 'unknown = 0.5, NOT 1 — "we do not know" is not agreement');
ok(E.unitCompatible(null, null) === 0.5, 'both unknown = 0.5');

/* ── 3. Build the corpus ───────────────────────────────────────────────────
 * Every item text the parser produces from every fixture, plus both sides of
 * every match pair. Occurrences (not distinct texts) go in, so the frequency
 * counts and the IDF denominators are built the same way the page builds
 * them. */
const corpus = [];
FIX.cases.forEach(function (c) {
  E.parseDetails(c.text).items.forEach(function (it) {
    corpus.push({ item_norm: it.item_norm, unit: it.unit });
  });
});
FIX.match_pairs.forEach(function (p) {
  corpus.push({ item_norm: E.normAr(p.a), unit: null });
  corpus.push({ item_norm: E.normAr(p.b), unit: null });
});

const idx = E.buildMatchIndex(corpus);
console.log('\ncorpus: ' + corpus.length + ' item occurrences → ' + idx.N + ' distinct texts');

/* ── 4. The score table ────────────────────────────────────────────────────
 * Printed ALWAYS, not only under --show. It is the tuning record. */
console.log('\n─── pair scores against threshold ' + E.MATCH.THRESHOLD +
  '   (weights dice ' + E.MATCH.W_DICE + ' / lev ' + E.MATCH.W_LEV +
  ' / trigram ' + E.MATCH.W_TRIGRAM + ' / unit ' + E.MATCH.W_UNIT + ')');
console.log('  want  id              dice    lev     tri     unit    SCORE   verdict');

const rows = [];
FIX.match_pairs.forEach(function (p) {
  const a = idx.nodes[idx.byNorm[E.normAr(p.a)]];
  const b = idx.nodes[idx.byNorm[E.normAr(p.b)]];
  if (!a || !b) { ok(false, 'pair ' + p.id + ': both sides are in the corpus'); return; }
  const identical = a.i === b.i;
  const s = identical
    ? { score: 1, dice: 1, lev: 1, trigram: 1, unit: 1 }
    : E.matchScore(a, b, idx);
  const over = s.score >= E.MATCH.THRESHOLD;
  rows.push({ p: p, s: s, over: over, identical: identical });
  const f = function (v) { return String(v.toFixed(4)).padEnd(8); };
  console.log('  ' + (p.same ? 'SAME ' : 'DIFF ') + ' ' + p.id.padEnd(16) +
    f(s.dice) + f(s.lev) + f(s.trigram) + f(s.unit) + f(s.score) +
    (identical ? 'identical after normAr' : (over ? 'over' : 'under')));
});
console.log('');
rows.forEach(function (r) {
  if (r.identical) {
    ok(r.p.same, r.p.id + ': identical after normAr, so it can only be a SAME pair', r.p.why);
    return;
  }
  ok(r.over === r.p.same,
    'pair ' + r.p.id + ' scores ' + (r.p.same ? 'over' : 'under') + ' the threshold  [' + r.p.why + ']',
    'score ' + r.s.score);
});

/* ── 5. The same verdicts, through the real clustering path ────────────────
 * Scoring a pair in isolation and clustering a whole corpus are not the same
 * test. Clustering is single-link: A merges with B and B with C puts A and C
 * together even though nothing ever compared them. That is exactly how a
 * matcher quietly swallows a product family, so the pairs are asserted again
 * against the clusters that actually come out. */
console.log('clusterItems');
const res = E.clusterItems(corpus);
console.log('  ' + idx.N + ' distinct texts → ' + res.clusters.length + ' clusters');
FIX.match_pairs.forEach(function (p) {
  const ca = res.byNorm[E.normAr(p.a)];
  const cb = res.byNorm[E.normAr(p.b)];
  ok((ca === cb) === p.same,
    'cluster ' + p.id + ': "' + p.a + '" and "' + p.b + '" ' + (p.same ? 'together' : 'apart'),
    'clusters ' + ca + ' / ' + cb);
});

if (SHOW) {
  console.log('\n  clusters, largest first:');
  res.clusters.forEach(function (c) {
    console.log('    [' + c.occurrence_count + '×] ' + c.label +
      (c.member_count > 1 ? '   ← ' + c.members.slice(1).join('  |  ') : ''));
  });
}

/* ── 6. The reviewer's override always wins (plan §5.3) ──────────────────── */
console.log('\naliases — the human override');
const forcedMerge = E.clusterItems(corpus, {
  aliases: { merge: [['معجون شروخ', 'سلك لحام زهر']] }
});
ok(forcedMerge.byNorm[E.normAr('معجون شروخ')] === forcedMerge.byNorm[E.normAr('سلك لحام زهر')],
  'a reviewer merge joins two clusters the score would never have joined');

const forcedSplit = E.clusterItems(corpus, {
  aliases: { split: [['معجون شروخ', 'شروخ معجون']] }
});
ok(forcedSplit.byNorm[E.normAr('معجون شروخ')] !== forcedSplit.byNorm[E.normAr('شروخ معجون')],
  'a reviewer split keeps apart two texts with an IDENTICAL item_key');

console.log(failures === 0
  ? '\nAll matcher checks pass.'
  : '\n' + failures + ' matcher check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
