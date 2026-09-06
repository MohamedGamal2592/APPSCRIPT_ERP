/**
 * Box analysis — parser checks (BOX_ANALYSIS_PLAN.md §4).
 *
 *   node tools/verify/box_parser.js            asserts, exits non-zero on failure
 *   node tools/verify/box_parser.js --show     also prints every parsed segment
 *
 * There is no browser and no database reachable from here, so this is the only
 * thing that actually EXECUTES the parser before it ships. It runs under plain
 * `node` with no Apps Script globals, which is the whole reason
 * Box_Analysis_Engine.js is a separate file from the actions file.
 *
 * READ THE COVERAGE NUMBER WITH CARE. Exactly one fixture is a real production
 * string. A 100% pass here says the parser handles the failure modes somebody
 * thought of; it says nothing about how often those modes occur in the live
 * table. That measurement needs DB access and is a blocked-on-owner item.
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

function near(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-6;
}

/* ── 1. normAr, in isolation ───────────────────────────────────────────────
 * Asserted separately from parseDetails so a normalization break points at the
 * normalizer rather than at whichever parse happens to notice it first. */
console.log('normAr');
const NORM_CASES = [
  ['٥ كيلو',                    '5 كيلو',            'Arabic-Indic digits'],
  ['٩٢٥٫٥٠',                    '925.50',            'Arabic decimal separator U+066B'],
  ['١٬٥٠٠',                     '1500',              'Arabic thousands separator U+066C'],
  ['بـ 700',                    'ب 700',             'tatweel stripped, so بـ becomes ب'],
  ['مَعْجُون',                     'معجون',              'tashkeel stripped'],
  ['شـــروخ',                    'شروخ',              'tatweel inside a word'],
  ['الأمونيوم',                  'الامونيوم',          'أ → ا'],
  ['طبة',                       'طبه',               'ة → ه'],
  ['صناعى',                     'صناعي',             'ى → ي'],
  ['مسؤول',                     'مسوول',             'ؤ → و'],
  ['قائمة',                     'قايمه',             'ئ → ي and ة → ه'],
  ['نص كيلو  كيلو سلك',          'نص كيلو سلك',        'consecutive duplicate token collapse (from the real string)'],
  ['(معجون شروخ) ، تنر',         'معجون شروخ تنر',     'brackets and the Arabic comma become spaces'],
  ['كيلو كيلو كيلو',             'كيلو',              'a run of three collapses to one'],
  ['معجون + معجون',              'معجون + معجون',      'NOT consecutive — the separator sits between them'],
  ['',                          '',                  'empty'],
  [null,                        '',                  'null']
];
NORM_CASES.forEach(function (c) {
  const got = E.normAr(c[0]);
  ok(got === c[1], 'normAr: ' + c[2], JSON.stringify({ in: c[0], want: c[1], got: got }));
});

/* ── 2. Quantity words resolve to numbers ─────────────────────────────────
 * Without this, a "نص كيلو" purchase and a "1 كيلو" purchase have unit prices
 * that cannot be compared, and every price rule downstream is noise. */
console.log('\ntakeQuantity');
[['نص', 0.5], ['نصف', 0.5], ['ربع', 0.25], ['تلت', 1 / 3], ['ثلث', 1 / 3],
 ['تمن', 0.125], ['5', 5], ['0.25', 0.25]].forEach(function (c) {
  const got = E.takeQuantity(E.normAr(c[0]) + ' حاجة').value;
  ok(near(got, c[1]), 'takeQuantity("' + c[0] + '") = ' + c[1], got);
});
ok(E.takeQuantity('معجون شروخ').value === null, 'takeQuantity returns null when there is no quantity');

/* ── 3. The price marker is a standalone ب, never a word that starts with ب ── */
console.log('\ntakePrice');
ok(E.takePrice(E.normAr('5 كيلو معجون شروخ ب 700')).price === 700, 'ب at the end');
ok(E.takePrice(E.normAr('5 كيلو معجون شروخ ب700')).price === 700, 'ب glued to the digits');
ok(E.takePrice(E.normAr('5 كيلو معجون شروخ بـ 700')).price === 700, 'بـ (tatweel)');
ok(E.takePrice(E.normAr('5 كيلو معجون شروخ = 700')).price === 700, '= as the marker');
ok(E.takePrice(E.normAr('2 لتر بويه بيضا ب 240')).price === 240,
  'بويه does NOT read as a price marker');
ok(E.takePrice(E.normAr('2 لتر بويه بيضا ب 240')).rest === E.normAr('2 لتر بويه بيضا'),
  'the item text survives the price extraction intact');
ok(E.takePrice(E.normAr('طبة حديد')) === null, 'no price → null, never a guessed number');
ok(E.takePrice(E.normAr('طبة حديد 25')) === null,
  'a trailing bare number is NOT taken as a price — guessing here is what makes the sum check lie');

/* ── 4. item_key is order-invariant ───────────────────────────────────────── */
console.log('\nitemKey');
ok(E.itemKey(E.normAr('معجون شروخ')) === E.itemKey(E.normAr('شروخ معجون')),
  'flipped word order produces one key');
ok(E.itemKey(E.normAr('سلك سلك لحام')) === E.itemKey(E.normAr('لحام سلك')),
  'duplicate tokens are deduped into the key');
ok(E.itemKey(E.normAr('معجون شروخ')) !== E.itemKey(E.normAr('سلك لحام')),
  'different items do not collide');

/* ── 5. The fixture corpus ────────────────────────────────────────────────── */
console.log('\nparseDetails — fixture corpus');
const stats = { real: { n: 0, seg: 0, parsed: 0, failed: 0 }, synthetic: { n: 0, seg: 0, parsed: 0, failed: 0 } };

FIX.cases.forEach(function (c) {
  const r = E.parseDetails(c.text);
  const bucket = stats[c.origin];
  bucket.n++;
  bucket.seg += r.segment_count;
  bucket.parsed += r.parsed_count;
  bucket.failed += r.failed_count;

  const x = c.expect || {};
  const tag = '[' + c.origin + '] ' + c.id;

  ok(r.parsed_count === x.parsed_count, tag + ': parsed_count = ' + x.parsed_count, r.parsed_count);
  ok(r.failed_count === x.failed_count, tag + ': failed_count = ' + x.failed_count, r.failed_count);
  ok(near(r.sum, x.sum), tag + ': sum = ' + x.sum, r.sum);

  (x.items || []).forEach(function (want, i) {
    const got = r.items[i];
    if (!got) { ok(false, tag + ': item ' + i + ' exists'); return; }
    ok(near(got.qty, want.qty), tag + ' item ' + i + ': qty = ' + want.qty, got.qty);
    ok((got.unit || null) === (want.unit || null), tag + ' item ' + i + ': unit = ' + want.unit, got.unit);
    ok(got.item_norm === want.item_norm, tag + ' item ' + i + ': item = "' + want.item_norm + '"', '"' + got.item_norm + '"');
    ok(near(got.price, want.price), tag + ' item ' + i + ': price = ' + want.price, got.price);
    ok(near(got.unit_price, want.unit_price), tag + ' item ' + i + ': unit_price = ' + want.unit_price, got.unit_price);
  });

  (x.failures || []).forEach(function (want, i) {
    const got = r.failures[i];
    if (!got) { ok(false, tag + ': failure ' + i + ' exists'); return; }
    ok(got.reason === want.reason, tag + ' failure ' + i + ': reason = ' + want.reason, got.reason);
    ok(!!got.reason_ar, tag + ' failure ' + i + ' carries an Arabic reason');
  });

  if (x.max_confidence !== undefined && r.items.length) {
    ok(r.items[0].confidence <= x.max_confidence,
      tag + ': confidence drops to <= ' + x.max_confidence, r.items[0].confidence);
  }

  if (SHOW) {
    console.log('\n  ' + tag + '  ' + (c.failure_mode || c.note || ''));
    console.log('    in   : ' + c.text);
    console.log('    norm : ' + r.norm);
    r.items.forEach(function (it) {
      console.log('    item : qty=' + fmtq(it.qty) + '  unit=' + (it.unit || '—') +
        '  item="' + it.item_norm + '"  price=' + it.price +
        '  unit_price=' + (it.unit_price === null ? '—' : it.unit_price) +
        '  conf=' + it.confidence);
      console.log('           key="' + it.item_key + '"');
    });
    r.failures.forEach(function (f) {
      console.log('    FAIL : "' + f.segment + '"  → ' + f.reason + ' (' + f.reason_ar + ')');
    });
    console.log('    sum  : ' + r.sum + '   coverage: ' + (r.coverage === null ? 'n/a' : (r.coverage * 100).toFixed(1) + '%'));
  }
});

function fmtq(q) { return q === null ? '—' : (Math.round(q * 10000) / 10000); }

/* ── 6. Segments are never silently dropped ───────────────────────────────
 * The invariant the sum check depends on: every non-empty segment ends up in
 * exactly one of items[] or failures[]. Asserted structurally rather than
 * case by case, because it is the property that matters, not the count. */
console.log('\ninvariants');
FIX.cases.forEach(function (c) {
  const r = E.parseDetails(c.text);
  const nonEmpty = E.normAr(c.text).split('+').filter(function (s) { return s.trim(); }).length;
  ok(r.parsed_count + r.failed_count === nonEmpty,
    'every non-empty segment of ' + c.id + ' is accounted for (' + nonEmpty + ')',
    r.parsed_count + ' parsed + ' + r.failed_count + ' failed');
});

/* ── Coverage summary, real and synthetic kept apart ───────────────────────── */
function pct(a, b) { return b === 0 ? 'n/a' : (100 * a / b).toFixed(1) + '%'; }
console.log('\n─── parser coverage over the FIXTURE corpus ─────────────────────────');
console.log('  real      : ' + stats.real.n + ' string(s), ' + stats.real.seg + ' segments — ' +
  stats.real.parsed + ' parsed (' + pct(stats.real.parsed, stats.real.seg) + '), ' + stats.real.failed + ' failed');
console.log('  synthetic : ' + stats.synthetic.n + ' strings, ' + stats.synthetic.seg + ' segments — ' +
  stats.synthetic.parsed + ' parsed (' + pct(stats.synthetic.parsed, stats.synthetic.seg) + '), ' + stats.synthetic.failed + ' failed');
console.log('  NOTE: the synthetic figure measures the corpus, not the database. Real');
console.log('        coverage requires running over live rows — see NEXT_STEPS_OWNER.md.');
console.log('─────────────────────────────────────────────────────────────────────');

console.log(failures === 0
  ? '\nAll parser checks pass.'
  : '\n' + failures + ' parser check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
