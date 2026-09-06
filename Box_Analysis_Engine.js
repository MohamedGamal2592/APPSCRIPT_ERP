/**
 * Box_Analysis_Engine.js
 * RESPONSIBILITY: the pure analysis core for تحليل حركة الخزنة العادية
 * (page tc_box_analysis) — parsing `transaction_details`, matching item texts
 * across rows, and the fraud/anomaly rules.
 *
 * EVERY FUNCTION IN THIS FILE IS PURE. No SpreadsheetApp, no Jdbc, no DriveApp,
 * no CacheService, no Logger. That is not stylistic: it is the only reason any
 * of this can be verified at all. There is no browser and no database reachable
 * from the machine this was written on, so the parser, the matcher and every
 * rule are tested under plain `node` against
 * tools/verify/fixtures/box_details.json. Reach for a Google service here and
 * that verification stops working.
 *
 * I/O lives in DbLive_Connector.js (SQL) and Company_TopChemical_Actions.js
 * (Drive audit log, cache, session user).
 *
 * Loaded by Apps Script as a plain global script file; also `require`-able from
 * tools/verify/ via the module.exports block at the bottom.
 *
 * ARABIC IN REGEXES IS WRITTEN AS \uXXXX, ALWAYS. This file is edited in a
 * left-to-right editor, where a literal Arabic character class reorders on
 * screen and cannot be reviewed reliably — a range that reads correctly may not
 * be the range that was written. Arabic in plain string literals (the
 * dictionaries, the Arabic reason texts) stays literal, because those are read
 * as words rather than as ranges.
 *
 * Plan: BOX_ANALYSIS_PLAN.md §4 (parser), §5 (matcher), §7 (rules).
 */

var BoxEngine = (function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // §4.1  Normalization
  // ═══════════════════════════════════════════════════════════════════════

  /* Codepoints, named once so the folds below read as intentions. */
  var AR = {
    INDIC_0: 0x0660,          /* ٠ .. ٩            U+0660–U+0669 */
    EXT_INDIC_0: 0x06F0,      /* ۰ .. ۹            U+06F0–U+06F9 */
    ALEF: 'ا',           /* ا */
    HEH: 'ه',            /* ه */
    YEH: 'ي',            /* ي */
    WAW: 'و'             /* و */
  };

  var RE_INDIC_DIGITS = /[٠-٩]/g;
  var RE_EXT_INDIC_DIGITS = /[۰-۹]/g;
  var RE_ARABIC_DECIMAL_SEP = /٫/g;      /* ٫ */
  var RE_ARABIC_THOUSANDS_SEP = /٬/g;    /* ٬ */
  var RE_TASHKEEL = /[ً-ٰٕ]/g; /* harakat + superscript alef */
  var RE_TATWEEL = /ـ/g;                 /* ـ */
  var RE_ALEF_FORMS = /[آأإٱ]/g;  /* آ أ إ ٱ */
  var RE_TEH_MARBUTA = /ة/g;             /* ة */
  var RE_ALEF_MAQSURA = /ى/g;            /* ى */
  var RE_WAW_HAMZA = /ؤ/g;               /* ؤ */
  var RE_YEH_HAMZA = /ئ/g;               /* ئ */
  /* Keep: Arabic letters U+0621–U+064A, Latin letters, digits, '.', the segment
     separator '+', and the alternate price marker '='. */
  var RE_NOISE = /[^ء-ي0-9a-zA-Z.+=\s]/g;

  /**
   * Fold Arabic orthographic variation away so that two spellings of the same
   * purchase compare equal before any fuzzy scoring runs.
   *
   * Order matters. Digits are converted BEFORE punctuation is stripped, because
   * the Arabic decimal separator ٫ (U+066B) is punctuation and would otherwise
   * be deleted, silently turning ٩٢٥٫٥٠ into 92550.
   *
   * The consecutive-duplicate-token collapse at the end is not defensive
   * programming: the one real sample string we have literally contains
   * "نص كيلو  كيلو سلك لحام زهر". Repeated adjacent identical tokens in this
   * data are keying noise, never meaningful repetition.
   */
  function normAr(s) {
    if (s === null || s === undefined) return '';
    var t = String(s);

    t = t.replace(RE_INDIC_DIGITS, function (d) { return String(d.charCodeAt(0) - AR.INDIC_0); });
    t = t.replace(RE_EXT_INDIC_DIGITS, function (d) { return String(d.charCodeAt(0) - AR.EXT_INDIC_0); });
    t = t.replace(RE_ARABIC_DECIMAL_SEP, '.').replace(RE_ARABIC_THOUSANDS_SEP, '');

    /* Stripping tatweel is what makes "بـ 700" parse: بـ is ب + U+0640, and
       after this line it is just ب. */
    t = t.replace(RE_TASHKEEL, '').replace(RE_TATWEEL, '');

    t = t.replace(RE_ALEF_FORMS, AR.ALEF);
    t = t.replace(RE_TEH_MARBUTA, AR.HEH);
    t = t.replace(RE_ALEF_MAQSURA, AR.YEH);
    t = t.replace(RE_WAW_HAMZA, AR.WAW);
    t = t.replace(RE_YEH_HAMZA, AR.YEH);

    /* Punctuation becomes a space, so tokens either side of a comma or a
       bracket do not fuse into one. */
    t = t.replace(RE_NOISE, ' ');
    t = t.replace(/\s+/g, ' ').trim();

    if (!t) return '';
    var toks = t.split(' ');
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      if (i === 0 || toks[i] !== toks[i - 1]) out.push(toks[i]);
    }
    return out.join(' ');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §4.2  Dictionaries
  // ═══════════════════════════════════════════════════════════════════════

  /* Written in their natural spelling and normalized once at load, so the
     dictionary and the input are folded by exactly the same function. Writing
     'طبه' here by hand instead would work today and break the first time normAr
     learns another fold. */
  var QUANTITY_WORDS_RAW = {
    'نص': 0.5, 'نصف': 0.5, 'النص': 0.5,
    'ربع': 0.25, 'الربع': 0.25,
    'تلت': 1 / 3, 'ثلث': 1 / 3,
    'تلتين': 2 / 3, 'ثلثين': 2 / 3,
    'تمن': 0.125, 'ثمن': 0.125,
    'واحد': 1, 'واحدة': 1,
    'اتنين': 2, 'اثنين': 2,
    'تلاتة': 3, 'ثلاثة': 3,
    'أربعة': 4, 'خمسة': 5, 'ستة': 6, 'سبعة': 7, 'ثمانية': 8, 'تسعة': 9, 'عشرة': 10
  };

  var UNIT_WORDS_RAW = [
    'كيلو', 'كجم', 'كج', 'جرام', 'جم', 'طن',
    'لتر', 'مللي', 'جالون', 'برميل', 'صفيحة', 'جردل',
    'متر', 'سم', 'مم', 'لفة', 'رول', 'شريط',
    'طبة', 'علبة', 'عبوة', 'زجاجة', 'شكارة', 'كيس', 'باكو', 'بوكس',
    'كرتونة', 'كرتون', 'شنطة', 'صندوق',
    'قطعة', 'عدد', 'حتة', 'لوح', 'صاج', 'اسطوانة', 'دستة', 'درزن'
  ];

  var QUANTITY_WORDS = (function () {
    var m = {};
    for (var k in QUANTITY_WORDS_RAW) {
      if (Object.prototype.hasOwnProperty.call(QUANTITY_WORDS_RAW, k)) m[normAr(k)] = QUANTITY_WORDS_RAW[k];
    }
    return m;
  })();

  var UNIT_WORDS = (function () {
    var m = {};
    for (var i = 0; i < UNIT_WORDS_RAW.length; i++) m[normAr(UNIT_WORDS_RAW[i])] = true;
    return m;
  })();

  function round_(v, dp) {
    var f = Math.pow(10, dp === undefined ? 2 : dp);
    return Math.round((Number(v) + Number.EPSILON) * f) / f;
  }

  function tokens_(s) {
    var t = String(s || '').trim();
    return t ? t.split(' ') : [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §4.2  Segment parsing
  // ═══════════════════════════════════════════════════════════════════════

  /* The price marker must be a STANDALONE ب (U+0628) or '=', followed by
     digits. A ب that merely begins a word must never be read as a price marker,
     or "2 لتر بويه بيضا ب 240" (white paint) reads its own item name as a
     number. */
  var PRICE_AT_END = /(?:^|\s)(?:ب|=)\s*(\d+(?:\.\d+)?)\s*$/;
  var PRICE_ANYWHERE = /(?:^|\s)(?:ب|=)\s*(\d+(?:\.\d+)?)/g;

  /**
   * Pull the price off a normalized segment.
   * Returns { price, rest } or null when the segment carries no price at all.
   *
   * There is deliberately NO "trailing bare number" fallback. A segment such as
   * "طبة حديد" with no price must be reported as a failure — guessing a price
   * out of some other number in the text is exactly how the sum check would
   * come to agree with a description that does not account for the money.
   */
  function takePrice(seg) {
    var s = String(seg || '').trim();
    if (!s) return null;
    var m = s.match(PRICE_AT_END);
    if (m) return { price: Number(m[1]), rest: s.slice(0, m.index).trim() };

    PRICE_ANYWHERE.lastIndex = 0;
    var last = null, x;
    while ((x = PRICE_ANYWHERE.exec(s)) !== null) last = x;
    if (!last) return null;
    var rest = (s.slice(0, last.index) + ' ' + s.slice(last.index + last[0].length))
      .replace(/\s+/g, ' ').trim();
    return { price: Number(last[1]), rest: rest };
  }

  /**
   * Take a leading quantity — numeric ("5", "0.5") or a word ("نص", "ربع",
   * "تلت"). Word quantities resolve to numbers so that unit prices from
   * differently-worded rows are comparable at all.
   * Returns { value, rest }; value is null when there is no quantity.
   */
  function takeQuantity(text) {
    var s = String(text || '').trim();
    if (!s) return { value: null, rest: '' };
    var toks = tokens_(s);

    if (/^\d+(?:\.\d+)?$/.test(toks[0])) {
      return { value: Number(toks[0]), rest: toks.slice(1).join(' ') };
    }
    if (Object.prototype.hasOwnProperty.call(QUANTITY_WORDS, toks[0])) {
      return { value: QUANTITY_WORDS[toks[0]], rest: toks.slice(1).join(' ') };
    }
    return { value: null, rest: s };
  }

  /**
   * Take a leading unit token. Returns { value, rest }; value is null when the
   * first token is not a known unit.
   */
  function takeUnit(text) {
    var s = String(text || '').trim();
    if (!s) return { value: null, rest: '' };
    var toks = tokens_(s);
    if (Object.prototype.hasOwnProperty.call(UNIT_WORDS, toks[0])) {
      return { value: toks[0], rest: toks.slice(1).join(' ') };
    }
    return { value: null, rest: s };
  }

  /**
   * The Egyptian "كيلو ونص" shape, where the fraction FOLLOWS the unit instead
   * of preceding it. Handled here rather than inside takeQuantity because it
   * can only be recognised once the unit has been consumed.
   * Returns { value, rest } — value null when the pattern is absent.
   */
  function takeTrailingFraction(text) {
    var s = String(text || '').trim();
    if (!s) return { value: null, rest: '' };
    var toks = tokens_(s);
    var t = toks[0];
    if (t && t.length > 1 && t.charAt(0) === AR.WAW) {
      var word = t.slice(1);
      if (Object.prototype.hasOwnProperty.call(QUANTITY_WORDS, word)) {
        return { value: QUANTITY_WORDS[word], rest: toks.slice(1).join(' ') };
      }
    }
    if (t === AR.WAW && toks.length > 1 &&
        Object.prototype.hasOwnProperty.call(QUANTITY_WORDS, toks[1])) {
      return { value: QUANTITY_WORDS[toks[1]], rest: toks.slice(2).join(' ') };
    }
    return { value: null, rest: s };
  }

  /**
   * Order-invariant identity for an item text: its tokens, deduped and sorted.
   * This is what makes flipped wording ("معجون شروخ" / "شروخ معجون") match for
   * free, before a single fuzzy score has been computed.
   */
  function itemKey(itemNorm) {
    var seen = {}, out = [];
    tokens_(itemNorm).forEach(function (t) {
      if (!t || Object.prototype.hasOwnProperty.call(seen, t)) return;
      seen[t] = true;
      out.push(t);
    });
    out.sort();
    return out.join(' ');
  }

  /**
   * How much to trust one parsed segment. Not a probability — a rank, used to
   * sort the "needs a human" list and to damp the price rules on shaky parses.
   */
  function scoreParse(qty, unit, itemNorm) {
    var c = 1;
    if (qty === null || qty === undefined) c -= 0.2;
    if (!unit) c -= 0.15;
    var toks = tokens_(itemNorm);
    if (toks.length <= 1) c -= 0.05;
    if (/\d/.test(itemNorm)) c -= 0.15;   /* stray digits left in the item name */
    if (c < 0) c = 0;
    if (c > 1) c = 1;
    return round_(c, 3);
  }

  /**
   * Parse one `transaction_details` value into line items.
   *
   *   record  := segment ("+" segment)*
   *   segment := [qty] [unit] item ("ب"|"=") price
   *
   * A segment that cannot be parsed comes back in `failures`, NEVER dropped.
   * Dropping it would make `sum` agree with `transaction_amount` on exactly the
   * rows where the description does not account for the money — the rows a
   * human most needs to see.
   *
   * An EMPTY segment (a trailing "+", a double separator) is skipped and is not
   * a failure; otherwise every stray separator becomes a fake finding.
   */
  function parseDetails(text) {
    var raw = (text === null || text === undefined) ? '' : String(text);
    var norm = normAr(raw);
    var parts = norm.split('+');
    var items = [], failures = [], sum = 0, seq = 0;

    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i].trim();
      if (!seg) continue;
      seq++;

      var p = takePrice(seg);
      if (!p) {
        failures.push({ seq: seq, segment: seg, reason: 'NO_PRICE', reason_ar: 'لا يوجد سعر في هذا الجزء' });
        continue;
      }

      var q = takeQuantity(p.rest);
      var u = takeUnit(q.rest);
      var qty = q.value;
      var rest = u.rest;

      if (u.value) {
        var extra = takeTrailingFraction(rest);
        if (extra.value !== null) {
          qty = (qty === null ? 1 : qty) + extra.value;
          rest = extra.rest;
        }
      }

      var itemNorm = String(rest || '').trim();
      if (!itemNorm) {
        failures.push({ seq: seq, segment: seg, reason: 'NO_ITEM', reason_ar: 'لا يوجد اسم صنف في هذا الجزء' });
        continue;
      }

      var unitPrice = (qty !== null && qty > 0) ? round_(p.price / qty, 4) : null;
      items.push({
        seq: seq,
        qty: qty,
        unit: u.value,
        item_raw: itemNorm,
        item_norm: itemNorm,
        item_key: itemKey(itemNorm),
        price: round_(p.price, 2),
        unit_price: unitPrice,
        confidence: scoreParse(qty, u.value, itemNorm)
      });
      sum += p.price;
    }

    var total = items.length + failures.length;
    return {
      raw: raw,
      norm: norm,
      items: items,
      failures: failures,
      sum: round_(sum, 2),
      parsed_count: items.length,
      failed_count: failures.length,
      segment_count: total,
      coverage: total === 0 ? null : round_(items.length / total, 4)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §5  Item identity — the matcher
  // ═══════════════════════════════════════════════════════════════════════

  /* Tuning lives here, in one object, because a threshold nobody can see is a
     threshold nobody can tune. The verify run prints the score of every fixture
     pair against these numbers; change one and the run tells you what moved. */
  var MATCH = {
    /* Weights sum to 1. Dice carries the most because whole shared tokens are
       the strongest evidence in this vocabulary; the trigram cosine is second
       because it is what separates a typo from a genuinely different product. */
    W_DICE: 0.40,
    W_LEV: 0.20,
    W_TRIGRAM: 0.30,
    W_UNIT: 0.10,
    /* Chosen against tools/verify/fixtures/box_details.json — see the measured
       score table printed by `node tools/verify/box_matcher.js --show`. It sits
       between the hardest true pair (a one-character typo) and the hardest
       false pair (سلك لحام زهر vs سلك لحام المونيوم, two of three tokens
       shared, different metals, different prices). */
    THRESHOLD: 0.58,
    /* Blocking guards. A token appearing in more posting-list entries than this
       is too common to block on — that is the IDF floor of plan §5.1, expressed
       as the thing it actually controls. */
    MAX_POSTING: 200,
    RARE_STEMS: 2,
    RARE_TRIGRAMS: 4,
    MAX_CANDIDATES: 400,
    /* Suffix stripping only when at least this much stem survives. Without it
       "زيتون" stems to "زيت" and olives merge with oil, and "معجون" stems to
       "معج". Both are real words in this vocabulary. */
    MIN_STEM: 4
  };

  var RE_AL_PREFIX = /^ال/;
  var SUFFIXES = ['ات', 'ين', 'ون', 'ه'];

  /**
   * Light Arabic stemming (plan §5.2): strip the definite article and a small
   * set of suffixes. Deliberately not a real morphological stemmer — this
   * vocabulary is workshop consumables, and an aggressive stemmer conflates
   * more than it merges.
   */
  function stemAr(token) {
    var t = String(token || '');
    if (!t) return '';
    if (RE_AL_PREFIX.test(t) && t.length - 2 >= 3) t = t.slice(2);
    for (var i = 0; i < SUFFIXES.length; i++) {
      var s = SUFFIXES[i];
      if (t.length > s.length && t.slice(-s.length) === s && t.length - s.length >= MATCH.MIN_STEM) {
        t = t.slice(0, t.length - s.length);
        break;
      }
    }
    return t;
  }

  function stemTokens(itemNorm) {
    var seen = {}, out = [];
    tokens_(itemNorm).forEach(function (t) {
      var s = stemAr(t);
      if (!s || Object.prototype.hasOwnProperty.call(seen, s)) return;
      seen[s] = true;
      out.push(s);
    });
    return out;
  }

  /** Order-invariant identity AFTER stemming — the second exact-match block. */
  function stemKey(itemNorm) {
    return stemTokens(itemNorm).slice().sort().join(' ');
  }

  function tokenSetDice(aTokens, bTokens) {
    if (!aTokens.length || !bTokens.length) return 0;
    var set = {}, i;
    for (i = 0; i < aTokens.length; i++) set[aTokens[i]] = true;
    var shared = 0;
    for (i = 0; i < bTokens.length; i++) {
      if (Object.prototype.hasOwnProperty.call(set, bTokens[i])) shared++;
    }
    return (2 * shared) / (aTokens.length + bTokens.length);
  }

  /** Levenshtein distance, two-row DP. Strings here are short item names. */
  function levenshtein(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }

  function normLevenshtein(a, b) {
    var m = Math.max(String(a || '').length, String(b || '').length);
    return m === 0 ? 0 : levenshtein(a, b) / m;
  }

  /** Character 3-grams with a boundary pad, as a {gram: count} bag. */
  function trigramBag(s) {
    var t = '  ' + String(s || '') + '  ';
    var m = {};
    for (var i = 0; i + 3 <= t.length; i++) {
      var g = t.substr(i, 3);
      m[g] = (m[g] || 0) + 1;
    }
    return m;
  }

  /**
   * Cosine between two trigram bags, each component weighted by the gram's IDF.
   *
   * The IDF weighting is the part that earns its keep. "سلك" and "لحام" appear
   * in most welding-wire rows, so their grams carry almost no weight; the grams
   * that distinguish زهر from المونيوم carry nearly all of it. Unweighted, two
   * different welding wires look nearly identical.
   */
  function idfTrigramCosine(bagA, bagB, idfOf) {
    var dot = 0, na = 0, nb = 0, g, w;
    for (g in bagA) {
      if (!Object.prototype.hasOwnProperty.call(bagA, g)) continue;
      w = idfOf(g);
      na += (bagA[g] * w) * (bagA[g] * w);
      if (Object.prototype.hasOwnProperty.call(bagB, g)) dot += (bagA[g] * w) * (bagB[g] * w);
    }
    for (g in bagB) {
      if (!Object.prototype.hasOwnProperty.call(bagB, g)) continue;
      w = idfOf(g);
      nb += (bagB[g] * w) * (bagB[g] * w);
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  /* Units grouped by physical dimension. Two items measured in different
     dimensions are not the same purchase however similar the words look. */
  var UNIT_FAMILY_RAW = {
    'كيلو': 'mass', 'كجم': 'mass', 'كج': 'mass', 'جرام': 'mass', 'جم': 'mass', 'طن': 'mass',
    'لتر': 'volume', 'مللي': 'volume', 'جالون': 'volume', 'برميل': 'volume',
    'صفيحة': 'volume', 'جردل': 'volume',
    'متر': 'length', 'سم': 'length', 'مم': 'length', 'لفة': 'length', 'رول': 'length', 'شريط': 'length',
    'طبة': 'count', 'علبة': 'count', 'عبوة': 'count', 'زجاجة': 'count', 'شكارة': 'count',
    'كيس': 'count', 'باكو': 'count', 'بوكس': 'count', 'كرتونة': 'count', 'كرتون': 'count',
    'شنطة': 'count', 'صندوق': 'count', 'قطعة': 'count', 'عدد': 'count', 'حتة': 'count',
    'لوح': 'count', 'صاج': 'count', 'اسطوانة': 'count', 'دستة': 'count', 'درزن': 'count'
  };

  var UNIT_FAMILY = (function () {
    var m = {};
    for (var k in UNIT_FAMILY_RAW) {
      if (Object.prototype.hasOwnProperty.call(UNIT_FAMILY_RAW, k)) m[normAr(k)] = UNIT_FAMILY_RAW[k];
    }
    return m;
  })();

  /**
   * 1.0 same unit · 0.8 same dimension · 0.5 at least one unknown · 0 different
   * dimension.
   *
   * An unknown unit scores 0.5, not 1.0, on purpose: "we do not know" is not
   * evidence of compatibility, and roughly half this corpus carries no unit at
   * all. Scoring it as agreement would hand every unitless pair a free 0.1.
   */
  function unitCompatible(unitA, unitB) {
    var a = unitA ? normAr(unitA) : '';
    var b = unitB ? normAr(unitB) : '';
    if (!a || !b) return 0.5;
    if (a === b) return 1;
    var fa = UNIT_FAMILY[a], fb = UNIT_FAMILY[b];
    if (fa && fb && fa === fb) return 0.8;
    if (!fa || !fb) return 0.5;
    return 0;
  }

  /**
   * Build the blocking + IDF index over a set of DISTINCT normalized item
   * texts. Distinct texts, not occurrences: a thousand rows buying "معجون شروخ"
   * are one node here, which is what keeps this inside the execution limit.
   */
  function buildMatchIndex(records) {
    var nodes = [], byNorm = {};
    (records || []).forEach(function (r) {
      var norm = typeof r === 'string' ? r : (r && r.item_norm) || '';
      var unit = (typeof r === 'string') ? null : (r && r.unit) || null;
      if (!norm) return;
      if (Object.prototype.hasOwnProperty.call(byNorm, norm)) {
        var ex = nodes[byNorm[norm]];
        ex.count++;
        if (unit) ex.units[unit] = (ex.units[unit] || 0) + 1;
        return;
      }
      var stems = stemTokens(norm);
      byNorm[norm] = nodes.length;
      var n = {
        i: nodes.length,
        norm: norm,
        tokens: tokens_(norm),
        stems: stems,
        key: itemKey(norm),
        stem_key: stems.slice().sort().join(' '),
        tri: trigramBag(norm),
        units: {},
        count: 1
      };
      if (unit) n.units[unit] = 1;
      nodes.push(n);
    });

    var N = nodes.length;
    var stemDf = {}, triDf = {}, byKey = {}, byStemKey = {}, postings = {}, triPostings = {};

    nodes.forEach(function (n) {
      var seen = {};
      n.stems.forEach(function (s) {
        if (seen[s]) return;
        seen[s] = true;
        stemDf[s] = (stemDf[s] || 0) + 1;
        (postings[s] = postings[s] || []).push(n.i);
      });
      var seenG = {};
      for (var g in n.tri) {
        if (!Object.prototype.hasOwnProperty.call(n.tri, g) || seenG[g]) continue;
        seenG[g] = true;
        triDf[g] = (triDf[g] || 0) + 1;
        (triPostings[g] = triPostings[g] || []).push(n.i);
      }
      (byKey[n.key] = byKey[n.key] || []).push(n.i);
      (byStemKey[n.stem_key] = byStemKey[n.stem_key] || []).push(n.i);
    });

    function idfStem(t) { return Math.log(1 + N / (1 + (stemDf[t] || 0))); }
    function idfTri(g) { return Math.log(1 + N / (1 + (triDf[g] || 0))); }

    /* The unit a text is most often bought in — used for unitCompatible when
       scoring two texts rather than two individual occurrences. */
    nodes.forEach(function (n) {
      var best = null, bestN = 0;
      for (var u in n.units) {
        if (Object.prototype.hasOwnProperty.call(n.units, u) && n.units[u] > bestN) { best = u; bestN = n.units[u]; }
      }
      n.unit = best;
    });

    return {
      N: N, nodes: nodes, byNorm: byNorm,
      byKey: byKey, byStemKey: byStemKey,
      postings: postings, triPostings: triPostings,
      stemDf: stemDf, triDf: triDf,
      idfStem: idfStem, idfTri: idfTri
    };
  }

  /**
   * Score two index nodes. Returns the total AND every component, because a
   * merge an accountant disagrees with has to be explainable — "0.71" is not an
   * answer to "why did you put these together".
   */
  function matchScore(a, b, idx) {
    var dice = tokenSetDice(a.stems, b.stems);
    var lev = 1 - normLevenshtein(a.stems.slice().sort().join(' '), b.stems.slice().sort().join(' '));
    var tri = idx ? idfTrigramCosine(a.tri, b.tri, idx.idfTri) : 0;
    var unit = unitCompatible(a.unit, b.unit);
    var score = MATCH.W_DICE * dice + MATCH.W_LEV * lev + MATCH.W_TRIGRAM * tri + MATCH.W_UNIT * unit;
    return {
      score: round_(score, 4),
      dice: round_(dice, 4),
      lev: round_(lev, 4),
      trigram: round_(tri, 4),
      unit: round_(unit, 4)
    };
  }

  /**
   * Candidate generation for one node (plan §5.1), cheapest block first:
   *   1. identical item_key      — flipped word order, free
   *   2. identical stem_key      — definite articles and plurals, free
   *   3. rarest shared stems     — the IDF-weighted inverted index
   *   4. rarest shared trigrams  — typos that share no whole token
   * A posting list longer than MATCH.MAX_POSTING is skipped: a token that
   * common cannot discriminate, and walking it would dominate the run.
   */
  function matchCandidates(node, idx) {
    var out = {}, i;
    function add(list) {
      if (!list || list.length > MATCH.MAX_POSTING) return;
      for (var k = 0; k < list.length; k++) if (list[k] !== node.i) out[list[k]] = true;
    }
    add(idx.byKey[node.key]);
    add(idx.byStemKey[node.stem_key]);

    var stems = node.stems.slice().sort(function (x, y) { return idx.idfStem(y) - idx.idfStem(x); });
    for (i = 0; i < Math.min(stems.length, MATCH.RARE_STEMS); i++) add(idx.postings[stems[i]]);

    var grams = Object.keys(node.tri).sort(function (x, y) { return idx.idfTri(y) - idx.idfTri(x); });
    for (i = 0; i < Math.min(grams.length, MATCH.RARE_TRIGRAMS); i++) add(idx.triPostings[grams[i]]);

    var ids = Object.keys(out).map(Number);
    return ids.length > MATCH.MAX_CANDIDATES ? ids.slice(0, MATCH.MAX_CANDIDATES) : ids;
  }

  function makeDsu_(n) {
    var p = [];
    for (var i = 0; i < n; i++) p.push(i);
    function find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a === b) return false; p[b] = a; return true; }
    return { find: find, union: union };
  }

  /**
   * Cluster item texts into one group per real-world purchase.
   *
   * opts.aliases carries the human overrides from §5.3 — the reviewer's
   * corrections, which always win over the score:
   *   { merge: [[normA, normB], ...], split: [[normA, normB], ...] }
   *
   * A split is enforced by refusing any union that would put a forbidden pair
   * in one component. That makes the result depend on the order unions are
   * attempted, so pairs are processed in a fixed sorted order and the outcome
   * is deterministic for a given input. It is not a general constrained
   * clustering, and it does not pretend to be: it is "the reviewer said these
   * two are different, so never merge them".
   */
  function clusterItems(records, opts) {
    var o = opts || {};
    var threshold = o.threshold === undefined ? MATCH.THRESHOLD : o.threshold;
    var idx = o.index || buildMatchIndex(records);
    var dsu = makeDsu_(idx.N);

    var forbidden = [];
    ((o.aliases && o.aliases.split) || []).forEach(function (pair) {
      var a = idx.byNorm[normAr(pair[0])], b = idx.byNorm[normAr(pair[1])];
      if (a !== undefined && b !== undefined) forbidden.push([a, b]);
    });

    function wouldViolate(a, b) {
      var ra = dsu.find(a), rb = dsu.find(b);
      for (var i = 0; i < forbidden.length; i++) {
        var fa = dsu.find(forbidden[i][0]), fb = dsu.find(forbidden[i][1]);
        if ((fa === ra && fb === rb) || (fa === rb && fb === ra)) return true;
      }
      return false;
    }
    function tryUnion(a, b) {
      if (dsu.find(a) === dsu.find(b)) return false;
      if (wouldViolate(a, b)) return false;
      return dsu.union(a, b);
    }

    /* Reviewer merges first: they are facts, not evidence. */
    ((o.aliases && o.aliases.merge) || []).forEach(function (pair) {
      var a = idx.byNorm[normAr(pair[0])], b = idx.byNorm[normAr(pair[1])];
      if (a !== undefined && b !== undefined) tryUnion(a, b);
    });

    /* Score every candidate pair once, then union in descending score order so
       the strongest evidence is applied first and the result does not depend on
       node ordering. */
    var pairs = [], seenPair = {};
    idx.nodes.forEach(function (n) {
      matchCandidates(n, idx).forEach(function (j) {
        var lo = Math.min(n.i, j), hi = Math.max(n.i, j);
        var pk = lo + ':' + hi;
        if (seenPair[pk]) return;
        seenPair[pk] = true;
        var s = matchScore(idx.nodes[lo], idx.nodes[hi], idx);
        if (s.score >= threshold) pairs.push({ a: lo, b: hi, s: s.score });
      });
    });
    pairs.sort(function (x, y) { return y.s - x.s || x.a - y.a || x.b - y.b; });
    pairs.forEach(function (p) { tryUnion(p.a, p.b); });

    var groups = {};
    idx.nodes.forEach(function (n) {
      var r = dsu.find(n.i);
      (groups[r] = groups[r] || []).push(n);
    });

    var clusters = Object.keys(groups).map(function (r) {
      var members = groups[r].slice().sort(function (x, y) { return y.count - x.count || (x.norm < y.norm ? -1 : 1); });
      var total = 0;
      members.forEach(function (m) { total += m.count; });
      /* cluster_id is the lexicographically smallest MEMBER TEXT, not the
         representative's item_key. item_key is order-invariant, so a reviewer
         who splits "معجون شروخ" from "شروخ معجون" would get two clusters
         carrying the SAME id — and every downstream lookup keyed by cluster id
         would quietly merge them back, undoing the correction. Membership sets
         are disjoint, so the smallest member text is unique by construction,
         and it does not move when purchase counts shift. */
      var ids = members.map(function (m) { return m.norm; }).sort();
      return {
        cluster_id: ids[0],
        label: members[0].norm,              /* the most-used member — what a reviewer reads */
        members: members.map(function (m) { return m.norm; }),
        member_count: members.length,
        occurrence_count: total
      };
    }).sort(function (x, y) { return y.occurrence_count - x.occurrence_count; });

    var byNormCluster = {};
    clusters.forEach(function (c) {
      c.members.forEach(function (m) { byNormCluster[m] = c.cluster_id; });
    });

    return { clusters: clusters, byNorm: byNormCluster, index: idx, threshold: threshold };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §6  Account period windows
  // ═══════════════════════════════════════════════════════════════════════

  /* Deliberately integer arithmetic on a YYYY-MM-DD string, with no Date
     object anywhere. Apps Script runs in the script's timezone, the database
     stores a bare DATE, and the browser is in the user's timezone; routing
     these bounds through a Date is how a movement dated the 1st ends up
     excluded from its own month. Strings in, strings out, no zone ever
     consulted. */

  function daysInMonth(y, m) {
    if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
    return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
  }

  function pad2_(n) { return (n < 10 ? '0' : '') + n; }
  function iso_(y, m, d) { return y + '-' + pad2_(m) + '-' + pad2_(d); }

  function parseIsoDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > daysInMonth(y, mo)) return null;
    return { y: y, m: mo, d: d };
  }

  /**
   * The first day of the month N months before refIso.
   *
   * Month arithmetic on a running month-index, not on a Date: subtracting 24
   * months from September 2026 has to give September 2024 whatever the day of
   * the month is, and has to cross a year boundary without a timezone getting
   * an opinion.
   */
  function monthsBefore(refIso, n) {
    var r = parseIsoDate(refIso);
    if (!r) throw new Error('Invalid reference date (expected YYYY-MM-DD): ' + refIso);
    var idx = r.y * 12 + (r.m - 1) - Math.max(0, Math.floor(Number(n) || 0));
    var y = Math.floor(idx / 12);
    var m = idx - y * 12 + 1;
    return iso_(y, m, 1);
  }

  /**
   * The four spend windows of plan §6, anchored on a reference date D.
   *
   * Last month and last year are cut to the SAME DAY-OF-PERIOD as D, never to
   * the whole period. Comparing 12 days of this month against 31 days of last
   * month manufactures a decline on the 12th of every month, and someone will
   * act on it.
   *
   * The day is clamped to the target month's length, so 31 March compares
   * against 1–28 February and never asks the database for 31 February.
   */
  function accountWindows(refIso) {
    var r = parseIsoDate(refIso);
    if (!r) throw new Error('Invalid reference date (expected YYYY-MM-DD): ' + refIso);

    var pmY = r.m === 1 ? r.y - 1 : r.y;
    var pmM = r.m === 1 ? 12 : r.m - 1;
    var lmDay = Math.min(r.d, daysInMonth(pmY, pmM));
    var lyDay = Math.min(r.d, daysInMonth(r.y - 1, r.m));

    return {
      ref: iso_(r.y, r.m, r.d),
      mtd: { from: iso_(r.y, r.m, 1), to: iso_(r.y, r.m, r.d), label_ar: 'الشهر الحالي' },
      last_month: { from: iso_(pmY, pmM, 1), to: iso_(pmY, pmM, lmDay), label_ar: 'الشهر السابق (نفس المدة)' },
      ytd: { from: iso_(r.y, 1, 1), to: iso_(r.y, r.m, r.d), label_ar: 'العام الحالي' },
      last_ytd: { from: iso_(r.y - 1, 1, 1), to: iso_(r.y - 1, r.m, lyDay), label_ar: 'العام السابق (نفس المدة)' },
      /* The outer bound the aggregate query needs: everything the four windows
         can touch, and nothing else. */
      span: { from: iso_(r.y - 1, 1, 1), to: iso_(r.y, r.m, r.d) }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // §8.5  The edit path — allowlist and validators
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * The columns an edit may touch. A FIXED ALLOWLIST, never a sanitizer over a
   * client-supplied column name: a sanitizer answers "is this string safe to
   * put in SQL", and the question that matters is "is this a column a user is
   * allowed to change at all".
   *
   * Absent on purpose, and each for its own reason:
   *   id          the primary key the update targets
   *   created_at  THE EVIDENCE. The backdating rules (BACKDATED, ODD_HOUR,
   *               OUT_OF_SEQUENCE) all run on created_at. A page whose job is
   *               to find tampering must not offer a field for editing the
   *               timestamps it audits.
   *   updated_at  server-set to NOW() on every edit, so EDITED_AFTER_REVIEW
   *               cannot be defeated by writing an old value into it.
   *
   * Types come straight from the schema in plan §2, so the validation is exact
   * rather than defensive: transaction_details is varchar(255) and MySQL would
   * truncate or throw, so 256 characters is rejected HERE, with an Arabic
   * message naming the column, rather than becoming a driver error or, worse,
   * a silently shortened description.
   */
  var EDITABLE_COLUMNS = {
    transaction_date:    { type: 'date',    label_ar: 'التاريخ' },
    transaction_details: { type: 'text255', label_ar: 'التفاصيل', max: 255 },
    transaction_amount:  { type: 'money',   label_ar: 'المبلغ' },
    transaction_type:    { type: 'enum',    label_ar: 'النوع', values: ['credit', 'debit'],
                           labels_ar: { credit: 'منصرف', debit: 'محصّل' } },
    chart_of_accounts:   { type: 'digits',  label_ar: 'كود الحساب' },
    responsible_person:  { type: 'text',    label_ar: 'المسؤول', max: 65535 },
    box_code:            { type: 'int',     label_ar: 'كود الخزنة' },
    client_id:           { type: 'intNull', label_ar: 'كود العميل' },
    related_id:          { type: 'intNull', label_ar: 'الكود المرتبط' },
    user_id:             { type: 'intNull', label_ar: 'كود المستخدم', max: 2147483647 },
    is_revised:          { type: 'bool01',  label_ar: 'حالة المراجعة' }
  };

  var LOCKED_COLUMNS = {
    id: 'المفتاح الأساسي لا يمكن تعديله',
    created_at: 'تاريخ الإنشاء دليل تدقيق ولا يمكن تعديله من هذه الصفحة',
    updated_at: 'تاريخ آخر تعديل يضبطه الخادم تلقائياً'
  };

  /* double(16,2): 16 significant digits with 2 after the point, so the largest
     representable magnitude is 99999999999999.99. */
  var MONEY_MAX = 99999999999999.99;

  function isEditableColumn(col) {
    return Object.prototype.hasOwnProperty.call(EDITABLE_COLUMNS, String(col));
  }

  /**
   * Validate and coerce ONE column's value. Throws an Arabic Error naming the
   * column when the value will not do.
   *
   * Returns the value in the form the prepared statement should bind: a string
   * for text and dates, a Number for money and integers, or null for an empty
   * nullable id. Returning the coerced value rather than a boolean is what
   * keeps the caller from binding the raw client string by accident.
   */
  function validateColumn(col, value) {
    var name = String(col);
    if (Object.prototype.hasOwnProperty.call(LOCKED_COLUMNS, name)) {
      throw new Error(LOCKED_COLUMNS[name]);
    }
    if (!isEditableColumn(name)) {
      throw new Error('عمود غير مسموح بتعديله: ' + name);
    }
    var spec = EDITABLE_COLUMNS[name];
    var raw = (value === undefined || value === null) ? '' : String(value);
    var s = raw.trim();
    var L = spec.label_ar;

    switch (spec.type) {
      case 'date':
        if (!s) throw new Error(L + ': التاريخ مطلوب');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(L + ': صيغة التاريخ غير صحيحة (المتوقع YYYY-MM-DD)');
        /* Shape is not enough — 2026-02-31 has the right shape and is not a
           day. MySQL would take it as a zero date or reject it depending on
           sql_mode, and either way the row's date would no longer mean what it
           says. */
        if (!parseIsoDate(s)) throw new Error(L + ': تاريخ غير موجود في التقويم');
        return s;

      case 'text255':
        if (s.length > spec.max) {
          throw new Error(L + ': الحد الأقصى ' + spec.max + ' حرفاً، والمُدخل ' + s.length +
            ' — اختصر النص، فقاعدة البيانات ستقتطعه دون تنبيه');
        }
        return s;

      case 'text':
        if (s.length > spec.max) throw new Error(L + ': الحد الأقصى ' + spec.max + ' حرفاً');
        return s;

      case 'money': {
        if (!s) throw new Error(L + ': القيمة مطلوبة');
        if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
          throw new Error(L + ': رقم بحد أقصى منزلتين عشريتين');
        }
        var n = Number(s);
        if (!isFinite(n)) throw new Error(L + ': قيمة رقمية غير صالحة');
        if (Math.abs(n) > MONEY_MAX) throw new Error(L + ': القيمة أكبر مما يتسع له الحقل');
        return n;
      }

      case 'enum':
        if (spec.values.indexOf(s) === -1) {
          throw new Error(L + ': القيمة يجب أن تكون ' + spec.values.join(' أو '));
        }
        return s;

      case 'digits':
        if (!s) throw new Error(L + ': القيمة مطلوبة');
        if (!/^\d{1,20}$/.test(s)) throw new Error(L + ': أرقام فقط');
        return s;

      case 'int': {
        if (!s) throw new Error(L + ': القيمة مطلوبة');
        if (!/^-?\d{1,19}$/.test(s)) throw new Error(L + ': رقم صحيح فقط');
        return s;                       /* bigint — kept as a string, never through a float */
      }

      case 'intNull': {
        if (!s) return null;            /* empty means NULL, which is the schema's default */
        if (!/^-?\d{1,19}$/.test(s)) throw new Error(L + ': رقم صحيح أو فراغ');
        if (spec.max !== undefined && Math.abs(Number(s)) > spec.max) {
          throw new Error(L + ': القيمة خارج المدى المسموح');
        }
        return s;
      }

      case 'bool01':
        if (s !== '0' && s !== '1') throw new Error(L + ': القيمة يجب أن تكون 0 أو 1');
        return Number(s);
    }
    throw new Error('نوع تحقق غير معروف للعمود: ' + name);
  }

  /**
   * Validate a whole change set. Returns { values, columns } with every value
   * coerced, or throws on the first column that will not validate.
   * Rejecting an EMPTY change set is deliberate: an update with nothing to set
   * is a client bug, and letting it through would move updated_at — which the
   * EDITED_AFTER_REVIEW rule reads — for no reason at all.
   */
  function validateChanges(changes) {
    var out = {}, cols = [];
    var src = changes || {};
    for (var col in src) {
      if (!Object.prototype.hasOwnProperty.call(src, col)) continue;
      out[col] = validateColumn(col, src[col]);
      cols.push(col);
    }
    if (!cols.length) throw new Error('لا توجد تغييرات');
    cols.sort();                        /* deterministic SET order and audit order */
    return { values: out, columns: cols };
  }

  /** Is this account code inside the item engine's range? (plan §2.1) */
  function inItemRange(code) {
    var s = String(code === undefined || code === null ? '' : code).trim();
    if (!/^\d+$/.test(s)) return false;
    var n = Number(s);
    return n >= 300000 && n <= 400000;
  }

  /**
   * Does this edit move the row across the 300000–400000 boundary? Worth
   * saying out loud in the confirmation, because it silently changes WHICH
   * ANALYSES APPLY to the row — the item parsing and every price rule are
   * scoped to that range — and nothing else on screen would show it.
   */
  function crossesItemBoundary(oldCode, newCode) {
    var a = inItemRange(oldCode), b = inItemRange(newCode);
    if (a === b) return null;
    return {
      from_in_range: a,
      to_in_range: b,
      reason_ar: b
        ? 'هذا التعديل يُدخل الحركة في نطاق تحليل البنود (300000–400000)، فتصبح خاضعة لتحليل الأسعار'
        : 'هذا التعديل يُخرج الحركة من نطاق تحليل البنود (300000–400000)، فتتوقف عنها قواعد تحليل الأسعار'
    };
  }

  /**
   * Which columns actually differ, comparing as the form would produce them.
   * Only changed columns are sent, so an edit that touches one field does not
   * rewrite ten and does not fill the audit log with lines saying nothing
   * changed.
   */
  function diffChanges(original, edited) {
    var out = {};
    var src = edited || {};
    for (var col in src) {
      if (!Object.prototype.hasOwnProperty.call(src, col)) continue;
      if (!isEditableColumn(col)) continue;
      var before = (original || {})[col];
      var a = (before === undefined || before === null) ? '' : String(before).trim();
      var b = (src[col] === undefined || src[col] === null) ? '' : String(src[col]).trim();
      /* Money compares by value, not by spelling: "725.00" and "725" are the
         same amount, and an edit that changed neither must not be recorded as
         one. */
      if (EDITABLE_COLUMNS[col].type === 'money' && a !== '' && b !== '' &&
          isFinite(Number(a)) && isFinite(Number(b))) {
        if (Number(a) === Number(b)) continue;
      } else if (a === b) {
        continue;
      }
      out[col] = src[col];
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Public surface
  // ═══════════════════════════════════════════════════════════════════════

  return {
    normAr: normAr,
    takePrice: takePrice,
    takeQuantity: takeQuantity,
    takeUnit: takeUnit,
    takeTrailingFraction: takeTrailingFraction,
    itemKey: itemKey,
    scoreParse: scoreParse,
    parseDetails: parseDetails,

    /* §5 — the matcher */
    stemAr: stemAr,
    stemTokens: stemTokens,
    stemKey: stemKey,
    tokenSetDice: tokenSetDice,
    levenshtein: levenshtein,
    normLevenshtein: normLevenshtein,
    trigramBag: trigramBag,
    idfTrigramCosine: idfTrigramCosine,
    unitCompatible: unitCompatible,
    buildMatchIndex: buildMatchIndex,
    matchScore: matchScore,
    matchCandidates: matchCandidates,
    clusterItems: clusterItems,
    MATCH: MATCH,

    /* §8.5 — the edit path */
    EDITABLE_COLUMNS: EDITABLE_COLUMNS,
    LOCKED_COLUMNS: LOCKED_COLUMNS,
    isEditableColumn: isEditableColumn,
    validateColumn: validateColumn,
    validateChanges: validateChanges,
    inItemRange: inItemRange,
    crossesItemBoundary: crossesItemBoundary,
    diffChanges: diffChanges,

    /* §6 — period windows */
    daysInMonth: daysInMonth,
    parseIsoDate: parseIsoDate,
    monthsBefore: monthsBefore,
    accountWindows: accountWindows,
    /* Exposed for the verify harness and for the alias/override UI, which needs
       to show a reviewer which tokens the engine recognises as units. */
    _QUANTITY_WORDS: QUANTITY_WORDS,
    _UNIT_WORDS: UNIT_WORDS,
    _round: round_
  };
})();

/* Node-only export, so tools/verify/ can require this file directly. Apps
   Script has no `module`, so this never runs on the server. */
if (typeof module !== 'undefined' && module.exports) { module.exports = BoxEngine; }
