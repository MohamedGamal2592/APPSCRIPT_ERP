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
  // Date/time arithmetic for the rules — still no Date object
  // ═══════════════════════════════════════════════════════════════════════

  var CUM_DAYS = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

  function isLeap_(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  /** Days since 1970-01-01, as an integer. Pure, and free of any timezone. */
  function dayNumber(y, m, d) {
    var days = 365 * (y - 1970);
    /* Leap days between 1970 and y, exclusive of y itself. */
    days += Math.floor((y - 1969) / 4) - Math.floor((y - 1901) / 100) + Math.floor((y - 1601) / 400);
    days += CUM_DAYS[m] + (m > 2 && isLeap_(y) ? 1 : 0);
    return days + d - 1;
  }

  /** Whole days from a to b (both 'YYYY-MM-DD'). Negative when b precedes a. */
  function daysBetween(aIso, bIso) {
    var a = parseIsoDate(aIso), b = parseIsoDate(bIso);
    if (!a || !b) return null;
    return dayNumber(b.y, b.m, b.d) - dayNumber(a.y, a.m, a.d);
  }

  /** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday (4). */
  function dayOfWeek(y, m, d) {
    var n = dayNumber(y, m, d) + 4;
    return ((n % 7) + 7) % 7;
  }

  /**
   * 'YYYY-MM-DD HH:MM:SS' (or with a 'T') → { y, m, d, hh, mm, ss, date }.
   * Returns null for anything else, rather than guessing — a rule that fires on
   * a misparsed timestamp is an accusation built on nothing.
   */
  function parseDateTime(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || '').trim());
    if (!m) return null;
    var d = parseIsoDate(m[1] + '-' + m[2] + '-' + m[3]);
    if (!d) return null;
    return {
      y: d.y, m: d.m, d: d.d,
      hh: m[4] === undefined ? null : Number(m[4]),
      mm: m[5] === undefined ? null : Number(m[5]),
      ss: m[6] === undefined ? 0 : Number(m[6]),
      date: m[1] + '-' + m[2] + '-' + m[3]
    };
  }

  /** Percentile of a numeric array, linear interpolation. Sorts a copy. */
  function percentile(values, p) {
    var v = (values || []).filter(function (x) { return typeof x === 'number' && isFinite(x); })
      .slice().sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    if (v.length === 1) return v[0];
    var idx = (v.length - 1) * p;
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return v[lo];
    return v[lo] + (v[hi] - v[lo]) * (idx - lo);
  }

  function median(values) { return percentile(values, 0.5); }

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
  // §7 Tier 1 — deterministic integrity rules
  // ═══════════════════════════════════════════════════════════════════════
  //
  // The highest-precision findings in the whole feature, and the only tier that
  // uses no statistics at all. Every one of them is a fact about the row or
  // about a pair of rows, not an inference about a distribution.
  //
  // Every rule returns { rule_id, severity, row_id, evidence[], reason_ar }.
  // reason_ar is a SENTENCE with the numbers in it, not a rule name: this
  // output has to survive an accountant asking "why", and "SUM_MISMATCH" is not
  // an answer to that question. evidence[] carries the rows the reader needs to
  // see to check the claim themselves.
  //
  // Rules that need a population (BACKDATED needs a p95, STRUCTURING needs a
  // histogram) REFUSE to fire below their minimum n and say so in `notes`.
  // A finding is aimed at a named employee; "بيانات غير كافية" is the honest
  // output when there is not enough data, and a weak verdict is not.

  var SEVERITY_AR = { high: 'مرتفع', medium: 'متوسط', low: 'منخفض' };

  var TIER1 = {
    SUM_EPSILON: 1.00,          /* double(16,2) — below this is rounding */
    DUP_WINDOW_DAYS: 7,
    NEAR_DUP_SIMILARITY: 0.85,
    NEAR_DUP_AMOUNT_PCT: 0.02,
    BACKDATE_MIN_N: 30,         /* below this a p95 is noise */
    BACKDATE_MIN_DAYS: 3,       /* never flag a lag this small, whatever p95 says */
    WORK_START_HOUR: 8,
    WORK_END_HOUR: 18,
    WEEKEND_DAYS: [5, 6],       /* Friday, Saturday — the Egyptian week */
    SEQUENCE_TOLERANCE_DAYS: 30,
    STRUCTURING_CANDIDATES: [500, 1000, 2000, 5000, 10000, 20000, 50000],
    STRUCTURING_BAND: 0.10,     /* "just below" = within 10% under the threshold */
    STRUCTURING_MIN_RATIO: 3,   /* the spike must be this much taller than above */
    STRUCTURING_MIN_COUNT: 5,   /* and this many rows, or it is not a spike */
    STRUCTURING_WINDOW_DAYS: 2
  };

  function flag_(ruleId, severity, rowId, reasonAr, evidence) {
    return {
      rule_id: ruleId,
      severity: severity,
      severity_ar: SEVERITY_AR[severity] || severity,
      row_id: rowId === undefined || rowId === null ? null : String(rowId),
      reason_ar: reasonAr,
      evidence: evidence || []
    };
  }

  function amountOf_(row) {
    var n = Number(row && row.transaction_amount);
    return isFinite(n) ? n : null;
  }

  function fmt2_(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2);
  }

  /**
   * Arabic numeral–noun agreement.
   *
   * Arabic does not pluralise the way English does, and getting it wrong is
   * visible in every sentence this engine produces. "4 عملية" is simply
   * incorrect; it has to be "4 عمليات". The rule that matters here:
   *   1        → singular            عملية
   *   2        → dual                عمليتان
   *   3 – 10   → plural              عمليات
   *   11 +     → singular (accusative) عملية
   * so plural and singular ALTERNATE as the number grows, which is exactly the
   * case a naive `n === 1 ? x : xs` gets wrong at 11 and again at 101.
   *
   * A findings page that an accountant is meant to act on cannot be written in
   * broken Arabic; the reader stops trusting the arithmetic too.
   */
  var AR_NOUNS = {
    op:       { one: 'عملية', two: 'عمليتان', few: 'عمليات', many: 'عملية' },
    purchase: { one: 'عملية شراء', two: 'عمليتا شراء', few: 'عمليات شراء', many: 'عملية شراء' },
    movement: { one: 'حركة', two: 'حركتان', few: 'حركات', many: 'حركة' },
    day:      { one: 'يوم', two: 'يومان', few: 'أيام', many: 'يوماً' },
    workday:  { one: 'يوم عمل', two: 'يوما عمل', few: 'أيام عمل', many: 'يوم عمل' },
    month:    { one: 'شهر', two: 'شهران', few: 'أشهر', many: 'شهراً' },
    item:     { one: 'بند', two: 'بندان', few: 'بنود', many: 'بنداً' },
    amount:   { one: 'مبلغ', two: 'مبلغان', few: 'مبالغ', many: 'مبلغاً' }
  };

  function arCount(n, kind) {
    var forms = AR_NOUNS[kind];
    if (!forms) return String(n);
    var v = Math.abs(Number(n));
    /* Agreement follows the last two digits: 111 behaves like 11, not like 1. */
    var mod100 = v % 100;
    var word;
    if (v === 1) word = forms.one;
    else if (v === 2) word = forms.two;
    else if (mod100 >= 3 && mod100 <= 10) word = forms.few;
    else if (mod100 === 1 || mod100 === 2 || mod100 === 0 || mod100 > 10) word = forms.many;
    else word = forms.many;
    /* 1 and 2 carry the count in the noun itself, so the digit is redundant. */
    return (v === 1 || v === 2) ? word : (n + ' ' + word);
  }

  /* ── SUM_MISMATCH ───────────────────────────────────────────────────────
   * Σ parsed item prices against transaction_amount. Free, needs nothing but
   * the parser, and it is the highest-precision signal in the feature: either
   * the parse failed or the description does not account for the money, and
   * both need a human.
   *
   * It does NOT fire when the row has no parsed items, and it does NOT fire
   * when some segment failed to parse — in that case the sum is known to be
   * incomplete, which is a different (and already reported) finding. Firing
   * here too would blame the row for the parser's gap. */
  function ruleSumMismatch(row) {
    var p = row && row.parse;
    if (!p || !p.items || !p.items.length) return null;
    if (p.failed_count > 0) return null;
    var amount = amountOf_(row);
    if (amount === null) return null;
    var diff = round_(p.sum - amount, 2);
    if (Math.abs(diff) <= TIER1.SUM_EPSILON) return null;
    return flag_('SUM_MISMATCH', 'high', row.id,
      'مجموع أسعار البنود ' + fmt2_(p.sum) + ' لا يساوي المبلغ المسجل ' + fmt2_(amount) +
      ' — الفرق ' + fmt2_(Math.abs(diff)) + ' ' +
      (diff > 0 ? '(البنود أكبر من المبلغ)' : '(المبلغ أكبر من البنود)'),
      [{ row_id: String(row.id), items_sum: p.sum, transaction_amount: amount, difference: diff }]);
  }

  /* ── EXACT_DUP and NEAR_DUP ─────────────────────────────────────────────
   * Double claiming. Both are pair rules, so both flag BOTH rows — a reader
   * looking at either one needs to be told about the other. */
  function ruleDuplicates(rows, opts) {
    var o = opts || {};
    var windowDays = o.dup_window_days || TIER1.DUP_WINDOW_DAYS;
    var simThreshold = o.near_dup_similarity || TIER1.NEAR_DUP_SIMILARITY;
    var amtPct = o.near_dup_amount_pct || TIER1.NEAR_DUP_AMOUNT_PCT;
    var out = [];

    var list = (rows || []).filter(function (r) {
      return r && r.transaction_date && amountOf_(r) !== null;
    }).map(function (r) {
      var norm = normAr(r.transaction_details);
      /* NEAR_DUP compares WHAT WAS BOUGHT, not the raw details string.
         Comparing the whole string puts the price digits in the token set, so
         two rows that differ only in price — the exact shape a near-duplicate
         claim takes — score LOWER than two unrelated rows that happen to share
         a price. On the first run this cost the intended fixture pair 0.833
         against a 0.85 threshold and the rule found nothing at all.
         The amounts are compared separately, just below, so leaving them out of
         the text similarity is not losing a signal; it is not counting the same
         one twice. Rows whose details did not parse fall back to the full text,
         which is the best available. */
      var items = (r.parse && r.parse.items) || [];
      var itemText = items.length
        ? items.map(function (it) { return it.item_norm; }).join(' ')
        : norm;
      return {
        row: r,
        norm: norm,
        stems: stemTokens(itemText),
        amount: amountOf_(r),
        box: String(r.box_code == null ? '' : r.box_code),
        person: String(r.responsible_person == null ? '' : r.responsible_person).trim()
      };
    });

    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j];
        var gap = daysBetween(a.row.transaction_date, b.row.transaction_date);
        if (gap === null || Math.abs(gap) > windowDays) continue;
        if (!a.norm && !b.norm) continue;

        if (a.norm === b.norm && a.amount === b.amount && a.box === b.box) {
          var ev = [
            { row_id: String(a.row.id), transaction_date: a.row.transaction_date, transaction_amount: a.amount, transaction_details: a.row.transaction_details },
            { row_id: String(b.row.id), transaction_date: b.row.transaction_date, transaction_amount: b.amount, transaction_details: b.row.transaction_details }
          ];
          var msg = 'حركة مطابقة تماماً: نفس التفاصيل ونفس المبلغ ' + fmt2_(a.amount) +
            ' ونفس الخزنة، بفارق ' + arCount(Math.abs(gap), 'day') + ' — الحركتان رقم ' +
            a.row.id + ' و' + b.row.id;
          out.push(flag_('EXACT_DUP', 'high', a.row.id, msg, ev));
          out.push(flag_('EXACT_DUP', 'high', b.row.id, msg, ev));
          continue;
        }

        /* Near duplicate: similar wording AND a similar amount. Either alone is
           ordinary — the same item bought twice at different prices, or two
           unrelated purchases that happen to cost the same. */
        var denom = Math.max(Math.abs(a.amount), Math.abs(b.amount));
        var amtClose = denom === 0 ? (a.amount === b.amount)
          : (Math.abs(a.amount - b.amount) / denom) <= amtPct;
        if (!amtClose) continue;
        var sim = tokenSetDice(a.stems, b.stems);
        if (sim < simThreshold) continue;
        if (a.norm === b.norm && a.amount === b.amount && a.box === b.box) continue;   /* already EXACT */

        var ev2 = [
          { row_id: String(a.row.id), transaction_date: a.row.transaction_date, transaction_amount: a.amount, transaction_details: a.row.transaction_details },
          { row_id: String(b.row.id), transaction_date: b.row.transaction_date, transaction_amount: b.amount, transaction_details: b.row.transaction_details }
        ];
        var msg2 = 'حركتان متقاربتان جداً: تشابه التفاصيل ' + Math.round(sim * 100) + '%' +
          ' والمبلغان ' + fmt2_(a.amount) + ' و' + fmt2_(b.amount) +
          ' بفارق ' + arCount(Math.abs(gap), 'day') + ' — الحركتان رقم ' + a.row.id + ' و' + b.row.id;
        out.push(flag_('NEAR_DUP', 'medium', a.row.id, msg2, ev2));
        out.push(flag_('NEAR_DUP', 'medium', b.row.id, msg2, ev2));
      }
    }
    return out;
  }

  /* ── BACKDATED ──────────────────────────────────────────────────────────
   * created_at − transaction_date, against the p95 of THIS population rather
   * than a number somebody picked. In an office where everything is keyed a
   * week late, a week late is not evidence of anything.
   *
   * Refuses to fire below BACKDATE_MIN_N: a p95 over 12 rows is the second
   * largest value, which is not a percentile, it is just the second largest
   * value. */
  function ruleBackdated(rows, opts) {
    var o = opts || {};
    var minN = o.backdate_min_n === undefined ? TIER1.BACKDATE_MIN_N : o.backdate_min_n;
    var lags = [];
    var perRow = [];

    (rows || []).forEach(function (r) {
      if (!r || !r.transaction_date || !r.created_at) return;
      var c = parseDateTime(r.created_at);
      if (!c) return;
      var lag = daysBetween(r.transaction_date, c.date);
      if (lag === null) return;
      lags.push(lag);
      perRow.push({ row: r, lag: lag });
    });

    if (lags.length < minN) {
      return {
        flags: [],
        note: {
          rule_id: 'BACKDATED',
          status: 'insufficient_data',
          n: lags.length,
          required: minN,
          reason_ar: 'بيانات غير كافية لحساب حد التأخير (المطلوب ' + arCount(minN, 'movement') +
            ' على الأقل، والمتاح ' + lags.length + ')'
        }
      };
    }

    var p95 = percentile(lags, 0.95);
    var threshold = Math.max(p95, TIER1.BACKDATE_MIN_DAYS);
    var flags = [];
    perRow.forEach(function (x) {
      if (x.lag <= threshold) return;
      flags.push(flag_('BACKDATED', 'medium', x.row.id,
        'أُدخلت الحركة بعد تاريخها بـ ' + arCount(x.lag, 'day') + '، وهو أعلى من الحد المحسوب من هذه المجموعة نفسها (' +
        'الشريحة 95% = ' + fmt2_(p95) + ' يوم من ' + arCount(lags.length, 'movement') + ')',
        [{ row_id: String(x.row.id), transaction_date: x.row.transaction_date,
           created_at: x.row.created_at, lag_days: x.lag, p95_days: round_(p95, 2), n: lags.length }]));
    });
    return { flags: flags, note: null };
  }

  /* ── ODD_HOUR ───────────────────────────────────────────────────────────
   * Keyed outside working hours or at the weekend. Weekend here is Friday and
   * Saturday.
   *
   * PUBLIC HOLIDAYS ARE NOT CHECKED — there is no holiday calendar in this
   * system, and inventing one would produce confident nonsense twice a year.
   * The severity is deliberately 'low': working late is not fraud, it is a
   * detail that matters only next to something else. */
  function ruleOddHour(row, opts) {
    var o = opts || {};
    var startH = o.work_start_hour === undefined ? TIER1.WORK_START_HOUR : o.work_start_hour;
    var endH = o.work_end_hour === undefined ? TIER1.WORK_END_HOUR : o.work_end_hour;
    var weekend = o.weekend_days || TIER1.WEEKEND_DAYS;
    if (!row || !row.created_at) return null;
    var c = parseDateTime(row.created_at);
    if (!c || c.hh === null) return null;

    var dow = dayOfWeek(c.y, c.m, c.d);
    var isWeekend = weekend.indexOf(dow) !== -1;
    var outOfHours = c.hh < startH || c.hh >= endH;
    if (!isWeekend && !outOfHours) return null;

    var names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    var parts = [];
    if (isWeekend) parts.push('يوم ' + names[dow] + ' (عطلة أسبوعية)');
    if (outOfHours) parts.push('الساعة ' + (c.hh < 10 ? '0' : '') + c.hh + ':' +
      (c.mm === null ? '00' : (c.mm < 10 ? '0' : '') + c.mm) +
      ' خارج ساعات العمل ' + startH + ':00–' + endH + ':00');
    return flag_('ODD_HOUR', 'low', row.id,
      'أُدخلت الحركة ' + parts.join(' و') + ' (لا تُحتسب الأعياد الرسمية — لا يوجد تقويم إجازات في النظام)',
      [{ row_id: String(row.id), created_at: row.created_at, day_of_week: dow }]);
  }

  /* ── EDITED_AFTER_REVIEW ────────────────────────────────────────────────
   * updated_at > created_at on a row marked reviewed.
   *
   * THIS IS WHY THE AUDIT LOG EXISTS. Without it, this rule fires on the
   * page's own legitimate edits with no way to tell them from an outside
   * change, and the feature spends its credibility flagging itself. With it,
   * an edit made through this page is reported at LOW severity naming who made
   * it, and only an unexplained change is reported at HIGH.
   *
   * auditIndex: { movement_id: [applied entries] } — built by the caller,
   * because reading Drive is I/O and this file does none. */
  function ruleEditedAfterReview(row, auditIndex) {
    if (!row) return null;
    if (String(row.is_revised) !== '1') return null;
    if (!row.created_at || !row.updated_at) return null;
    /* 'YYYY-MM-DD HH:MM:SS' compares correctly as a string. */
    if (!(String(row.updated_at) > String(row.created_at))) return null;

    var entries = (auditIndex || {})[String(row.id)] || [];
    if (entries.length) {
      var last = entries[entries.length - 1];
      var who = (last.user && (last.user.name || last.user.email)) || 'مستخدم غير معروف';
      var cols = (last.changes || []).map(function (c) {
        var spec = EDITABLE_COLUMNS[c.column];
        return spec ? spec.label_ar : c.column;
      });
      return flag_('EDITED_AFTER_REVIEW', 'low', row.id,
        'عُدِّلت الحركة بعد اعتماد مراجعتها — والتعديل مسجَّل في سجل التدقيق بواسطة ' + who +
        (cols.length ? ' على: ' + cols.join('، ') : '') + ' بتاريخ ' + (last.when || '—'),
        [{ row_id: String(row.id), created_at: row.created_at, updated_at: row.updated_at,
           audit: last }]);
    }

    return flag_('EDITED_AFTER_REVIEW', 'high', row.id,
      'عُدِّلت الحركة بعد اعتماد مراجعتها ولا يوجد لها أي سجل تدقيق — أي أن التغيير لم يتم من خلال هذه الصفحة',
      [{ row_id: String(row.id), created_at: row.created_at, updated_at: row.updated_at, audit: null }]);
  }

  /* ── OUT_OF_SEQUENCE ────────────────────────────────────────────────────
   * id order contradicting transaction_date order. ids are assigned on insert,
   * so a much later id carrying a much earlier date is a row entered out of
   * order.
   *
   * Tolerance is 30 days by default and deliberately generous. Petty cash is
   * routinely keyed a few days late, so a small inversion is normal life; a
   * tight tolerance here would flag half the table and the rule would be
   * switched off within a week. It is also only meaningful over a CONTIGUOUS
   * range of ids — on a filtered page the gaps are the filter's, not the
   * data's — which is why the caller is told so in `notes`.
   *
   * IT FLAGS THE ODD ONE OUT, NOT EVERYTHING AFTER IT. The first version
   * compared each row against the running maximum date, so a single row dated
   * three months in the future flagged all twelve rows that followed it — one
   * anomaly, twelve accusations, and an alerts tab nobody would read twice.
   * A row is reported only when it is far from BOTH of its id-neighbours in the
   * same direction, which is what "out of sequence" actually means. The first
   * and last rows of the set have one neighbour each and are skipped: a
   * one-sided comparison is exactly the thing that cascaded. */
  function ruleOutOfSequence(rows, opts) {
    var o = opts || {};
    var tol = o.sequence_tolerance_days === undefined ? TIER1.SEQUENCE_TOLERANCE_DAYS : o.sequence_tolerance_days;
    var list = (rows || []).filter(function (r) {
      return r && r.transaction_date && r.id !== undefined && r.id !== null && /^\d+$/.test(String(r.id));
    }).slice().sort(function (a, b) {
      var x = String(a.id), y = String(b.id);
      return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);   /* bigint-safe */
    });

    var out = [];
    for (var i = 1; i < list.length - 1; i++) {
      var prev = list[i - 1], cur = list[i], next = list[i + 1];
      var backGap = daysBetween(prev.transaction_date, cur.transaction_date);   /* cur − prev */
      var fwdGap = daysBetween(next.transaction_date, cur.transaction_date);    /* cur − next */
      if (backGap === null || fwdGap === null) continue;

      var ev = [
        { row_id: String(prev.id), transaction_date: prev.transaction_date },
        { row_id: String(cur.id), transaction_date: cur.transaction_date },
        { row_id: String(next.id), transaction_date: next.transaction_date }
      ];

      if (backGap < -tol && fwdGap < -tol) {
        out.push(flag_('OUT_OF_SEQUENCE', 'medium', cur.id,
          'ترتيب الإدخال يخالف التاريخ: الحركة رقم ' + cur.id + ' مسجَّلة بين الحركتين ' +
          prev.id + ' و' + next.id + ' لكن تاريخها ' + cur.transaction_date +
          ' أقدم من كلتيهما بـ ' + Math.abs(backGap) + ' و' + arCount(Math.abs(fwdGap), 'day') + '',
          ev));
      } else if (backGap > tol && fwdGap > tol) {
        out.push(flag_('OUT_OF_SEQUENCE', 'medium', cur.id,
          'ترتيب الإدخال يخالف التاريخ: الحركة رقم ' + cur.id + ' مسجَّلة بين الحركتين ' +
          prev.id + ' و' + next.id + ' لكن تاريخها ' + cur.transaction_date +
          ' أحدث من كلتيهما بـ ' + backGap + ' و' + arCount(fwdGap, 'day') + '',
          ev));
      }
    }
    return out;
  }

  /* ── STRUCTURING ────────────────────────────────────────────────────────
   * Several rows, same account and person, inside a short window, each just
   * under a round threshold, summing above it.
   *
   * The thresholds are DERIVED, not guessed. For each candidate round number T
   * the amount histogram is checked for a spike immediately below it: the count
   * in [0.9T, T) against the count in [T, 1.1T). A real approval limit leaves a
   * pile just under it and a hole just over it. A candidate with no such spike
   * is not a limit in this organisation and is dropped, so the rule cannot flag
   * people for being near a number that means nothing here.
   *
   * Below STRUCTURING_MIN_COUNT rows in the band there is no histogram to read
   * and the rule reports insufficient data rather than a weak verdict. */
  function detectStructuringThresholds(rows, opts) {
    var o = opts || {};
    var candidates = o.structuring_candidates || TIER1.STRUCTURING_CANDIDATES;
    var band = o.structuring_band === undefined ? TIER1.STRUCTURING_BAND : o.structuring_band;
    var minRatio = o.structuring_min_ratio === undefined ? TIER1.STRUCTURING_MIN_RATIO : o.structuring_min_ratio;
    var minCount = o.structuring_min_count === undefined ? TIER1.STRUCTURING_MIN_COUNT : o.structuring_min_count;

    var amounts = (rows || []).map(amountOf_).filter(function (a) { return a !== null && a > 0; });
    var active = [];
    candidates.forEach(function (T) {
      var below = 0, above = 0;
      amounts.forEach(function (a) {
        if (a >= T * (1 - band) && a < T) below++;
        else if (a >= T && a < T * (1 + band)) above++;
      });
      var ratio = below / Math.max(1, above);
      if (below >= minCount && ratio >= minRatio) {
        active.push({ threshold: T, below: below, above: above, ratio: round_(ratio, 2) });
      }
    });
    return { thresholds: active, n_amounts: amounts.length, band: band };
  }

  function ruleStructuring(rows, opts) {
    var o = opts || {};
    var windowDays = o.structuring_window_days === undefined ? TIER1.STRUCTURING_WINDOW_DAYS : o.structuring_window_days;
    var detected = detectStructuringThresholds(rows, o);

    if (!detected.thresholds.length) {
      return {
        flags: [],
        detected: detected,
        note: {
          rule_id: 'STRUCTURING',
          status: 'no_threshold_detected',
          n: detected.n_amounts,
          reason_ar: 'لم يظهر في توزيع المبالغ أي تكدّس أسفل رقم مستدير، فلا يوجد حد اعتماد يُستدل عليه من البيانات — ' +
            'ولا تُطبَّق هذه القاعدة بحدود مفترضة'
        }
      };
    }

    /* Group by account + person, then slide a window over each group's dates. */
    var groups = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.transaction_date) return;
      var amt = amountOf_(r);
      if (amt === null || amt <= 0) return;
      var key = String(r.chart_of_accounts || '') + ' ' + String(r.responsible_person || '').trim();
      (groups[key] = groups[key] || []).push(r);
    });

    var out = [];
    var seen = {};
    Object.keys(groups).forEach(function (key) {
      var g = groups[key].slice().sort(function (a, b) {
        return a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : 0;
      });
      detected.thresholds.forEach(function (t) {
        var T = t.threshold;
        var inBand = g.filter(function (r) {
          var a = amountOf_(r);
          return a >= T * (1 - detected.band) && a < T;
        });
        for (var i = 0; i < inBand.length; i++) {
          var cluster = [inBand[i]];
          var sum = amountOf_(inBand[i]);
          for (var j = i + 1; j < inBand.length; j++) {
            var gap = daysBetween(inBand[i].transaction_date, inBand[j].transaction_date);
            if (gap === null || gap > windowDays) break;
            cluster.push(inBand[j]);
            sum += amountOf_(inBand[j]);
          }
          if (cluster.length < 2 || sum <= T) continue;

          var ids = cluster.map(function (r) { return String(r.id); });
          var sig = ids.join(',') + '@' + T;
          if (seen[sig]) continue;
          seen[sig] = true;

          var ev = cluster.map(function (r) {
            return { row_id: String(r.id), transaction_date: r.transaction_date,
                     transaction_amount: amountOf_(r), responsible_person: r.responsible_person,
                     chart_of_accounts: r.chart_of_accounts };
          });
          var msg = arCount(cluster.length, 'movement') + ' لنفس المسؤول ونفس الحساب خلال ' +
            arCount(daysBetween(cluster[0].transaction_date, cluster[cluster.length - 1].transaction_date) || 0, 'day') +
            '، كل منها أقل بقليل من ' + fmt2_(T) + ' ومجموعها ' + fmt2_(sum) +
            ' أي أعلى منه. وحد الـ' + fmt2_(T) + ' مستنتج من البيانات نفسها: ' +
            arCount(t.below, 'movement') + ' أسفله مقابل ' + t.above + ' فوقه.';
          cluster.forEach(function (r) {
            out.push(flag_('STRUCTURING', 'high', r.id, msg, ev));
          });
          i += cluster.length - 1;
        }
      });
    });
    return { flags: out, detected: detected, note: null };
  }

  /**
   * Run every Tier 1 rule over a set of movement rows.
   *
   * rows: movement rows, each optionally carrying `parse` from parseDetails.
   * opts.auditIndex: { movement_id: [applied audit entries] }, built by the
   *   caller — reading Drive is I/O and this file does none.
   *
   * Returns { flags, by_row, notes, structuring }.
   * `notes` is where a rule says it did NOT run and why. That is not an
   * implementation detail to hide: "no finding" and "could not look" are
   * different answers, and only one of them is reassuring.
   */
  function runTier1(rows, opts) {
    var o = opts || {};
    var list = rows || [];
    var flags = [];
    var notes = [];

    list.forEach(function (row) {
      var f;
      f = ruleSumMismatch(row); if (f) flags.push(f);
      f = ruleOddHour(row, o); if (f) flags.push(f);
      f = ruleEditedAfterReview(row, o.auditIndex); if (f) flags.push(f);
    });

    flags = flags.concat(ruleDuplicates(list, o));
    flags = flags.concat(ruleOutOfSequence(list, o));

    var back = ruleBackdated(list, o);
    flags = flags.concat(back.flags);
    if (back.note) notes.push(back.note);

    var struct = ruleStructuring(list, o);
    flags = flags.concat(struct.flags);
    if (struct.note) notes.push(struct.note);

    if (list.length) {
      notes.push({
        rule_id: 'OUT_OF_SEQUENCE',
        status: 'scope',
        reason_ar: 'تُقارَن أرقام الحركات داخل المعروض فقط؛ إذا كانت الفلاتر تُخفي حركات بينها فقد ' +
          'تظهر مخالفات ترتيب ليست في البيانات الأصلية'
      });
    }

    var byRow = {};
    flags.forEach(function (f) {
      if (f.row_id === null) return;
      (byRow[f.row_id] = byRow[f.row_id] || []).push(f);
    });

    return { flags: flags, by_row: byRow, notes: notes, structuring: struct.detected };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // §7 Tier 2 — price anomalies, per item cluster
  // ═══════════════════════════════════════════════════════════════════════
  //
  // MEDIAN AND MAD, NEVER MEAN AND σ. This is not a style preference. These
  // samples are small — a dozen purchases of one item is a good sample here —
  // and the contamination is exactly what we are hunting. A mean is dragged
  // toward the very rows it is supposed to expose: one inflated purchase raises
  // the average, which raises the threshold, which makes that purchase look
  // less unusual than it is. The median does not move, and the MAD does not
  // move, so an outlier stays an outlier no matter how large it is.
  //
  // Every rule here refuses to run below a minimum n and says so. A price
  // finding names an employee; "بيانات غير كافية" is the honest output when
  // there is not enough history, and a weak verdict is not.

  var TIER2 = {
    MIN_N: 6,                  /* below this, a median and a MAD say nothing */
    Z_THRESHOLD: 3.5,          /* modified z-score, the conventional cut */
    MAD_SCALE: 0.6745,         /* 0.6745 = Φ⁻¹(0.75); makes MAD comparable to σ */
    MEANAD_SCALE: 1.253314,    /* used only when MAD is exactly 0 */
    PEER_MIN_N: 3,             /* per side */
    PEER_RATIO: 1.25,          /* 25% above the peer median */
    RATCHET_MIN_N: 5,
    RATCHET_TAU: 0.6,          /* Mann–Kendall τ for the person */
    RATCHET_PEER_TAU: 0.3,     /* …while everyone else is flatter than this */
    NEW_ITEM_MIN_ACCOUNT_N: 10,
    NEW_ITEM_PERCENTILE: 0.9
  };

  /** Median absolute deviation. */
  function mad(values) {
    var m = median(values);
    if (m === null) return null;
    return median(values.map(function (x) { return Math.abs(x - m); }));
  }

  /**
   * Robust dispersion summary. `scale` is what the modified z-score divides by:
   * the MAD normally, and — only when the MAD is exactly zero, which happens
   * whenever more than half the sample is one identical price — the mean
   * absolute deviation instead. Without that fallback, a single different price
   * against a pile of identical ones divides by zero and every rule downstream
   * reports Infinity.
   */
  function robustStats(values) {
    var v = (values || []).filter(function (x) { return typeof x === 'number' && isFinite(x); });
    if (!v.length) return null;
    var m = median(v);
    var d = mad(v);
    var scale = d, scaleKind = 'mad';
    if (!d) {
      var meanAd = v.reduce(function (a, x) { return a + Math.abs(x - m); }, 0) / v.length;
      scale = meanAd * TIER2.MEANAD_SCALE;
      scaleKind = meanAd ? 'meanad' : 'none';
    }
    return {
      n: v.length,
      median: round_(m, 4),
      mad: d === null ? null : round_(d, 4),
      scale: scale ? round_(scale, 6) : 0,
      scale_kind: scaleKind,
      min: round_(Math.min.apply(null, v), 4),
      max: round_(Math.max.apply(null, v), 4),
      p25: round_(percentile(v, 0.25), 4),
      p75: round_(percentile(v, 0.75), 4)
    };
  }

  /** Modified z-score. Null when there is no dispersion to measure against. */
  function modifiedZ(x, stats) {
    if (!stats || !stats.scale) return null;
    return round_(TIER2.MAD_SCALE * (x - stats.median) / stats.scale, 3);
  }

  /**
   * Mann–Kendall τ over a series already in time order. +1 is monotone
   * increasing, −1 monotone decreasing, 0 no trend. Rank-based, so one wild
   * value cannot manufacture a trend the way a least-squares slope can.
   */
  function mannKendallTau(series) {
    var v = (series || []).filter(function (x) { return typeof x === 'number' && isFinite(x); });
    var n = v.length;
    if (n < 3) return null;
    var s = 0;
    for (var i = 0; i < n - 1; i++) {
      for (var j = i + 1; j < n; j++) {
        s += (v[j] > v[i]) ? 1 : (v[j] < v[i]) ? -1 : 0;
      }
    }
    return round_(s / (n * (n - 1) / 2), 4);
  }

  /**
   * Per-cluster price statistics. This is both what Tier 2 reasons over and
   * what tab 3 renders, so the number a reviewer reads and the number the rule
   * fired on are the same number by construction.
   *
   * occurrences: [{ movement_id, transaction_date, item_norm, unit, qty,
   *                 price, unit_price, responsible_person, chart_of_accounts }]
   * byNorm: { item_norm: cluster_id } from clusterItems.
   */
  function clusterPriceStats(occurrences, byNorm) {
    var buckets = {};
    (occurrences || []).forEach(function (o) {
      if (!o || o.unit_price === null || o.unit_price === undefined) return;
      var cid = (byNorm || {})[o.item_norm];
      if (cid === undefined) cid = o.item_norm;
      var b = buckets[cid] = buckets[cid] || { cluster_id: cid, occurrences: [], labels: {} };
      b.occurrences.push(o);
      b.labels[o.item_norm] = (b.labels[o.item_norm] || 0) + 1;
    });

    var out = {};
    Object.keys(buckets).forEach(function (cid) {
      var b = buckets[cid];
      var prices = b.occurrences.map(function (o) { return Number(o.unit_price); });
      var qtys = b.occurrences.map(function (o) { return Number(o.qty); })
        .filter(function (q) { return isFinite(q); });
      var label = Object.keys(b.labels).sort(function (x, y) { return b.labels[y] - b.labels[x]; })[0];

      var byPerson = {};
      b.occurrences.forEach(function (o) {
        var p = String(o.responsible_person || '').trim() || '(غير محدد)';
        (byPerson[p] = byPerson[p] || []).push(Number(o.unit_price));
      });
      var people = {};
      Object.keys(byPerson).forEach(function (p) {
        people[p] = { n: byPerson[p].length, median: round_(median(byPerson[p]), 4) };
      });

      out[cid] = {
        cluster_id: cid,
        label: label,
        n: b.occurrences.length,
        price: robustStats(prices),
        qty: robustStats(qtys),
        by_person: people,
        occurrences: b.occurrences
      };
    });
    return out;
  }

  /* ── PRICE_OUTLIER ──────────────────────────────────────────────────────
   * Modified z-score on unit_price within the item's own cluster. */
  function rulePriceOutlier(stats, opts) {
    var o = opts || {};
    var minN = o.tier2_min_n === undefined ? TIER2.MIN_N : o.tier2_min_n;
    var zCut = o.tier2_z === undefined ? TIER2.Z_THRESHOLD : o.tier2_z;
    var flags = [], notes = [];

    Object.keys(stats).forEach(function (cid) {
      var c = stats[cid];
      if (c.n < minN) {
        notes.push({ rule_id: 'PRICE_OUTLIER', status: 'insufficient_data', cluster_id: cid,
          n: c.n, required: minN,
          reason_ar: 'بيانات غير كافية لتحليل سعر «' + c.label + '» (المتاح ' + arCount(c.n, 'purchase') +
            '، والمطلوب ' + minN + ')' });
        return;
      }
      if (!c.price || !c.price.scale) {
        notes.push({ rule_id: 'PRICE_OUTLIER', status: 'no_dispersion', cluster_id: cid, n: c.n,
          reason_ar: 'كل عمليات شراء «' + c.label + '» بنفس سعر الوحدة، فلا يوجد تشتت يُقاس عليه' });
        return;
      }
      c.occurrences.forEach(function (occ) {
        var z = modifiedZ(Number(occ.unit_price), c.price);
        if (z === null || Math.abs(z) <= zCut) return;
        flags.push(flag_('PRICE_OUTLIER', Math.abs(z) > zCut * 2 ? 'high' : 'medium', occ.movement_id,
          'سعر وحدة «' + c.label + '» في هذه الحركة ' + fmt2_(occ.unit_price) +
          '، والوسيط التاريخي ' + fmt2_(c.price.median) + ' من ' + arCount(c.n, 'purchase') +
          ' (المدى ' + fmt2_(c.price.min) + '–' + fmt2_(c.price.max) + ')' +
          ' — درجة انحراف ' + z + ' مقياس مقاوم للقيم الشاذة (الوسيط والانحراف المطلق الوسيط، لا المتوسط)',
          [{ row_id: String(occ.movement_id), transaction_date: occ.transaction_date,
             item: occ.item_norm, unit_price: occ.unit_price,
             cluster_median: c.price.median, cluster_n: c.n, modified_z: z,
             responsible_person: occ.responsible_person }]));
      });
    });
    return { flags: flags, notes: notes };
  }

  /* ── PEER_GAP ───────────────────────────────────────────────────────────
   * The same item, the same period: this person's median unit price against
   * everyone else's. The single strongest petty-cash signal, because it holds
   * the item constant and varies only who bought it. */
  function rulePeerGap(stats, opts) {
    var o = opts || {};
    var minSide = o.peer_min_n === undefined ? TIER2.PEER_MIN_N : o.peer_min_n;
    var ratioCut = o.peer_ratio === undefined ? TIER2.PEER_RATIO : o.peer_ratio;
    var flags = [], notes = [];

    Object.keys(stats).forEach(function (cid) {
      var c = stats[cid];
      var people = Object.keys(c.by_person);
      if (people.length < 2) return;

      people.forEach(function (person) {
        var mine = [], theirs = [];
        c.occurrences.forEach(function (occ) {
          var p = String(occ.responsible_person || '').trim() || '(غير محدد)';
          (p === person ? mine : theirs).push(Number(occ.unit_price));
        });
        if (mine.length < minSide || theirs.length < minSide) return;
        var myMed = median(mine), theirMed = median(theirs);
        if (!theirMed) return;
        var ratio = myMed / theirMed;
        if (ratio < ratioCut) return;

        var rows = c.occurrences.filter(function (occ) {
          return (String(occ.responsible_person || '').trim() || '(غير محدد)') === person;
        });
        var msg = 'يشتري ' + person + ' صنف «' + c.label + '» بوسيط سعر وحدة ' + fmt2_(myMed) +
          ' مقابل ' + fmt2_(theirMed) + ' لباقي المسؤولين — أي أعلى بنسبة ' +
          Math.round((ratio - 1) * 100) + '% (' + arCount(mine.length, 'op') + ' مقابل ' + theirs.length + ')';
        rows.forEach(function (occ) {
          flags.push(flag_('PEER_GAP', ratio >= ratioCut * 1.6 ? 'high' : 'medium', occ.movement_id, msg,
            rows.map(function (r) {
              return { row_id: String(r.movement_id), transaction_date: r.transaction_date,
                       item: r.item_norm, unit_price: r.unit_price, responsible_person: person };
            }).concat([{ row_id: null, peer_median: round_(theirMed, 4), peer_n: theirs.length }])));
        });
      });
    });
    return { flags: flags, notes: notes };
  }

  /* ── PRICE_RATCHET ──────────────────────────────────────────────────────
   * One person's unit price for an item climbing monotonically while everyone
   * else's stays flat. Mann–Kendall rather than a regression slope: it is
   * rank-based, so a single large purchase cannot manufacture a trend. */
  function rulePriceRatchet(stats, opts) {
    var o = opts || {};
    var minN = o.ratchet_min_n === undefined ? TIER2.RATCHET_MIN_N : o.ratchet_min_n;
    var tauCut = o.ratchet_tau === undefined ? TIER2.RATCHET_TAU : o.ratchet_tau;
    var peerTauCut = o.ratchet_peer_tau === undefined ? TIER2.RATCHET_PEER_TAU : o.ratchet_peer_tau;
    var flags = [], notes = [];

    Object.keys(stats).forEach(function (cid) {
      var c = stats[cid];
      var people = Object.keys(c.by_person);
      people.forEach(function (person) {
        var mine = [], theirs = [];
        c.occurrences.slice().sort(function (a, b) {
          return a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : 0;
        }).forEach(function (occ) {
          var p = String(occ.responsible_person || '').trim() || '(غير محدد)';
          (p === person ? mine : theirs).push(occ);
        });
        if (mine.length < minN) return;

        var myTau = mannKendallTau(mine.map(function (x) { return Number(x.unit_price); }));
        if (myTau === null || myTau < tauCut) return;
        var theirTau = theirs.length >= 3
          ? mannKendallTau(theirs.map(function (x) { return Number(x.unit_price); }))
          : null;
        if (theirTau !== null && theirTau >= peerTauCut) return;   /* everyone is rising — a market move */

        var first = Number(mine[0].unit_price), last = Number(mine[mine.length - 1].unit_price);
        if (!(last > first)) return;

        var msg = 'سعر وحدة «' + c.label + '» لدى ' + person + ' في ارتفاع مطّرد: من ' +
          fmt2_(first) + ' في ' + mine[0].transaction_date + ' إلى ' + fmt2_(last) + ' في ' +
          mine[mine.length - 1].transaction_date + ' عبر ' + arCount(mine.length, 'op') + ' (معامل اتجاه ' +
          myTau + ')' +
          (theirTau === null
            ? ' — ولا توجد بيانات كافية لباقي المسؤولين للمقارنة'
            : '، بينما اتجاه باقي المسؤولين ' + theirTau + ' أي شبه ثابت');
        mine.forEach(function (occ) {
          flags.push(flag_('PRICE_RATCHET', 'medium', occ.movement_id, msg,
            mine.map(function (r) {
              return { row_id: String(r.movement_id), transaction_date: r.transaction_date,
                       item: r.item_norm, unit_price: r.unit_price, responsible_person: person };
            })));
        });
      });
    });
    return { flags: flags, notes: notes };
  }

  /* ── NEW_ITEM_HIGH_VALUE ────────────────────────────────────────────────
   * An item bought exactly once, at a price high for its account. Cheap to
   * check and it is where a fabricated purchase tends to land: something that
   * has no history to be compared against. */
  function ruleNewItemHighValue(stats, occurrences, opts) {
    var o = opts || {};
    var minAcctN = o.new_item_min_account_n === undefined ? TIER2.NEW_ITEM_MIN_ACCOUNT_N : o.new_item_min_account_n;
    var pct = o.new_item_percentile === undefined ? TIER2.NEW_ITEM_PERCENTILE : o.new_item_percentile;
    var flags = [], notes = [];

    var byAccount = {};
    (occurrences || []).forEach(function (occ) {
      var a = String(occ.chart_of_accounts || '').trim();
      if (!a) return;
      (byAccount[a] = byAccount[a] || []).push(Number(occ.price));
    });

    Object.keys(stats).forEach(function (cid) {
      var c = stats[cid];
      if (c.n !== 1) return;
      var occ = c.occurrences[0];
      var acct = String(occ.chart_of_accounts || '').trim();
      var pop = byAccount[acct] || [];
      if (pop.length < minAcctN) {
        notes.push({ rule_id: 'NEW_ITEM_HIGH_VALUE', status: 'insufficient_data', cluster_id: cid,
          n: pop.length, required: minAcctN,
          reason_ar: 'بيانات غير كافية لحساب المعتاد لحساب ' + acct + ' (المتاح ' + arCount(pop.length, 'item') +
            '، والمطلوب ' + minAcctN + ')' });
        return;
      }
      var cut = percentile(pop, pct);
      if (!(Number(occ.price) > cut)) return;
      flags.push(flag_('NEW_ITEM_HIGH_VALUE', 'medium', occ.movement_id,
        'صنف «' + c.label + '» لم يُشترَ من قبل في هذه الفترة، وسعره ' + fmt2_(occ.price) +
        ' أعلى من ' + Math.round(pct * 100) + '% من بنود حساب ' + acct +
        ' (الحد ' + fmt2_(cut) + ' من ' + arCount(pop.length, 'item') + ')',
        [{ row_id: String(occ.movement_id), transaction_date: occ.transaction_date,
           item: occ.item_norm, price: occ.price, account_cut: round_(cut, 2),
           account_n: pop.length, responsible_person: occ.responsible_person }]));
    });
    return { flags: flags, notes: notes };
  }

  /* ── QUANTITY_ANOMALY ───────────────────────────────────────────────────
   * The unit price is entirely normal and the QUANTITY is not. Worth its own
   * rule because a price check alone cannot see it: buying ten times the usual
   * amount at the usual price passes every price rule in this tier. */
  function ruleQuantityAnomaly(stats, opts) {
    var o = opts || {};
    var minN = o.tier2_min_n === undefined ? TIER2.MIN_N : o.tier2_min_n;
    var zCut = o.tier2_z === undefined ? TIER2.Z_THRESHOLD : o.tier2_z;
    var flags = [];

    Object.keys(stats).forEach(function (cid) {
      var c = stats[cid];
      if (c.n < minN || !c.qty || !c.qty.scale) return;
      c.occurrences.forEach(function (occ) {
        var q = Number(occ.qty);
        if (!isFinite(q)) return;
        var qz = modifiedZ(q, c.qty);
        if (qz === null || qz <= zCut) return;               /* only unusually LARGE quantities */
        var pz = c.price && c.price.scale ? modifiedZ(Number(occ.unit_price), c.price) : null;
        if (pz !== null && Math.abs(pz) > zCut) return;       /* the price rule already has this row */
        flags.push(flag_('QUANTITY_ANOMALY', 'medium', occ.movement_id,
          'كمية «' + c.label + '» في هذه الحركة ' + fmt2_(q) + ' مقابل وسيط ' +
          fmt2_(c.qty.median) + ' من ' + arCount(c.n, 'purchase') + '، مع أن سعر الوحدة طبيعي — ' +
          'درجة انحراف الكمية ' + qz,
          [{ row_id: String(occ.movement_id), transaction_date: occ.transaction_date,
             item: occ.item_norm, qty: q, qty_median: c.qty.median, modified_z: qz,
             unit_price: occ.unit_price, responsible_person: occ.responsible_person }]));
      });
    });
    return { flags: flags, notes: [] };
  }

  /**
   * Run Tier 2 over parsed item occurrences.
   *
   * occurrences: as produced by getBoxItemHistory_.
   * opts.byNorm: item_norm → cluster_id, from clusterItems. When absent, each
   *   distinct text is its own cluster, which is strictly worse and is the
   *   caller's choice to make knowingly.
   *
   * Returns { flags, by_row, notes, stats }.
   */
  function runTier2(occurrences, opts) {
    var o = opts || {};
    var byNorm = o.byNorm || null;
    if (!byNorm) {
      var clustered = clusterItems(occurrences || [], { aliases: o.aliases || null });
      byNorm = clustered.byNorm;
    }
    var stats = clusterPriceStats(occurrences, byNorm);

    var flags = [], notes = [];
    [rulePriceOutlier(stats, o),
     rulePeerGap(stats, o),
     rulePriceRatchet(stats, o),
     ruleNewItemHighValue(stats, occurrences, o),
     ruleQuantityAnomaly(stats, o)].forEach(function (r) {
      flags = flags.concat(r.flags);
      notes = notes.concat(r.notes || []);
    });

    var byRow = {};
    flags.forEach(function (f) {
      if (f.row_id === null) return;
      (byRow[f.row_id] = byRow[f.row_id] || []).push(f);
    });
    return { flags: flags, by_row: byRow, notes: notes, stats: stats };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // §7 Tier 3 — distributional and behavioural, per entity
  // ═══════════════════════════════════════════════════════════════════════
  //
  // These rules describe a PERSON or an ACCOUNT, not a row, so their findings
  // carry an `entity` and their `row_id` is null. That distinction matters on
  // screen: "this movement is wrong" and "this person's spending has changed
  // shape" are different claims and must not render as the same badge.
  //
  // Every one of them is gated on a minimum n, and Benford's is gated hard at
  // 300. That gate is a CORRECTNESS REQUIREMENT, not a statistical nicety. A
  // Benford verdict on forty rows is noise, and this page attaches it to a
  // named employee. Below the gate the page must show "بيانات غير كافية" and
  // nothing else — there is no such thing as a weak accusation.

  var TIER3 = {
    BENFORD_MIN_N: 300,
    BENFORD_MAD_MARGINAL: 0.012,   /* Nigrini's conformity bands, first digit */
    BENFORD_MAD_NONCONFORM: 0.015,
    ROUND_MIN_N: 30,
    ROUND_Z: 3,
    ROUND_DIVISORS: [100, 50],
    VELOCITY_MIN_DAYS: 20,
    VELOCITY_MIN_COUNT: 5,
    VELOCITY_P: 0.001,
    DRIFT_MIN_N: 30,               /* per side */
    DRIFT_PSI: 0.25,               /* the conventional "significant shift" cut */
    SEASON_MIN_MONTHS: 6,
    SEASON_Z: 3.5
  };

  function firstDigit_(v) {
    var s = String(Math.abs(Number(v))).replace(/[^0-9]/g, '').replace(/^0+/, '');
    return s.length ? Number(s.charAt(0)) : null;
  }

  function secondDigit_(v) {
    var s = String(Math.abs(Number(v))).replace(/[^0-9]/g, '').replace(/^0+/, '');
    return s.length >= 2 ? Number(s.charAt(1)) : null;
  }

  /**
   * Benford's law on the leading digit.
   *
   * Returns { status, n, observed, expected, chi2, mad, verdict_ar } — or
   * status 'insufficient_data' below the gate, with NO verdict of any kind.
   * Returning a weak verdict here and letting the caller decide whether to
   * show it would be the same mistake one layer up: the gate has to be where
   * the number is computed.
   */
  function benfordFirstDigit(values, opts) {
    var o = opts || {};
    var minN = o.benford_min_n === undefined ? TIER3.BENFORD_MIN_N : o.benford_min_n;
    var digits = (values || []).map(firstDigit_).filter(function (d) { return d >= 1 && d <= 9; });
    var n = digits.length;
    if (n < minN) {
      return {
        status: 'insufficient_data', n: n, required: minN,
        reason_ar: 'بيانات غير كافية لتحليل بنفورد (المتاح ' + arCount(n, 'amount') + '، والمطلوب ' + minN +
          ' على الأقل) — لا يصدر أي حكم دون ذلك'
      };
    }
    var observed = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    digits.forEach(function (d) { observed[d - 1]++; });
    var chi2 = 0, madSum = 0, expected = [];
    for (var d = 1; d <= 9; d++) {
      var p = Math.log(1 + 1 / d) / Math.LN10;
      var e = p * n;
      expected.push(round_(p, 6));
      chi2 += ((observed[d - 1] - e) * (observed[d - 1] - e)) / e;
      madSum += Math.abs(observed[d - 1] / n - p);
    }
    var madVal = madSum / 9;
    var verdict = madVal < 0.006 ? 'مطابقة وثيقة'
      : madVal < TIER3.BENFORD_MAD_MARGINAL ? 'مطابقة مقبولة'
      : madVal < TIER3.BENFORD_MAD_NONCONFORM ? 'مطابقة حدية'
      : 'عدم مطابقة';
    return {
      status: 'ok', n: n, observed: observed, expected: expected,
      chi2: round_(chi2, 3), df: 8, mad: round_(madVal, 5),
      conforms: madVal < TIER3.BENFORD_MAD_NONCONFORM,
      verdict_ar: verdict
    };
  }

  /** Benford on the SECOND digit (0–9). Same gate, same refusal. */
  function benfordSecondDigit(values, opts) {
    var o = opts || {};
    var minN = o.benford_min_n === undefined ? TIER3.BENFORD_MIN_N : o.benford_min_n;
    var digits = (values || []).map(secondDigit_).filter(function (d) { return d !== null && d >= 0 && d <= 9; });
    var n = digits.length;
    if (n < minN) {
      return { status: 'insufficient_data', n: n, required: minN,
        reason_ar: 'بيانات غير كافية لتحليل بنفورد للرقم الثاني (المتاح ' + n + '، والمطلوب ' + minN + ')' };
    }
    var observed = [], expected = [], d, k;
    for (d = 0; d <= 9; d++) observed.push(0);
    digits.forEach(function (x) { observed[x]++; });
    var chi2 = 0, madSum = 0;
    for (d = 0; d <= 9; d++) {
      var p = 0;
      for (k = 1; k <= 9; k++) p += Math.log(1 + 1 / (10 * k + d)) / Math.LN10;
      expected.push(round_(p, 6));
      var e = p * n;
      chi2 += ((observed[d] - e) * (observed[d] - e)) / e;
      madSum += Math.abs(observed[d] / n - p);
    }
    var madVal = madSum / 10;
    return { status: 'ok', n: n, observed: observed, expected: expected,
      chi2: round_(chi2, 3), df: 9, mad: round_(madVal, 5),
      conforms: madVal < TIER3.BENFORD_MAD_NONCONFORM };
  }

  /**
   * Benford per entity. Entities are built by the caller's grouping key so the
   * same function serves "per person" and "per account".
   */
  function ruleBenford(rows, opts) {
    var o = opts || {};
    var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
    var kind = o.entity_kind || 'المسؤول';
    var groups = {};
    (rows || []).forEach(function (r) {
      var amt = amountOf_(r);
      if (amt === null || amt <= 0) return;
      var k = keyFn(r);
      if (!k) return;
      (groups[k] = groups[k] || []).push(r);
    });

    var flags = [], notes = [];
    Object.keys(groups).forEach(function (k) {
      var rowsFor = groups[k];
      var amounts = rowsFor.map(amountOf_);
      var b = benfordFirstDigit(amounts, o);
      if (b.status !== 'ok') {
        notes.push({ rule_id: 'BENFORD', status: 'insufficient_data', entity: k, entity_kind: kind,
          n: b.n, required: b.required, reason_ar: kind + ' ' + k + ': ' + b.reason_ar });
        return;
      }
      if (b.conforms) return;
      var f = flag_('BENFORD', 'medium', null,
        'توزيع الرقم الأول لمبالغ ' + kind + ' ' + k + ' لا يطابق قانون بنفورد على ' + arCount(b.n, 'amount') +
        ' (متوسط الانحراف المطلق ' + b.mad + '، كاي-تربيع ' + b.chi2 + ' بدرجات حرية 8) — ' +
        b.verdict_ar + '. هذا مؤشر إحصائي على مستوى المجموعة، وليس اتهاماً لأي حركة بعينها؛ ' +
        'يُستخدَم لترتيب أولوية المراجعة فقط',
        rowsFor.slice(0, 20).map(function (r) {
          return { row_id: String(r.id), transaction_date: r.transaction_date,
                   transaction_amount: amountOf_(r) };
        }));
      f.entity = k;
      f.entity_kind = kind;
      f.detail = b;
      flags.push(f);
    });
    return { flags: flags, notes: notes };
  }

  /**
   * ROUND_NUMBER_BIAS — a person producing far more round amounts than the
   * population does. Estimated amounts cluster on round numbers; measured ones
   * do not.
   *
   * The baseline is THIS POPULATION's own rate, not a textbook figure: in an
   * organisation that mostly buys in round quantities, round totals are normal
   * and a fixed expectation would flag everyone.
   */
  function ruleRoundNumberBias(rows, opts) {
    var o = opts || {};
    var minN = o.round_min_n === undefined ? TIER3.ROUND_MIN_N : o.round_min_n;
    var zCut = o.round_z === undefined ? TIER3.ROUND_Z : o.round_z;
    var divisors = o.round_divisors || TIER3.ROUND_DIVISORS;
    var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
    var kind = o.entity_kind || 'المسؤول';

    var all = (rows || []).filter(function (r) { return amountOf_(r) !== null && amountOf_(r) > 0; });
    if (!all.length) return { flags: [], notes: [] };

    var flags = [], notes = [];
    divisors.forEach(function (div) {
      var isRound = function (r) { return Math.abs(amountOf_(r) % div) < 1e-9; };
      var p0 = all.filter(isRound).length / all.length;
      if (p0 <= 0 || p0 >= 1) return;

      var groups = {};
      all.forEach(function (r) {
        var k = keyFn(r);
        if (!k) return;
        (groups[k] = groups[k] || []).push(r);
      });
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        if (g.length < minN) {
          notes.push({ rule_id: 'ROUND_NUMBER_BIAS', status: 'insufficient_data', entity: k,
            entity_kind: kind, n: g.length, required: minN,
            reason_ar: kind + ' ' + k + ': بيانات غير كافية لاختبار الأرقام المستديرة (المتاح ' +
              g.length + '، والمطلوب ' + minN + ')' });
          return;
        }
        var hits = g.filter(isRound).length;
        var pHat = hits / g.length;
        var se = Math.sqrt(p0 * (1 - p0) / g.length);
        if (!se) return;
        var z = (pHat - p0) / se;
        if (z < zCut) return;
        var f = flag_('ROUND_NUMBER_BIAS', 'medium', null,
          Math.round(pHat * 100) + '% من مبالغ ' + kind + ' ' + k + ' من مضاعفات ' + div +
          ' (' + hits + ' من ' + g.length + ')، مقابل ' + Math.round(p0 * 100) +
          '% في باقي البيانات — انحراف ' + round_(z, 2) + ' وحدة معيارية. ' +
          'المبالغ المقدَّرة تتكدّس على الأرقام المستديرة، والمقيسة لا تفعل',
          g.filter(isRound).slice(0, 20).map(function (r) {
            return { row_id: String(r.id), transaction_date: r.transaction_date,
                     transaction_amount: amountOf_(r) };
          }));
        f.entity = k;
        f.entity_kind = kind;
        f.detail = { divisor: div, rate: round_(pHat, 4), baseline: round_(p0, 4), z: round_(z, 3), n: g.length };
        flags.push(f);
      });
    });
    return { flags: flags, notes: notes };
  }

  /** Poisson upper tail P(X >= k) for mean lambda. k is small here. */
  function poissonTail(k, lambda) {
    if (lambda <= 0) return k > 0 ? 0 : 1;
    var cum = 0, term = Math.exp(-lambda);
    for (var i = 0; i < k; i++) {
      cum += term;
      term = term * lambda / (i + 1);
    }
    var tail = 1 - cum;
    return tail < 0 ? 0 : tail;
  }

  /**
   * VELOCITY_BURST — a person filing far more movements in one day than they
   * normally do. Compared against THEIR OWN baseline, never against the busiest
   * person in the office: a storekeeper who files twenty a day every day is
   * doing their job, and a rule that cannot tell them apart from someone who
   * suddenly files twenty after months of two is not measuring anything.
   */
  function ruleVelocityBurst(rows, opts) {
    var o = opts || {};
    var minDays = o.velocity_min_days === undefined ? TIER3.VELOCITY_MIN_DAYS : o.velocity_min_days;
    var minCount = o.velocity_min_count === undefined ? TIER3.VELOCITY_MIN_COUNT : o.velocity_min_count;
    var pCut = o.velocity_p === undefined ? TIER3.VELOCITY_P : o.velocity_p;
    var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
    var kind = o.entity_kind || 'المسؤول';

    var groups = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.transaction_date) return;
      var k = keyFn(r);
      if (!k) return;
      (groups[k] = groups[k] || []).push(r);
    });

    var flags = [], notes = [];
    Object.keys(groups).forEach(function (k) {
      var byDay = {};
      groups[k].forEach(function (r) { (byDay[r.transaction_date] = byDay[r.transaction_date] || []).push(r); });
      var days = Object.keys(byDay);
      if (days.length < minDays) {
        notes.push({ rule_id: 'VELOCITY_BURST', status: 'insufficient_data', entity: k, entity_kind: kind,
          n: days.length, required: minDays,
          reason_ar: kind + ' ' + k + ': بيانات غير كافية لحساب المعدل اليومي المعتاد (المتاح ' +
            arCount(days.length, 'workday') + '، والمطلوب ' + minDays + ')' });
        return;
      }
      var counts = days.map(function (d) { return byDay[d].length; });
      var lambda = median(counts);
      if (!lambda || lambda <= 0) lambda = counts.reduce(function (a, b) { return a + b; }, 0) / counts.length;
      if (!lambda || lambda <= 0) return;

      days.forEach(function (d) {
        var kCount = byDay[d].length;
        if (kCount < minCount) return;
        var p = poissonTail(kCount, lambda);
        if (p >= pCut) return;
        var f = flag_('VELOCITY_BURST', 'medium', null,
          'سجّل ' + kind + ' ' + k + ' عدد ' + arCount(kCount, 'movement') + ' في يوم ' + d +
          '، والمعتاد له ' + round_(lambda, 2) + ' حركة في اليوم عبر ' + arCount(days.length, 'workday') +
          ' — احتمال ذلك بالصدفة أقل من ' + (p < 0.0001 ? '0.01%' : round_(p * 100, 3) + '%'),
          byDay[d].slice(0, 20).map(function (r) {
            return { row_id: String(r.id), transaction_date: r.transaction_date,
                     transaction_amount: amountOf_(r) };
          }));
        f.entity = k;
        f.entity_kind = kind;
        f.detail = { day: d, count: kCount, baseline: round_(lambda, 3), p: p, active_days: days.length };
        flags.push(f);
      });
    });
    return { flags: flags, notes: notes };
  }

  /**
   * ACCOUNT_MIX_DRIFT — the shape of a person's spending across accounts,
   * compared with their OWN earlier history. Population Stability Index; > 0.25
   * is the conventional "significant shift".
   *
   * This is what catches miscoding used to hide spend: the totals can look
   * entirely normal while the mix moves.
   */
  function populationStabilityIndex(recent, baseline) {
    var keys = {};
    Object.keys(recent).forEach(function (k) { keys[k] = true; });
    Object.keys(baseline).forEach(function (k) { keys[k] = true; });
    var rTot = 0, bTot = 0;
    Object.keys(recent).forEach(function (k) { rTot += recent[k]; });
    Object.keys(baseline).forEach(function (k) { bTot += baseline[k]; });
    if (!rTot || !bTot) return null;
    var psi = 0, parts = [];
    Object.keys(keys).forEach(function (k) {
      /* A small floor keeps a category that is absent on one side from making
         the index infinite; without it one new account code dominates. */
      var a = Math.max((recent[k] || 0) / rTot, 0.0001);
      var b = Math.max((baseline[k] || 0) / bTot, 0.0001);
      var part = (a - b) * Math.log(a / b);
      psi += part;
      parts.push({ key: k, recent: round_(a, 4), baseline: round_(b, 4), contribution: round_(part, 4) });
    });
    parts.sort(function (x, y) { return y.contribution - x.contribution; });
    return { psi: round_(psi, 4), parts: parts };
  }

  function ruleAccountMixDrift(rows, opts) {
    var o = opts || {};
    var minN = o.drift_min_n === undefined ? TIER3.DRIFT_MIN_N : o.drift_min_n;
    var psiCut = o.drift_psi === undefined ? TIER3.DRIFT_PSI : o.drift_psi;
    var splitDate = o.drift_split_date || null;
    var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
    var kind = o.entity_kind || 'المسؤول';

    var groups = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.transaction_date || !r.chart_of_accounts) return;
      var k = keyFn(r);
      if (!k) return;
      (groups[k] = groups[k] || []).push(r);
    });

    var flags = [], notes = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].slice().sort(function (a, b) {
        return a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : 0;
      });
      var recent = {}, baseline = {}, nR = 0, nB = 0;
      if (splitDate) {
        g.forEach(function (r) {
          var t = r.transaction_date >= splitDate ? recent : baseline;
          t[r.chart_of_accounts] = (t[r.chart_of_accounts] || 0) + 1;
          if (t === recent) nR++; else nB++;
        });
      } else {
        /* No split given: the most recent third against the rest. */
        var cut = Math.floor(g.length * 2 / 3);
        g.forEach(function (r, i) {
          var t = i >= cut ? recent : baseline;
          t[r.chart_of_accounts] = (t[r.chart_of_accounts] || 0) + 1;
          if (t === recent) nR++; else nB++;
        });
      }
      if (nR < minN || nB < minN) {
        notes.push({ rule_id: 'ACCOUNT_MIX_DRIFT', status: 'insufficient_data', entity: k, entity_kind: kind,
          n: Math.min(nR, nB), required: minN,
          reason_ar: kind + ' ' + k + ': بيانات غير كافية لمقارنة توزيع الحسابات (' + nB +
            ' سابقة و' + nR + ' حديثة، والمطلوب ' + minN + ' لكل جانب)' });
        return;
      }
      var psi = populationStabilityIndex(recent, baseline);
      if (!psi || psi.psi < psiCut) return;
      var top = psi.parts.slice(0, 3).map(function (p) {
        return 'حساب ' + p.key + ' من ' + Math.round(p.baseline * 100) + '% إلى ' + Math.round(p.recent * 100) + '%';
      });
      var f = flag_('ACCOUNT_MIX_DRIFT', 'medium', null,
        'تغيّر توزيع مصروفات ' + kind + ' ' + k + ' بين الحسابات مقارنةً بسجله السابق ' +
        '(مؤشر الاستقرار ' + psi.psi + '، والحد المعتاد ' + psiCut + ') — أبرز التحولات: ' +
        top.join('، ') + '. الإجماليات قد تبدو طبيعية بينما يتغيّر التوزيع، وهو ما يُخفي المصروف بإعادة تصنيفه',
        g.slice(-20).map(function (r) {
          return { row_id: String(r.id), transaction_date: r.transaction_date,
                   chart_of_accounts: r.chart_of_accounts, transaction_amount: amountOf_(r) };
        }));
      f.entity = k;
      f.entity_kind = kind;
      f.detail = { psi: psi.psi, parts: psi.parts.slice(0, 6), n_recent: nR, n_baseline: nB };
      flags.push(f);
    });
    return { flags: flags, notes: notes };
  }

  /**
   * SEASONALITY — this month's spend for an account against its own trailing
   * monthly distribution, on the median/MAD scale for the same reason Tier 2
   * uses it. Needs at least SEASON_MIN_MONTHS complete prior months.
   *
   * The current (partial) month is EXCLUDED from its own baseline, and it is
   * compared only when the caller supplies a completed-month figure — a partial
   * month measured against complete ones is the same mistake the four windows
   * were built to avoid.
   */
  function ruleSeasonality(rows, opts) {
    var o = opts || {};
    var minMonths = o.season_min_months === undefined ? TIER3.SEASON_MIN_MONTHS : o.season_min_months;
    var zCut = o.season_z === undefined ? TIER3.SEASON_Z : o.season_z;
    var currentMonth = o.current_month || null;    /* 'YYYY-MM'; required */
    var flags = [], notes = [];
    if (!currentMonth) {
      notes.push({ rule_id: 'SEASONALITY', status: 'not_run',
        reason_ar: 'لم يُحدَّد الشهر الحالي، فلا تُشغَّل مقارنة الموسمية' });
      return { flags: flags, notes: notes };
    }

    var byAccount = {};
    (rows || []).forEach(function (r) {
      var amt = amountOf_(r);
      if (amt === null || !r.transaction_date || !r.chart_of_accounts) return;
      if (String(r.transaction_type) === 'debit') return;      /* spend only */
      var mon = String(r.transaction_date).slice(0, 7);
      var a = String(r.chart_of_accounts);
      var m = byAccount[a] = byAccount[a] || {};
      m[mon] = (m[mon] || 0) + amt;
    });

    Object.keys(byAccount).forEach(function (acct) {
      var months = byAccount[acct];
      var prior = Object.keys(months).filter(function (m) { return m < currentMonth; }).sort();
      if (prior.length < minMonths) {
        notes.push({ rule_id: 'SEASONALITY', status: 'insufficient_data', entity: acct,
          entity_kind: 'الحساب', n: prior.length, required: minMonths,
          reason_ar: 'حساب ' + acct + ': بيانات غير كافية لمقارنة الموسمية (المتاح ' +
            arCount(prior.length, 'month') + ' مكتملة، والمطلوب ' + minMonths + ')' });
        return;
      }
      if (months[currentMonth] === undefined) return;
      var hist = prior.map(function (m) { return months[m]; });
      var st = robustStats(hist);
      var cur = months[currentMonth];
      var z = modifiedZ(cur, st);

      /* A history with NO dispersion at all — the same figure every month —
         makes every scale zero and the z-score undefined. That is not "no
         signal": it is the strongest possible baseline. An account that spent
         exactly the same for a year and then nine times that is precisely what
         this rule is for, and the first version of it returned silence there.
         So the departure is expressed as a direct ratio instead, and only a
         large one counts — with no variance there is no noise floor to
         calibrate against. `basis` reports which comparison was used. */
      var reason = null, detail = null;
      if (z !== null && Math.abs(z) > zCut) {
        reason = 'مصروف حساب ' + acct + ' في شهر ' + currentMonth + ' بلغ ' + fmt2_(cur) +
          ' مقابل وسيط ' + fmt2_(st.median) + ' عبر ' + arCount(prior.length, 'month') + ' سابقة (المدى ' +
          fmt2_(st.min) + '–' + fmt2_(st.max) + ') — درجة انحراف ' + z +
          (z > 0 ? ' بالزيادة' : ' بالنقصان');
        detail = { month: currentMonth, value: round_(cur, 2), median: st.median,
                   n_months: prior.length, modified_z: z, basis: 'modified_z' };
      } else if (z === null && st.scale === 0 && st.median > 0 &&
                 Math.abs(cur - st.median) / st.median >= (o.season_flat_ratio || 0.5)) {
        var mult = round_(cur / st.median, 2);
        reason = 'مصروف حساب ' + acct + ' في شهر ' + currentMonth + ' بلغ ' + fmt2_(cur) +
          ' بينما كان ثابتاً عند ' + fmt2_(st.median) + ' في كل شهر من الـ' + prior.length +
          ' شهراً السابقة دون أي تغيّر — أي ' + mult + ' ضعف' +
          (cur > st.median ? ' بالزيادة' : ' بالنقصان') +
          '. لا يوجد تشتت تاريخي تُحسب عليه درجة انحراف، فالمقارنة هنا نسبة مباشرة';
        detail = { month: currentMonth, value: round_(cur, 2), median: st.median,
                   n_months: prior.length, ratio: mult, basis: 'flat_history_ratio' };
      }
      if (!reason) return;

      var f = flag_('SEASONALITY', 'low', null, reason, []);
      f.entity = acct;
      f.entity_kind = 'الحساب';
      f.detail = detail;
      flags.push(f);
    });
    return { flags: flags, notes: notes };
  }

  /**
   * Run Tier 3. Findings are ENTITY-level: `row_id` is null, `entity` and
   * `entity_kind` say who or what the finding is about, and `evidence` carries
   * a sample of the contributing rows so a reader can start somewhere.
   *
   * opts.current_month ('YYYY-MM') enables SEASONALITY; without it that rule
   * reports not_run rather than guessing which month is current.
   */
  function runTier3(rows, opts) {
    var o = opts || {};
    var flags = [], notes = [];
    [ruleBenford(rows, o),
     ruleRoundNumberBias(rows, o),
     ruleVelocityBurst(rows, o),
     ruleAccountMixDrift(rows, o),
     ruleSeasonality(rows, o)].forEach(function (r) {
      flags = flags.concat(r.flags);
      notes = notes.concat(r.notes || []);
    });

    var byEntity = {};
    flags.forEach(function (f) {
      var k = (f.entity_kind || '') + ':' + (f.entity || '');
      (byEntity[k] = byEntity[k] || []).push(f);
    });
    return { flags: flags, by_entity: byEntity, notes: notes };
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

    /* date/time arithmetic */
    dayNumber: dayNumber,
    daysBetween: daysBetween,
    dayOfWeek: dayOfWeek,
    parseDateTime: parseDateTime,
    percentile: percentile,
    median: median,

    arCount: arCount,

    /* §7 Tier 1 — deterministic integrity */
    TIER1: TIER1,
    SEVERITY_AR: SEVERITY_AR,
    ruleSumMismatch: ruleSumMismatch,
    ruleDuplicates: ruleDuplicates,
    ruleBackdated: ruleBackdated,
    ruleOddHour: ruleOddHour,
    ruleEditedAfterReview: ruleEditedAfterReview,
    ruleOutOfSequence: ruleOutOfSequence,
    detectStructuringThresholds: detectStructuringThresholds,
    ruleStructuring: ruleStructuring,
    runTier1: runTier1,

    /* §7 Tier 2 — price anomalies, median/MAD */
    TIER2: TIER2,
    mad: mad,
    robustStats: robustStats,
    modifiedZ: modifiedZ,
    mannKendallTau: mannKendallTau,
    clusterPriceStats: clusterPriceStats,
    rulePriceOutlier: rulePriceOutlier,
    rulePeerGap: rulePeerGap,
    rulePriceRatchet: rulePriceRatchet,
    ruleNewItemHighValue: ruleNewItemHighValue,
    ruleQuantityAnomaly: ruleQuantityAnomaly,
    runTier2: runTier2,

    /* §7 Tier 3 — distributional / behavioural, per entity */
    TIER3: TIER3,
    benfordFirstDigit: benfordFirstDigit,
    benfordSecondDigit: benfordSecondDigit,
    poissonTail: poissonTail,
    populationStabilityIndex: populationStabilityIndex,
    ruleBenford: ruleBenford,
    ruleRoundNumberBias: ruleRoundNumberBias,
    ruleVelocityBurst: ruleVelocityBurst,
    ruleAccountMixDrift: ruleAccountMixDrift,
    ruleSeasonality: ruleSeasonality,
    runTier3: runTier3,

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
