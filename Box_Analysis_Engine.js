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
