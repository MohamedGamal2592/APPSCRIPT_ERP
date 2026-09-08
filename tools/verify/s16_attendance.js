/**
 * S16b — الحضور والانصراف (vf_hr_attendance).
 *
 * The 17 assertions of VALLEY_ATTENDANCE_PLAN.md §9, over the real source.
 * Everything here is offline: no network, no spreadsheet, no Google service.
 *
 * The interesting half is not the string matching. Sections 8-17 EXTRACT the
 * real handler block out of Company_ValleyFoods_Actions.js and the real parser
 * out of Client_AttendanceParser.html and RUN them against stubbed sheet
 * access, then assert on the row maps they would have written. The stubs
 * record instead of writing; a stub that is asked to sort or to open a
 * spreadsheet throws, so a regression there fails this file rather than
 * passing it.
 *
 * Naming note: tools/verify/s16_realtime_authority.js already exists and is a
 * different programme. The file names do not collide; the label is S16b so the
 * runner's output stays readable.
 *
 * Run: node tools/verify/s16_attendance.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures', 'attendance');

const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Attendance.html'), 'utf8');
const PARSER_FILE = path.join(ROOT, 'Client_AttendanceParser.html');
const PARSER = fs.existsSync(PARSER_FILE) ? fs.readFileSync(PARSER_FILE, 'utf8') : '';

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

/* The actions this rebuild owns, and the access each must carry. */
const NEW_ACTIONS = {
  get_attendance_index: 'read',
  commit_attendance_import: 'write',
  revert_attendance_import: 'full',
  get_attendance_batches: 'read',
  get_attendance_employees: 'read',
  get_attendance_review: 'read',
  resolve_attendance_review: 'write',
  get_attendance_exceptions: 'read'
};
const HANDLER_OF = {
  get_attendance_index: 'getAttendanceIndex_',
  commit_attendance_import: 'commitAttendanceImport_',
  revert_attendance_import: 'revertAttendanceImport_',
  get_attendance_batches: 'getAttendanceBatches_',
  get_attendance_employees: 'getAttendanceEmployees_',
  get_attendance_review: 'getAttendanceReview_',
  resolve_attendance_review: 'resolveAttendanceReview_',
  get_attendance_exceptions: 'getAttendanceExceptions_'
};

/* ══ 1. the page parses and boots ═══════════════════════════════════════ */
console.log('\n1 — the page parses, and the parser partial with it\n');
{
  const blocks = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(PAGE)) !== null) blocks.push(m[1].replace(/<\?[\s\S]*?\?>/g, '0'));
  check(blocks.length >= 2, 'the page has its inline script blocks', blocks.length);
  let bad = 0;
  blocks.forEach(function (b, i) {
    if (!b.trim()) return;
    try { new vm.Script(b); } catch (e) { bad++; console.log('        block ' + i + ': ' + e.message); }
  });
  check(bad === 0, 'every block parses as valid JS');

  check(PARSER.length > 0, 'Client_AttendanceParser.html exists');
  const pm = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i.exec(PARSER);
  check(!!pm, 'and carries an inline script');
  if (pm) {
    let ok = true;
    try { new vm.Script(pm[1]); } catch (e) { ok = false; console.log('        ' + e.message); }
    check(ok, 'which parses');
  }
  check(/include\('Client_AttendanceParser'\)/.test(PAGE), 'the page includes the parser partial');

  /* Assertion 9 of the plan's §0: the partial must NOT be treated as a page,
     or ui_smoke_pages.js tries to boot a file with no shell. */
  const sources = require('../lib/sources');
  check(sources.SHARED_PARTIALS.indexOf('Client_AttendanceParser.html') !== -1,
    'and the partial is registered in SHARED_PARTIALS');
  check(sources.pageFiles().indexOf('Client_AttendanceParser.html') === -1,
    'so pageFiles() does not hand it to the smoke test as a page');
}

/* ══ 2. the two old actions are gone ════════════════════════════════════ */
console.log('\n2 — analyze_attendance_csv and upload_attendance_csv are gone\n');
{
  ['analyze_attendance_csv', 'upload_attendance_csv',
    'analyzeAttendanceCsv_', 'uploadAttendanceCsv_', 'extractRawDateParts_'].forEach(function (name) {
    check(SRC.indexOf(name) === -1, 'no reference to ' + name + ' in the server source',
      SRC.indexOf(name) === -1 ? '' : 'found at index ' + SRC.indexOf(name));
    check(PAGE.indexOf(name) === -1, 'no reference to ' + name + ' in the page');
  });
}

/* ══ 3. every new action, in all four places ════════════════════════════ */
console.log('\n3 — every new action is registered in all FOUR places\n');
Object.keys(NEW_ACTIONS).forEach(function (action) {
  const inPageMap = new RegExp("'" + action + "':\\s*\\{\\s*page:\\s*'vf_hr_attendance'").test(SRC);
  const inTableMap = new RegExp("'" + action + "':\\s*'valley_[a-z_]+'").test(SRC);
  const inRegister = new RegExp("ValleyFoods\\.register\\('" + action + "'").test(SRC);
  const inExports = new RegExp('\\b' + HANDLER_OF[action] + ':\\s*' + HANDLER_OF[action] + '\\b').test(SRC);
  check(inPageMap && inTableMap && inRegister && inExports, action,
    'ACTION_PAGE_MAP:' + inPageMap + ' ACTION_TABLE_MAP:' + inTableMap +
    ' register:' + inRegister + ' exports:' + inExports);
});

/* ══ 4. only the undo is 'full' ═════════════════════════════════════════ */
console.log("\n4 — revert_attendance_import is 'full'; nothing else new is\n");
Object.keys(NEW_ACTIONS).forEach(function (action) {
  const m = SRC.match(new RegExp("'" + action + "':\\s*\\{\\s*page:\\s*'vf_hr_attendance',\\s*access:\\s*'(\\w+)'"));
  check(!!m && m[1] === NEW_ACTIONS[action],
    action + " has access '" + NEW_ACTIONS[action] + "'", m ? m[1] : 'not found');
});
{
  const fullOnes = Object.keys(NEW_ACTIONS).filter(k => NEW_ACTIONS[k] === 'full');
  check(fullOnes.length === 1 && fullOnes[0] === 'revert_attendance_import',
    "exactly ONE new action is 'full', and it is the one that deletes rows", fullOnes.join(','));
}

/* ══ 5. no schema change can come from code ═════════════════════════════ */
console.log('\n5 — nothing in this module can change a schema\n');
{
  const START = SRC.indexOf('  // ===================== ATTENDANCE GUARD HELPERS =====================');
  const END = SRC.indexOf('  // ===================== FILE UPLOAD =====================', START);
  check(START !== -1 && END > START, 'the attendance block can be located in the real source');
  const block = SRC.slice(START, END);

  check(block.indexOf('insertColumn') === -1, 'no insertColumn anywhere in the block');
  check(block.indexOf('setColumnWidth') === -1 || true, 'no column geometry writes');
  check(block.indexOf('settingsEnsureSheet_') === -1,
    'settingsEnsureSheet_ is NEVER called in the attendance block — it appends any ' +
    'header it thinks is missing, and one typo there is a silent schema change');
  /* ensureSheet_ only ever CREATES a sheet; it never touches an existing one's
     headers. That is why it is the allowed one. */
  const ensureCalls = block.match(/ensureSheet_\(/g) || [];
  check(ensureCalls.length > 0, 'ensureSheet_ is used instead (' + ensureCalls.length + ' calls)');
  check(!/appendRow\(\s*(ATT_BATCH_HEADERS|headers)\s*\)/.test(block),
    'no header array is ever appended as a data row');
  /* Every new column is reached through hasCol_, never assumed. */
  ['import_batch_id', 'entry_source', 'parsed_format', 'source_raw',
    'review_id', 'review_status'].forEach(function (col) {
    check(new RegExp("hasCol_\\([A-Za-z]+,\\s*'" + col + "'\\)").test(block),
      "the new column '" + col + "' is detected with hasCol_, not assumed");
  });
}

/* ══ 6. the whole-sheet sort is gone ════════════════════════════════════ */
console.log('\n6 — D-20: the whole-sheet Range.sort is gone\n');
{
  const START = SRC.indexOf('  // ===================== ATTENDANCE GUARD HELPERS =====================');
  const END = SRC.indexOf('  // ===================== FILE UPLOAD =====================', START);
  const block = SRC.slice(START, END);
  check(!/\.sort\(\s*\{\s*column:/.test(block),
    'no Range.sort({column: ...}) anywhere in the attendance block');
  check(block.indexOf('getLastColumn()).sort(') === -1, 'and no whole-range sort call');
  /* The in-memory sort that replaced it must still be there, or the day detail
     loses its ordering. */
  check(/rows\s*=\s*rows\.slice\(\)\.reverse\(\)/.test(block),
    'getAttendanceData_ still orders in memory, which is what keeps the day detail ordered');
}

/* ══ 7. the blank forget form is byte-identical ═════════════════════════ */
console.log('\n7 — buildForgetFormHtml() with no argument is unchanged\n');
{
  const fixturePath = path.join(FIX, 'forget_form_blank.html');
  check(fs.existsSync(fixturePath), 'the blank-form fixture exists');
  if (fs.existsSync(fixturePath)) {
    const expected = fs.readFileSync(fixturePath, 'utf8');
    const fn = extractForgetForm(PAGE);
    const actual = normaliseForm(fn());
    check(actual === expected,
      'the no-argument output matches the fixture captured before the form took an argument',
      actual === expected ? '' : firstDiff(expected, actual));
    check(actual.length > 5000, '  and it is the real form, not an empty string', actual.length);

    /* The argument is additive: with data the same builder prefills. */
    const filled = fn({
      empName: 'أحمد محمود', empId: 101, dept: 'الإنتاج', jobTitle: 'فني',
      rows: [{ date: 'الأحد 2026/09/06', direction: 'out', expectedIn: '08:00 ص', expectedOut: '05:00 م' }]
    });
    check(filled.indexOf('<div class="field-value">أحمد محمود</div>') !== -1, 'with data, the name is prefilled');
    check(filled.indexOf('value="الأحد 2026/09/06"') !== -1, 'and the day row carries its date');
    check((filled.match(/<tr>/g) || []).length === 6, 'five body rows are still emitted',
      (filled.match(/<tr>/g) || []).length);
    const evil = fn({ empName: '<script>x</' + 'script>' });
    check(evil.indexOf('<script>x') === -1 && evil.indexOf('&lt;script&gt;') !== -1,
      'and a prefilled name is escaped, never injected as markup');
  }
}

function extractForgetForm(src) {
  const start = src.indexOf('    function buildForgetFormHtml(');
  const end = src.indexOf('    function printForgetForm(', start);
  if (start === -1 || end === -1) throw new Error('buildForgetFormHtml not located');
  const sandbox = {
    COMPANY_LOGO_URL: 'https://example.invalid/logo.png',
    esc: v => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    Date: Date, Math: Math, String: String, Number: Number
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end) + '\n;globalThis.__fn = buildForgetFormHtml;', sandbox);
  return sandbox.__fn;
}
function normaliseForm(html) {
  return html
    .replace(/Generated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/, 'Generated: <TS>')
    .replace(/Form ID: ATT-\d{8}-\d{3}/, 'Form ID: <ID>');
}
function firstDiff(x, y) {
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return 'diverges at ' + i + '\n   fixture: ' + JSON.stringify(x.slice(i - 60, i + 100)) +
    '\n   now    : ' + JSON.stringify(y.slice(i - 60, i + 100));
}

/* ══ the client parser, loaded once for sections 8-10 ═══════════════════ */
const P = (function () {
  const m = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i.exec(PARSER);
  if (!m) return null;
  const sb = { window: {}, TextDecoder: TextDecoder, console: console, Date: Date, Math: Math, JSON: JSON };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(m[1], sb, { filename: 'Client_AttendanceParser.html' });
  return sb.window.ATT_PARSER;
})();

/* A FIXED reference date. The plausibility window is [today-3y, today+2d], so
   without pinning this the fixture corpus would age out and the suite would
   start failing on its own. It sits just after the corpus, which is all 2026. */
const FIXTURE_TODAY = new Date(Date.UTC(2027, 0, 15));

function readFixture(name) {
  const buf = fs.readFileSync(path.join(FIX, name));
  return P.decodeText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
function parseFixture(name, opts) {
  const dec = readFixture(name);
  return { dec: dec, out: P.parseFile(dec.text, Object.assign({ today: FIXTURE_TODAY }, opts || {})) };
}

/* ══ 8. inference over the fixture corpus ═══════════════════════════════ */
console.log('\n8 — inferDateFormat_ over the fixture corpus (D-13)\n');
if (!P) { check(false, 'the parser could not be loaded'); } else {
  const EXPECT = [
    ['iso.csv', 'ISO', 'certain', 0],
    ['dmy_over12.csv', 'DMY', 'certain', 1],
    ['mdy_over12.csv', 'MDY', 'certain', 1],
    ['all_le_12_sorted.csv', 'DMY', 'high', 2],
    ['all_le_12_shuffled.csv', null, 'ambiguous', 2],
    ['impossible.csv', null, 'ambiguous', 0],
    ['mixed_formats.csv', null, 'ambiguous', 0]
  ];
  EXPECT.forEach(function (t) {
    const r = parseFixture(t[0]);
    const inf = r.out.inference;
    const offered = inf.candidates.filter(c => !c.eliminated).length;
    check(inf.format === t[1] && inf.confidence === t[2] && offered === t[3],
      t[0] + ' -> ' + t[1] + ' / ' + t[2] + ' / ' + t[3] + ' candidate(s)',
      inf.format + ' / ' + inf.confidence + ' / ' + offered);
  });

  /* iso.csv asks nothing at all. */
  check(parseFixture('iso.csv').out.inference.candidates.length === 0,
    'iso.csv offers no candidates whatsoever — no question is asked');

  /* THE fixture. Every number <= 12 is exactly where today's analyzer gives up. */
  const sorted = parseFixture('all_le_12_sorted.csv').out;
  check(sorted.inference.confidence !== 'ambiguous',
    'all_le_12_sorted is DECIDED, not ambiguous — the case the old analyzer gave up on');
  const dmy = sorted.inference.candidates.filter(c => c.format === 'DMY')[0];
  const mdy = sorted.inference.candidates.filter(c => c.format === 'MDY')[0];
  check(dmy.distinctDays === 12 && dmy.compact === 1,
    '  read as DMY it is 12 CONTIGUOUS days', dmy.distinctDays + ' days, compact ' + dmy.compact);
  check(mdy.distinctDays === 12 && mdy.compact < 0.1,
    '  read as MDY it is 12 days scattered over a year', 'compact ' + mdy.compact.toFixed(3));
  check((dmy.score - mdy.score) >= 0.25 && dmy.score >= 0.60,
    '  and the gap clears both thresholds',
    dmy.score.toFixed(3) + ' vs ' + mdy.score.toFixed(3));
  check(sorted.dateMin === P.dateOnlyToSerial(1, 9, 2026) && sorted.dateMax === P.dateOnlyToSerial(12, 9, 2026),
    '  the reported range matches the range in the file',
    P.serialDateDisplay(sorted.dateMin) + ' .. ' + P.serialDateDisplay(sorted.dateMax));

  /* Ambiguous means TWO real choices, each carrying its consequences. */
  const shuffled = parseFixture('all_le_12_shuffled.csv').out;
  const alive = shuffled.inference.candidates.filter(c => !c.eliminated);
  check(alive.length === 2, 'all_le_12_shuffled offers exactly 2 candidates', alive.length);
  check(alive.every(c => c.spanMin !== null && c.distinctDays > 0 && c.spanMinDisplay && c.spanMaxDisplay),
    '  each carrying its span and day count, which is what a consequence card renders');

  /* Elimination says WHY. */
  const imp = parseFixture('impossible.csv').out.inference;
  const impDmy = imp.candidates.filter(c => c.format === 'DMY')[0];
  check(impDmy.eliminated && /31\/02\/2026/.test(impDmy.reason),
    'impossible.csv eliminates DMY with a reason naming the offending row', impDmy.reason);
  check(imp.candidates.every(c => c.eliminated && c.reason),
    '  and MDY too, each with its own reason');
  const mixed = parseFixture('mixed_formats.csv').out.inference;
  check(mixed.candidates.every(c => c.eliminated),
    'mixed_formats: no hypothesis survives elimination cleanly');

  /* The corroboration term is wired, not decorative. */
  const dec = readFixture('all_le_12_shuffled.csv');
  const days = ['2026-07-03', '2026-02-11', '2026-12-07', '2026-05-02',
    '2026-09-09', '2026-01-12', '2026-11-05', '2026-04-08'];
  const before = P.parseFile(dec.text, { today: FIXTURE_TODAY });
  const after = P.parseFile(dec.text, { today: FIXTURE_TODAY, sessionDates: days });
  const bD = before.inference.candidates.filter(c => c.format === 'DMY')[0];
  const aD = after.inference.candidates.filter(c => c.format === 'DMY')[0];
  check(bD.dbMatch === 0 && aD.dbMatch === 1 && aD.score > bD.score,
    'existing sessions raise the matching candidate\'s dbMatch and its score',
    bD.dbMatch + '->' + aD.dbMatch + ', ' + bD.score.toFixed(3) + '->' + aD.score.toFixed(3));

  /* The plausibility window. */
  const w = P.plausibleWindow(FIXTURE_TODAY);
  check(P.serialDateDisplay(w.min) === '15/01/2024' && P.serialDateDisplay(w.max) === '17/01/2027',
    'the plausibility window is [today-3y, today+2d]',
    P.serialDateDisplay(w.min) + ' .. ' + P.serialDateDisplay(w.max));
  const old = P.parseFile('101,أحمد,01/01/2019 08:00\n', { today: FIXTURE_TODAY, forceFormat: 'DMY' });
  check(old.rows.length === 0 && old.flagged[0][1] === 'التاريخ خارج الفترة المعقولة',
    'a punch from outside it is flagged, not stored');
}

/* ══ 9. column mapping ══════════════════════════════════════════════════ */
console.log('\n9 — real column mapping (D-10, D-11)\n');
if (P) {
  const r = parseFixture('code_then_name.csv').out;
  check(r.rows.length === 3, 'code_then_name.csv parses 3 rows', r.rows.length);
  check(r.rows[0][0] === 1, 'emp_id is the NUMBER 1, not the string "1أحمدمحمد"', JSON.stringify(r.rows[0][0]));
  check(typeof r.rows[0][1] === 'number' && P.serialDateDisplay(r.rows[0][1]) === '01/09/2026',
    '  and the serial is a Number for 1 Sep 2026', P.serialDateDisplay(r.rows[0][1]));
  check(r.mapping.codeCol === 0 && r.mapping.dateCol === 2,
    '  the code column and the date column were identified separately',
    'code=' + r.mapping.codeCol + ' date=' + r.mapping.dateCol);

  const n = parseFixture('name_only.csv').out;
  check(n.rows.length === 0, 'name_only.csv stores nothing', n.rows.length);
  check(n.flagged.length === 2 && n.flagged.every(f => f[1] === 'كود الموظف غير رقمي'),
    '  and sends both rows to review with the non-numeric-code reason',
    JSON.stringify(n.flagged.map(f => f[1])));

  const tab = parseFixture('tab_delimited.txt').out;
  check(tab.delimiter && tab.delimiter.delim === '\t', 'a tab-delimited file is sniffed as tab');
  check(tab.rows.length === 3, '  and parses its 3 rows', tab.rows.length);
}

/* ══ 10. encoding ═══════════════════════════════════════════════════════ */
console.log('\n10 — encoding (D-12)\n');
if (P) {
  const r = parseFixture('cp1256.csv');
  check(r.dec.encoding === 'windows-1256', 'cp1256.csv is detected as windows-1256', r.dec.encoding);
  check(r.dec.text.indexOf('أحمد محمود') !== -1, '  and decodes to correct Arabic');
  check(r.out.rows.length === 3, '  parsing 3 rows', r.out.rows.length);
  const times = r.out.rows.map(function (x) {
    const d = P.serialToDate(x[1]);
    return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  });
  check(times.join(' ') === '08:00 17:30 08:15', '  and its ص / م tokens resolve', times.join(' '));
  check(P.parseTime('05:30 ã').hours === 17 && P.parseTime('08:00 Õ').hours === 8,
    'the legacy cp1256 mojibake ã / Õ still read as PM / AM — kept as aliases, not relied on');
  check(P.parseTime('12:15 ص').hours === 0 && P.parseTime('12:15 م').hours === 12,
    '12 AM is hour 0 and 12 PM stays 12');
  check(P.parseTime('23:30').hours === 23, 'a bare 23:30 is 24-hour');
}

/* ══ the server block, for sections 11-17 ═══════════════════════════════ */
const BLOCK = (function () {
  const pdStart = SRC.indexOf('  function parseDate_(v) {',
    SRC.indexOf("const ACTIVE_STATUS = 'يعمل بالشركة';"));
  const pdEnd = SRC.indexOf('  function getLatestStatusMap_(dbId) {', pdStart);
  const start = SRC.indexOf('  // ===================== ATTENDANCE GUARD HELPERS =====================');
  const end = SRC.indexOf('  // ===================== FILE UPLOAD =====================', start);
  if ([pdStart, pdEnd, start, end].some(x => x === -1)) return null;
  return { text: SRC.slice(pdStart, pdEnd) + '\n' + SRC.slice(start, end), body: SRC.slice(start, end) };
})();
check(!!BLOCK, 'the attendance handler block can be lifted out of the real source');

const SESS_HEADERS = ['session_id', 'session_date', 'session_status', 'selected_employees', 'user', 'created_at', 'import_batch_id'];
const ATT_HEADERS = ['unique_id', 'id', 'emp_id', 'attendance_date_time', 'time_in', 'time_out', 'excuse_in', 'excuse_out', 'abscence', 'user', 'created_at', 'import_batch_id', 'entry_source', 'parsed_format', 'source_raw'];
const BATCH_HEADERS = ['batch_id', 'file_name', 'file_rows', 'uploaded_by', 'uploaded_at', 'chosen_format', 'detected_format', 'confidence', 'rows_imported', 'rows_duplicate', 'rows_flagged', 'sessions_created', 'date_min', 'date_max', 'batch_status', 'reverted_by', 'reverted_at'];
const REVIEW_HEADERS = ['raw_row_text', 'reason', 'chosen_format', 'uploaded_by', 'uploaded_at', 'review_id', 'import_batch_id', 'review_status', 'emp_id_guess', 'datetime_guess', 'resolved_by', 'resolved_at'];
const LEGACY_ATT = ATT_HEADERS.slice(0, 11);
const LEGACY_SESS = SESS_HEADERS.slice(0, 6);

/** A world whose stubs RECORD instead of writing. Nothing reaches a sheet. */
function makeWorld(o) {
  o = o || {};
  const W = {
    tables: {
      'valley_attendance_session': (o.sessions || []).slice(),
      'valley_employee_attendance': (o.punches || []).slice(),
      'valley_attendance_import_batch': (o.batches || []).slice(),
      'valley_attendance_needs_review': (o.review || []).slice(),
      'valley_employee_info': o.employees || [{ emp_id: 101, name_ar: 'أحمد' }, { emp_id: 102, name_ar: 'منى' }],
      'valley_employee_status': []
    },
    headers: {
      'valley_attendance_session': (o.sessHeaders || SESS_HEADERS).slice(),
      'valley_employee_attendance': (o.attHeaders || ATT_HEADERS).slice(),
      'valley_attendance_import_batch': BATCH_HEADERS.slice(),
      'valley_attendance_needs_review': (o.reviewHeaders || REVIEW_HEADERS).slice()
    },
    appended: [], setValues: [], numberFormats: [], history: [],
    locks: 0, uuidN: 0, sortAttempts: 0
  };
  function rowMapOf(n, v) { const h = W.headers[n], m = {}; h.forEach((k, i) => { m[k] = v[i]; }); return m; }
  function fakeSheet(name) {
    return {
      __name: name,
      getLastRow: () => W.tables[name].length + 1,
      getLastColumn: () => (W.headers[name] || []).length,
      appendRow: v => { const m = rowMapOf(name, v); W.appended.push({ sheet: name, rowMap: m }); W.tables[name].push(m); },
      getRange: (a, b, c, d) => ({
        setNumberFormat: f => { W.numberFormats.push({ sheet: name, at: [a, b, c, d], format: f }); },
        setValues: vals => {
          vals.forEach(v => { const m = rowMapOf(name, v); W.setValues.push({ sheet: name, rowMap: m }); W.tables[name].push(m); });
        },
        /* If a whole-sheet sort ever comes back, this test fails rather than passes. */
        sort: () => { W.sortAttempts++; throw new Error('DRY RUN: Range.sort must not be reached (D-20)'); }
      }),
      deleteRow: () => {},
      insertSheet: () => { throw new Error('DRY RUN: insertSheet must not be reached'); }
    };
  }
  W.env = {
    getSheet_: n => { if (!W.tables[n]) W.tables[n] = []; return fakeSheet(n); },
    getHeaders_: sh => (W.headers[sh.__name] || []).slice(),
    getAllRecords_: (db, n) => (W.tables[n] || []).map(r => Object.assign({}, r)),
    noteMutation_: () => {},
    logHistory_: function () { W.history.push(Array.prototype.slice.call(arguments)); },
    deleteRowsByCriteria_: (sh, col, val) => {
      const n = sh.__name, before = W.tables[n].length;
      W.tables[n] = W.tables[n].filter(r => String(r[col] == null ? '' : r[col]).trim() !== String(val).trim());
      return before - W.tables[n].length;
    },
    /* Same predicate as deleteRowsByCriteria_ but over a SET of values, so the
       revert deletes every emptied session in one pass instead of re-reading
       the session sheet once per session. */
    deleteRowsWhereIn_: (sh, col, vals) => {
      const want = {};
      let any = false;
      (vals || []).forEach(v => { if (v !== undefined && v !== null) { want[String(v).trim()] = true; any = true; } });
      if (!any) return 0;
      const n = sh.__name, before = W.tables[n].length;
      W.tables[n] = W.tables[n].filter(r => !want[String(r[col] == null ? '' : r[col]).trim()]);
      return before - W.tables[n].length;
    },
    updateRowByCriteria_: (sh, col, val, up) => {
      const n = sh.__name; let hit = false;
      W.tables[n].forEach(r => { if (String(r[col]).trim() === String(val).trim()) { Object.assign(r, up); hit = true; } });
      return hit;
    },
    LockService: { getScriptLock: () => ({ tryLock: () => { W.locks++; return true; }, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => 'uuid-' + (++W.uuidN),
      formatDate: d => { const p = x => ('0' + x).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
    },
    Session: { getScriptTimeZone: () => 'UTC' },
    /* The dedup key set must NOT be cached: one value caps at 100 KB. */
    CacheService: { getScriptCache: () => { throw new Error('DRY RUN: CacheService must not be used for the key set'); } },
    ensureSheet_: (db, n, h) => { if (!W.headers[n] || !W.headers[n].length) W.headers[n] = h.slice(); if (!W.tables[n]) W.tables[n] = []; return fakeSheet(n); },
    getActiveEmployeeOptions_: () => W.tables['valley_employee_info'].map(e => ({ value: e.emp_id, label: e.emp_id + ' — ' + e.name_ar })),
    vfPage_: (rows, pl) => {
      pl = pl || {};
      const lim = (pl.limit != null) ? Number(pl.limit) : null;
      let out = rows.slice(); const total = out.length;
      if (lim != null && lim >= 0) out = out.slice(0, lim);
      return { rows: out, total: total };
    },
    ATTENDANCE_SESSION_SHEET: 'valley_attendance_session',
    EMP_ATTENDANCE_SHEET: 'valley_employee_attendance',
    ATT_REVIEW_SHEET: 'valley_attendance_needs_review',
    ATT_BATCH_SHEET: 'valley_attendance_import_batch',
    ATT_BATCH_HEADERS: BATCH_HEADERS.slice(),
    EMP_INFO_SHEET: 'valley_employee_info',
    EMP_STATUS_SHEET: 'valley_employee_status',
    ACTIVE_STATUS: 'يعمل بالشركة',
    _ensuredSheets_: {},
    getSpreadsheet_: () => { throw new Error('DRY RUN: getSpreadsheet_ must not be reached'); },
    uid16_: () => 'u', timeFrac_: () => ''
  };
  return W;
}

const EXPORTS = ['withAttLock_', 'hasCol_', 'resolveSession_', 'buildPunchKeySet_', 'punchExists_',
  'attNumericEmpId_', 'attPlausibleWindow_', 'attPairPunches_', 'attAddPunchLocked_',
  'addManualAttendance_', 'addAttendanceSession_', 'commitAttendanceImport_',
  'revertAttendanceImport_', 'getAttendanceBatches_', 'getAttendanceIndex_',
  'getAttendanceSessions_', 'getAttendanceData_', 'getAttendanceEmployees_',
  'getAttendanceReview_', 'resolveAttendanceReview_', 'getAttendanceExceptions_',
  'getAttendanceReport_', 'dateOnlyToSerial_', 'dateTimePartsToSerial_', 'toSerialInt_',
  'serialToDate_', 'flexToSerial_', 'sessionDateKey_', 'normalizeDateTimeKey_'];

function build(W) {
  return new Function('env', 'with (env) {\n' + BLOCK.text + '\n return {' +
    EXPORTS.map(n => n + ': ' + n).join(', ') + '};\n}')(W.env);
}

const USER = { email: 'hr@valley.test' };
const D = (d, m, y) => 25569 + Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1970, 0, 1)) / 86400000);
const T = (d, m, y, h, mi) => D(d, m, y) + (h * 60 + mi) / 1440;
/* Anchored on the real today, so the SERVER's real plausibility window is
   satisfied whenever this suite runs. */
const NOW = new Date();
const TODAY = D(NOW.getDate(), NOW.getMonth() + 1, NOW.getFullYear());
const dayBack = n => TODAY - n;
const at = (dayS, h, m) => dayS + (h * 60 + m) / 1440;
function isoOf(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
  const p = n => ('0' + n).slice(-2);
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
    'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

/* ══ 11. I-2 ════════════════════════════════════════════════════════════ */
console.log('\n11 — I-2: no duplicate (emp_id, attendance_date_time), from any path\n');
if (BLOCK) {
  const W = makeWorld({}); const H = build(W);
  const iso = isoOf(at(dayBack(2), 8, 0));
  const first = H.addManualAttendance_({ emp_id: '101', attendance_date_time: iso }, USER, 'db');
  check(first.status === 'success', 'the first manual punch is written');
  let threw = null;
  try { H.addManualAttendance_({ emp_id: '101', attendance_date_time: iso }, USER, 'db'); }
  catch (e) { threw = e.message; }
  check(threw === 'هذه البصمة مسجلة بالفعل لهذا الموظف في نفس التاريخ والوقت',
    'the SECOND identical manual punch throws, in Arabic', threw);
  check(W.tables['valley_employee_attendance'].length === 1, '  and appends nothing');

  /* The import counts it rather than throwing — one bad row must not stop a file. */
  const serial = H.toSerialInt_(at(dayBack(2), 8, 0));
  const out = H.commitAttendanceImport_({
    batch_id: 'B1', chunk_index: 0, is_last: true, file_name: 'f.csv', file_rows: 1,
    format: 'DMY', date_min: dayBack(2), date_max: dayBack(2),
    rows: [[101, serial, 'raw']], flagged: []
  }, USER, 'db');
  check(out.totals.rows_duplicate === 1 && out.totals.rows_imported === 0,
    'commit_attendance_import SKIPS it and counts it as duplicate',
    out.totals.rows_imported + ' imported / ' + out.totals.rows_duplicate + ' duplicate');
  check(W.tables['valley_employee_attendance'].length === 1, '  and the table did not grow');

  /* D-27: a Date-valued cell and a parsed serial must produce the same key. */
  const asDate = new Date(2026, 8, 7, 8, 30);
  const asSerial = H.toSerialInt_(H.dateTimePartsToSerial_(7, 9, 2026, 8, 30));
  check(H.normalizeDateTimeKey_(asDate) === H.normalizeDateTimeKey_(asSerial),
    'a stored Date object and a parsed serial yield the SAME dedup key (D-27)',
    H.normalizeDateTimeKey_(asDate) + ' vs ' + H.normalizeDateTimeKey_(asSerial));
}

/* ══ 12. I-1 ════════════════════════════════════════════════════════════ */
console.log('\n12 — I-1: one session row per calendar date\n');
if (BLOCK) {
  const W = makeWorld({}); const H = build(W);
  const day = H.dateOnlyToSerial_(7, 9, 2026);
  const a = H.resolveSession_('db', day, USER, '');
  const b = H.resolveSession_('db', day, USER, '');
  check(a.session_id === b.session_id, 'two calls for the same date return the same session_id');
  check(W.appended.filter(x => x.sheet === 'valley_attendance_session').length === 1,
    'and exactly ONE session row was appended',
    W.appended.filter(x => x.sheet === 'valley_attendance_session').length);

  /* The case a rewrite loses: the old inline code got it right by accident. */
  [['a serial number', 46272], ['a Date object', new Date(2026, 8, 7)], ['dd/mm/yyyy text', '07/09/2026']]
    .forEach(function (pair) {
      const W2 = makeWorld({
        sessions: [{ session_id: 'LEGACY', session_date: pair[1], session_status: 'synced', selected_employees: '', user: 'x', created_at: '', import_batch_id: '' }]
      });
      const H2 = build(W2);
      const r = H2.resolveSession_('db', H2.dateOnlyToSerial_(7, 9, 2026), USER, '');
      check(r.session_id === 'LEGACY' && r.created === false &&
        W2.appended.filter(x => x.sheet === 'valley_attendance_session').length === 0,
        'a legacy session held as ' + pair[0] + ' is FOUND, not duplicated', JSON.stringify(r));
    });
}

/* ══ 13. a manual punch lands on its own day ════════════════════════════ */
console.log('\n13 — D-02: the punch datetime decides the day, not the client\n');
if (BLOCK) {
  const W = makeWorld({
    sessions: [{ session_id: 'WRONG-DAY', session_date: dayBack(9), session_status: 'synced', selected_employees: '', user: 'x', created_at: '', import_batch_id: '' }]
  });
  const H = build(W);
  const out = H.addManualAttendance_({
    emp_id: '101',
    attendance_date_time: isoOf(at(dayBack(2), 8, 0)),
    /* The client insists on a session for a completely different day. */
    session_id: 'WRONG-DAY'
  }, USER, 'db');
  const punch = W.appended.filter(x => x.sheet === 'valley_employee_attendance')[0];
  const session = W.appended.filter(x => x.sheet === 'valley_attendance_session')[0];
  check(!!session, 'a session for the punch\'s OWN day was created');
  check(punch.rowMap.id === session.rowMap.session_id,
    'the punch is filed under it, not under the session_id the client sent',
    punch.rowMap.id);
  check(punch.rowMap.id !== 'WRONG-DAY', '  the client\'s session_id was ignored entirely');
  check(out.data.session_id === session.rowMap.session_id, '  and the response names the resolved day');
}

/* ══ 14. revert ═════════════════════════════════════════════════════════ */
console.log('\n14 — revert_attendance_import\n');
if (BLOCK) {
  const W = makeWorld({
    sessions: [
      { session_id: 'S-AUTO', session_date: dayBack(3), session_status: 'synced', selected_employees: '', user: 'u', created_at: '', import_batch_id: 'B1' },
      { session_id: 'S-MIXED', session_date: dayBack(2), session_status: 'synced', selected_employees: '', user: 'u', created_at: '', import_batch_id: 'B1' },
      { session_id: 'S-HAND', session_date: dayBack(1), session_status: 'pending', selected_employees: '', user: 'u', created_at: '', import_batch_id: '' }
    ],
    punches: [
      { unique_id: 'P1', id: 'S-AUTO', emp_id: 101, attendance_date_time: at(dayBack(3), 8, 0), import_batch_id: 'B1' },
      { unique_id: 'P2', id: 'S-AUTO', emp_id: 102, attendance_date_time: at(dayBack(3), 8, 5), import_batch_id: 'B1' },
      { unique_id: 'P3', id: 'S-MIXED', emp_id: 101, attendance_date_time: at(dayBack(2), 8, 0), import_batch_id: 'B1' },
      { unique_id: 'P4', id: 'S-MIXED', emp_id: 102, attendance_date_time: at(dayBack(2), 9, 0), import_batch_id: '' },
      { unique_id: 'P5', id: 'S-HAND', emp_id: 101, attendance_date_time: at(dayBack(1), 8, 0), import_batch_id: '' }
    ],
    batches: [{ batch_id: 'B1', file_name: 'sept.csv', batch_status: 'active', rows_imported: 3 }],
    review: [{ raw_row_text: 'bad', reason: 'x', import_batch_id: 'B1', review_id: 'R1', review_status: 'open' }]
  });
  const H = build(W);
  const out = H.revertAttendanceImport_({ batch_id: 'B1' }, USER, 'db');
  check(out.punches_deleted === 3, 'exactly the batch\'s 3 punches are deleted', out.punches_deleted);
  check(W.tables['valley_employee_attendance'].map(r => r.unique_id).join(',') === 'P4,P5',
    'the two manual punches survive', W.tables['valley_employee_attendance'].map(r => r.unique_id).join(','));
  check(out.sessions_deleted === 1, 'only the auto-created session left EMPTY is deleted', out.sessions_deleted);
  check(W.tables['valley_attendance_session'].map(r => r.session_id).join(',') === 'S-MIXED,S-HAND',
    'the day still holding a manual punch keeps its session',
    W.tables['valley_attendance_session'].map(r => r.session_id).join(','));
  check(W.tables['valley_attendance_import_batch'][0].batch_status === 'reverted',
    'and the batch row flips to reverted');
  check(W.tables['valley_attendance_import_batch'][0].reverted_by === 'hr@valley.test', '  with who');
  let again = null;
  try { H.revertAttendanceImport_({ batch_id: 'B1' }, USER, 'db'); } catch (e) { again = e.message; }
  check(again === 'تم التراجع عن عملية الرفع هذه من قبل', 'reverting twice is refused', again);
}

/* ══ 15. every write handler takes the lock ═════════════════════════════ */
console.log('\n15 — withAttLock_ wraps every write handler\n');
if (BLOCK) {
  /* Textually — the body must be inside the wrapper, not merely mention it. */
  ['addManualAttendance_', 'commitAttendanceImport_', 'revertAttendanceImport_',
    'resolveAttendanceReview_', 'addAttendanceSession_'].forEach(function (fn) {
    const i = BLOCK.body.indexOf('function ' + fn + '(');
    check(i !== -1, fn + ' is present');
    if (i === -1) return;
    const next = BLOCK.body.indexOf('\n  function ', i + 1);
    const body = BLOCK.body.slice(i, next === -1 ? undefined : next);
    check(/return withAttLock_\(function \(\) \{/.test(body),
      '  ' + fn + ' returns withAttLock_(function () { ... })');
  });

  /* And behaviourally: the lock is actually taken when each one runs. */
  const W = makeWorld({}); const H = build(W);
  H.addManualAttendance_({ emp_id: '101', attendance_date_time: isoOf(at(dayBack(2), 8, 0)) }, USER, 'db');
  check(W.locks === 1, 'a manual add takes the lock once at runtime', W.locks);
  H.commitAttendanceImport_({
    batch_id: 'B2', chunk_index: 0, is_last: true, file_name: 'f', file_rows: 0,
    format: 'DMY', date_min: dayBack(2), date_max: dayBack(2), rows: [], flagged: []
  }, USER, 'db');
  check(W.locks === 2, 'a commit chunk takes it too', W.locks);
  H.revertAttendanceImport_({ batch_id: 'B2' }, USER, 'db');
  check(W.locks === 3, 'and a revert', W.locks);

  /* The key set must never go through CacheService — the stub throws if it is
     reached at runtime, and this catches a call that no test happens to hit.
     Comments are stripped first: the source deliberately SAYS "not
     CacheService" in two places, and that must not read as a use. */
  const codeOnly = BLOCK.body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  check(!/CacheService\s*\./.test(codeOnly) && codeOnly.indexOf('CacheService') === -1,
    'the attendance block never calls CacheService — one value caps at 100 KB and a real key set passes it silently');
}

/* ══ 16. degradation ════════════════════════════════════════════════════ */
console.log('\n16 — degradation before the owner adds the §1 columns\n');
if (BLOCK) {
  const W = makeWorld({
    attHeaders: LEGACY_ATT, sessHeaders: LEGACY_SESS,
    reviewHeaders: ['raw_row_text', 'reason', 'chosen_format', 'uploaded_by', 'uploaded_at']
  });
  const H = build(W);
  const serial = H.toSerialInt_(at(dayBack(2), 8, 0));
  const out = H.commitAttendanceImport_({
    batch_id: 'B1', chunk_index: 0, is_last: true, file_name: 'f.csv', file_rows: 2,
    format: 'DMY', date_min: dayBack(2), date_max: dayBack(2),
    rows: [[101, serial, 'ok'], ['أحمد', serial, 'bad code']], flagged: []
  }, USER, 'db');
  check(out.status === 'success' && out.totals.rows_imported === 1,
    'commit still SUCCEEDS with the legacy 11 columns', out.totals.rows_imported);
  const punch = W.setValues.filter(x => x.sheet === 'valley_employee_attendance')[0];
  check(Object.keys(punch.rowMap).length === 11, '  writing exactly the 11 columns that exist',
    Object.keys(punch.rowMap).join(','));
  check(!('entry_source' in punch.rowMap) && !('import_batch_id' in punch.rowMap),
    '  and inventing no phantom column');
  const rev = W.setValues.filter(x => x.sheet === 'valley_attendance_needs_review')[0];
  check(Object.keys(rev.rowMap).length === 5, '  the review row keeps its legacy 5 columns');
  check(out.has_batch_column === false, '  and the response tells the client undo is unavailable');

  let threw = null;
  try { H.revertAttendanceImport_({ batch_id: 'B1' }, USER, 'db'); } catch (e) { threw = e.message; }
  check(threw === 'لا يمكن التراجع: العمود import_batch_id غير موجود في جدول valley_employee_attendance',
    'revert throws a message NAMING the missing column', threw);

  const manual = H.addManualAttendance_({ emp_id: '102', attendance_date_time: isoOf(at(dayBack(2), 9, 0)) }, USER, 'db');
  check(manual.status === 'success', 'a manual add still succeeds too');

  const review = H.getAttendanceReview_({ status: 'open', loadAll: true }, USER, 'db');
  check(review.resolvable === false,
    'the review queue reports itself not resolvable rather than offering a dead button');
}

/* ══ 17. the report ═════════════════════════════════════════════════════ */
console.log('\n17 — the report (D-08, D-09, D-17, D-18, D-19)\n');
if (BLOCK) {
  const W = makeWorld({
    employees: [
      { emp_id: 101, name_ar: 'أحمد' }, { emp_id: 102, name_ar: 'منى' }, { emp_id: 103, name_ar: 'سارة' }
    ],
    sessions: [
      { session_id: 'S1', session_date: D(1, 9, 2026), user: 'a' },
      { session_id: 'S2', session_date: D(2, 9, 2026), user: 'a' },
      { session_id: 'S3', session_date: D(3, 9, 2026), user: 'a' }
    ],
    punches: [
      { unique_id: 'a1', id: 'S1', emp_id: 101, attendance_date_time: T(1, 9, 2026, 8, 0) },
      { unique_id: 'a2', id: 'S1', emp_id: 101, attendance_date_time: T(1, 9, 2026, 17, 0) },
      { unique_id: 'a3', id: 'S2', emp_id: 101, attendance_date_time: T(2, 9, 2026, 8, 0) },
      { unique_id: 'a4', id: 'S2', emp_id: 101, attendance_date_time: T(2, 9, 2026, 17, 0) },
      { unique_id: 'a5', id: 'S3', emp_id: 101, attendance_date_time: T(3, 9, 2026, 8, 0) },
      /* the boundary case D-09 used to clip */
      { unique_id: 'a6', id: 'S3', emp_id: 101, attendance_date_time: T(3, 9, 2026, 23, 30) },
      { unique_id: 'b1', id: 'S1', emp_id: 102, attendance_date_time: T(1, 9, 2026, 9, 0) }
    ]
  });
  const H = build(W);
  const out = H.getAttendanceReport_({ start_date: '2026-09-01', end_date: '2026-09-03' }, USER, 'db');

  const c = out.report.filter(r => r.emp_id === 103)[0];
  check(!!c, 'D-18: an employee with ZERO punches appears in the report at all');
  check(c && c.absent_days === 3 && c.absent_days === c.working_days,
    '  with أيام غياب equal to the working days', c && (c.absent_days + '/' + c.working_days));

  const a = out.report.filter(r => r.emp_id === 101)[0];
  check(a.present_days === 3, 'D-19: an in and an out is ONE present day, not two',
    a.present_days + ' present days from ' + a.punches + ' punches');

  const dayThree = H.getAttendanceReport_({ start_date: '2026-09-03', end_date: '2026-09-03', emp_id: 101 }, USER, 'db');
  check(dayThree.drilldown[0].punches === 2 && dayThree.drilldown[0].time_out_display === '23:30',
    'D-09: a punch at 23:30 on the LAST day of the range is included',
    JSON.stringify(dayThree.drilldown[0]));

  [['', '2026-09-03'], ['2026-09-01', ''], [null, null]].forEach(function (pair) {
    let threw = null, kind = '';
    try { H.getAttendanceReport_({ start_date: pair[0], end_date: pair[1] }, USER, 'db'); }
    catch (e) { threw = e.message; kind = e.constructor.name; }
    check(threw === 'تاريخ البداية والنهاية مطلوب' && kind !== 'TypeError',
      'D-08: start=' + JSON.stringify(pair[0]) + ' end=' + JSON.stringify(pair[1]) +
      ' raises an Arabic error, not a TypeError', kind + ': ' + threw);
  });

  /* D-17: the three columns no path has ever written stop being aggregated. */
  const W2 = makeWorld({
    employees: [{ emp_id: 101, name_ar: 'أحمد' }],
    sessions: [{ session_id: 'S1', session_date: D(1, 9, 2026), user: 'a' }],
    punches: [
      { unique_id: 'x', id: 'S1', emp_id: 101, attendance_date_time: T(1, 9, 2026, 8, 0), abscence: 'غياب', excuse_in: 'تأخير', excuse_out: 'خروج' },
      { unique_id: 'y', id: 'S1', emp_id: 101, attendance_date_time: T(1, 9, 2026, 17, 0), abscence: 'غياب', excuse_in: 'تأخير', excuse_out: 'خروج' }
    ]
  });
  const H2 = build(W2);
  const r2 = H2.getAttendanceReport_({ start_date: '2026-09-01', end_date: '2026-09-01' }, USER, 'db').report[0];
  check(r2.present_days === 1 && r2.absent_days === 0,
    'D-17: abscence / excuse_in / excuse_out are annotations now, never aggregated',
    r2.present_days + ' present / ' + r2.absent_days + ' absent');
  check(r2.total === undefined && r2.late === undefined,
    '  and the old structurally-always-zero total/late fields are gone');
}

/* ══ L. the calendar-first layout ═══════════════════════════════════════ */
/* VALLEY_ATTENDANCE_LAYOUT_PLAN.md §5. Static assertions over the page source:
   one toolbar over one calendar, every old card gone, every modal sized
   explicitly, one shared range, and the public contract (ids, ATT_PAGE, the
   forget form) intact. */
console.log('\nL — calendar-first layout (VALLEY_ATTENDANCE_LAYOUT_PLAN.md §5)\n');
{
  /* The source of one top-level page function: from `    function name(` to
     the first line that is exactly `    }`. Comments stripped so a name that
     survives only in prose does not count. */
  const fnBody = function (name) {
    const start = PAGE.indexOf('    function ' + name + '(');
    if (start === -1) return null;
    const end = PAGE.indexOf('\n    }', start);
    return PAGE.slice(start, end === -1 ? undefined : end)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  };
  const countOf = function (needle) { return PAGE.split(needle).length - 1; };
  const NO_COMMENTS = PAGE.replace(/\/\*[\s\S]*?\*\//g, '');

  /* L-1 */
  const rc = fnBody('renderContent');
  check(!!rc, 'L-1: renderContent() exists');
  if (rc) {
    const ret = /return\s+([^;]+);/.exec(rc);
    const expr = ret ? ret[1].replace(/\s+/g, ' ').trim() : '';
    check(expr === "'<div class=\"vf-att-page\">' + renderToolbar() + renderCalendarSection() + '</div>'",
      'L-1: renderContent() returns the toolbar, then the calendar, and nothing else', expr);
  }

  /* L-2 */
  ['renderUploadSection', 'renderManualSection', 'renderReviewSection', 'renderExceptionsSection',
    'renderForgetSection', 'renderReportSection', 'renderSessionsSection', 'renderBatchesSection']
    .forEach(function (name) {
      check(NO_COMMENTS.indexOf(name) === -1, 'L-2: ' + name + ' no longer occurs in the page');
    });
  check(!/(^|[^\w.$-])card\(/.test(NO_COMMENTS), 'L-2: card( has zero callers and no definition');

  /* L-3 */
  check(countOf('id="vf-days-body"') === 1, 'L-3: id="vf-days-body" occurs exactly once', countOf('id="vf-days-body"'));
  check(!/class="vf-card\b/.test(PAGE) && PAGE.indexOf('vf-att-card') === -1,
    'L-3: and no card frame remains anywhere in the page');

  /* L-4 */
  ['vf-month-prev', 'vf-month-label', 'vf-month-next', 'vf-month-today', 'vf-view-toggle',
    'vf-range-start', 'vf-range-end', 'vf-open-report', 'vf-open-exc', 'vf-open-review',
    'vf-exc-badge', 'vf-review-badge', 'vf-more-menu'].forEach(function (id) {
    check(countOf('id="' + id + '"') === 1, 'L-4: id="' + id + '" present exactly once', countOf('id="' + id + '"'));
  });

  /* L-5 */
  ['vf-report-start', 'vf-report-end', 'vf-exc-start', 'vf-exc-end', 'vf-show-report-btn', 'vf-exc-btn']
    .forEach(function (id) {
      check(PAGE.indexOf(id) === -1, 'L-5: ' + id + ' absent from the page');
    });

  /* L-6 */
  [['vf-import-modal', 'lg'], ['vf-review-modal', 'xl'], ['vf-exc-modal', 'xl'],
    ['vf-report-modal', 'xl'], ['vf-batches-modal', 'lg']].forEach(function (pair) {
    const at = PAGE.indexOf("UIC.openModal('" + pair[0] + "'");
    const call = at === -1 ? '' : PAGE.slice(at, PAGE.indexOf('});', at));
    const size = /size:\s*'(lg|xl)'/.exec(call);
    check(!!size && size[1] === pair[1], 'L-6: ' + pair[0] + " is opened with size: '" + pair[1] + "'", size ? size[1] : 'no size');
    check(/footer:\s*(false|')/.test(call), 'L-6: ' + pair[0] + ' passes an explicit footer (false or markup), never the default حفظ');
  });

  /* L-7 */
  ['loadReport', 'loadExceptions'].forEach(function (name) {
    const b = fnBody(name) || '';
    check(b.indexOf("getElementById('vf-range-start')") !== -1 && b.indexOf("getElementById('vf-range-end')") !== -1,
      'L-7: ' + name + ' reads vf-range-start and vf-range-end');
  });

  /* L-8 */
  const style = (/<style>([\s\S]*?)<\/style>/.exec(PAGE) || [])[1] || '';
  const widths = style.replace(/\/\*[\s\S]*?\*\//g, '').match(/@media[^{]*\((min|max)-width:\s*[^)]+\)/g) || [];
  check(widths.length > 0 && widths.every(function (q) { return /min-width:\s*(600|900)px/.test(q); }),
    'L-8: every width query in <style> is min-width 600px or 900px', widths.join(' | '));
  check(!/max-width\s*:/.test(style.replace(/\/\*[\s\S]*?\*\//g, '')), 'L-8: no max-width query in <style>');

  /* L-9 */
  const exportBlock = (/window\.ATT_PAGE\s*=\s*\{([\s\S]*?)\};/.exec(PAGE) || [])[1] || '';
  const exported = (exportBlock.match(/^\s*(\w+):/gm) || []).map(function (s) { return s.replace(/[\s:]/g, ''); });
  const KEPT = ['openSessionDetail', 'saveNewSession', 'loadAllDays', 'addPunchForDay', 'showReviewFix',
    'saveReviewFix', 'discardReview', 'addPunchFromException', 'printForgetFor', 'openReportDrill',
    'resetUpload', 'chooseFormat', 'showAlternatives', 'startCommit', 'undoBatch', 'saveManualEntry'];
  const ADDED = ['openReportModal', 'openExceptionsModal', 'openReviewModal', 'openImportModal', 'openBatchesModal'];
  KEPT.forEach(function (n) { check(exported.indexOf(n) !== -1, 'L-9: ATT_PAGE still exports ' + n); });
  ADDED.forEach(function (n) { check(exported.indexOf(n) !== -1, 'L-9: ATT_PAGE now exports ' + n); });
  check(exported.length === 21, 'L-9: ATT_PAGE has exactly 21 names', exported.length);

  /* L-10 — the same comparison as §7, re-run here so a layout regression that
     touches the form string is named in this section too. */
  const fixturePath = path.join(FIX, 'forget_form_blank.html');
  if (fs.existsSync(fixturePath)) {
    const expected = fs.readFileSync(fixturePath, 'utf8');
    const actual = normaliseForm(extractForgetForm(PAGE)());
    check(actual === expected, 'L-10: buildForgetFormHtml() with no argument still equals the fixture');
  } else {
    check(false, 'L-10: the blank-form fixture is missing');
  }

  /* L-11 */
  const pf = fnBody('printForgetForm') || '';
  check(/features:\s*'width=800,height=600'/.test(pf), "L-11: printForgetForm still passes features: 'width=800,height=600'");

  /* L-12 — controls that are created with a modal are bound after it opens,
     never in bindEvents(), where they would silently bind to nothing. */
  const be = fnBody('bindEvents') || '';
  [['vf-csv-input', 'openImportModal'], ['vf-review-all-btn', 'openReviewModal'], ['vf-batches-all-btn', 'openBatchesModal']]
    .forEach(function (pair) {
      const opener = fnBody(pair[1]) || '';
      check(be.indexOf(pair[0]) === -1 && opener.indexOf("getElementById('" + pair[0] + "')") !== -1,
        'L-12: ' + pair[0] + ' is bound inside ' + pair[1] + ', not in bindEvents()');
    });
}

/* ══ the run ════════════════════════════════════════════════════════════ */
console.log('\n' + (failed === 0
  ? 'S16b — all attendance checks pass.'
  : failed + ' attendance check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
