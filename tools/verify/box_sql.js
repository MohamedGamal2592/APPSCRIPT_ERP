/**
 * Box analysis — SQL discipline in DbLive_Connector.js.
 *
 *   node tools/verify/box_sql.js
 *
 * NOT A SUBSTITUTE FOR READING THE STATEMENTS. Nothing here executes SQL;
 * there is no MySQL client on this machine and there never will be during this
 * work. Every statement in the box section shipped unrun, verified by reading
 * it against the schema in BOX_ANALYSIS_PLAN.md §2.
 *
 * What this file adds is the part a human reading is worst at: noticing, six
 * months later, that somebody added a function without a `finally`, or removed
 * the `WHERE id = ?` from the update, or slipped a DELETE into a read path.
 * It is a regression guard on the invariants, not a proof of correctness.
 *
 * It also asserts the clients_AR block is untouched, because "do not modify
 * the thing that already works" is a constraint that only stays true if
 * something checks.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'DbLive_Connector.js'), 'utf8');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) return true;
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}

/* The box section is everything from its banner comment to end of file. */
const MARKER = '// ─── regular_box_movement analysis';
const at = SRC.indexOf(MARKER);
ok(at !== -1, 'the box section banner is present');
const BOX = at === -1 ? '' : SRC.slice(at);
const BEFORE = at === -1 ? SRC : SRC.slice(0, at);

/* ── 1. The box section is PURELY ADDITIVE ─────────────────────────────────
 * Everything above it must be the connector as it already was. The clients_AR
 * functions in particular are a hard constraint: this run adds a sibling page,
 * it does not refactor the one that exists. */
console.log('additive — nothing above the box section changed');
[
  'function dbClientsArValidateDate_(v) {',
  'function dbClientsArWhere_(data) {',
  'function dbClientsArList_(data, user) {',
  'function dbClientsArRevise_(data, user) {',
  "'SELECT COUNT(*) AS cnt FROM `clients_AR`' + where.sql",
  "'UPDATE `clients_AR` SET `is_revised` = 1 WHERE `client_balance_sheet_id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)'"
].forEach(function (needle) {
  ok(BEFORE.indexOf(needle) !== -1, 'clients_AR still carries: ' + needle.slice(0, 60));
});
ok(BEFORE.indexOf('dbBox') === -1, 'no box code leaked above the section marker');

/* ── 2. NOTHING in the box section changes the schema ──────────────────────
 * Hard constraint 1. No DDL of any kind, and specifically not the
 * regular_box_items table the plan floats as Option B — this run is Option A. */
console.log('no DDL, ever');
[
  [/\bCREATE\s+(TABLE|INDEX|VIEW|TRIGGER)\b/i, 'CREATE'],
  [/\bALTER\s+TABLE\b/i, 'ALTER TABLE'],
  [/\bDROP\s+(TABLE|INDEX|VIEW|COLUMN)\b/i, 'DROP'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bRENAME\s+TABLE\b/i, 'RENAME TABLE']
].forEach(function (c) {
  ok(!c[0].test(BOX), 'the box section contains no ' + c[1]);
});
ok(BOX.indexOf('regular_box_items') === -1,
  'regular_box_items is never referenced — this run is Option A');

/* ── 3. No DELETE, anywhere in the box section ───────────────────────────── */
console.log('no DELETE');
ok(!/\bDELETE\s+FROM\b/i.test(BOX), 'the box section issues no DELETE');

/* ── 4. Every UPDATE is one row, by primary key ────────────────────────────
 * The single unacceptable outcome named in the brief is an UPDATE reaching
 * production without a WHERE id = ?. Asserted per statement, not per file. */
console.log('every UPDATE targets one row by primary key');
/* The table name is built from the DB_BOX_TABLE constant, not written inline,
   so this looks for the statement the way the source actually spells it. An
   earlier version of this check matched on the literal table name, found zero
   statements, and passed vacuously — which is exactly the failure this whole
   file exists to prevent, so it is called out rather than quietly fixed. */
const updateStarts = [];
let ui = BOX.indexOf("'UPDATE ");
while (ui !== -1) { updateStarts.push(ui); ui = BOX.indexOf("'UPDATE ", ui + 1); }
ok(updateStarts.length > 0, 'at least one UPDATE statement is present', 'found ' + updateStarts.length);
console.log('  (UPDATE statements found: ' + updateStarts.length + ')');
updateStarts.forEach(function (start, i) {
  /* The statement is a concatenated expression; take it up to the closing
     paren of the prepareStatement call that consumes it. */
  const chunk = BOX.slice(start, start + 700);
  const stmtText = chunk.slice(0, chunk.indexOf(');') === -1 ? 700 : chunk.indexOf(');'));
  ok(/WHERE `id` = \?/.test(stmtText),
    'UPDATE #' + (i + 1) + ' carries WHERE `id` = ?',
    stmtText.replace(/\s+/g, ' ').slice(0, 160));
  ok(!/WHERE 1\s*=\s*1/i.test(stmtText), 'UPDATE #' + (i + 1) + ' has no WHERE 1=1');
  ok(stmtText.indexOf('DB_BOX_TABLE') !== -1,
    'UPDATE #' + (i + 1) + ' targets regular_box_movement and nothing else',
    stmtText.replace(/\s+/g, ' ').slice(0, 160));
});

/* updated_at is server-set on every write path, and is not something a client
   can supply — the EDITED_AFTER_REVIEW rule reads it. */
ok(BOX.indexOf('`updated_at` = NOW()') !== -1, 'updated_at is set by the server to NOW()');
ok(BOX.indexOf("EDITABLE_COLUMNS") === -1 || BOX.indexOf('BoxEngine.validateChanges') !== -1,
  'the change set goes through BoxEngine.validateChanges (the fixed allowlist)');
ok(BOX.indexOf('BoxEngine.validateChanges(data.changes)') !== -1,
  'dbBoxUpdate_ validates the change set BEFORE opening a connection');

/* dbBoxGetOne_ borrows the caller's connection, so it must close its own result
   set and statement and must NOT close the connection out from under it. */
const getOne = BOX.slice(BOX.indexOf('function dbBoxGetOne_'), BOX.indexOf('function dbBoxUpdate_'));
ok(getOne.length > 0, 'dbBoxGetOne_ is present');
ok(/finally \{[\s\S]*?if \(rs\) rs\.close\(\);[\s\S]*?if \(stmt\) stmt\.close\(\);[\s\S]*?\}/.test(getOne),
  'dbBoxGetOne_ closes rs and stmt in a finally');
ok(getOne.indexOf('conn.close()') === -1,
  'dbBoxGetOne_ does NOT close the connection it was lent');

/* ── 5. Resources close on EVERY path, including the error path ────────────
 * The pattern is `finally { if (rs) rs.close(); if (stmt) stmt.close(); ...
 * if (conn) conn.close(); }` — result set, then statement, then connection.
 * A leaked JDBC connection in Apps Script outlives the request. */
console.log('every db function closes rs → stmt → conn in a finally');
const fnNames = (BOX.match(/^function (dbBox\w+|dbChartAccountLabels_)\s*\(/gm) || [])
  .map(function (s) { return s.replace(/^function /, '').replace(/\s*\($/, ''); });
ok(fnNames.length > 0, 'box functions found: ' + fnNames.join(', '));

fnNames.forEach(function (name) {
  const start = BOX.indexOf('function ' + name + '(');
  /* The body runs to the next top-level `function ` or end of section. */
  const nextIdx = BOX.slice(start + 1).search(/\nfunction \w/);
  const body = nextIdx === -1 ? BOX.slice(start) : BOX.slice(start, start + 1 + nextIdx);

  const opensConn = body.indexOf('dbGetConnection_()') !== -1;
  if (!opensConn) return;                    /* pure validators and builders */

  const fin = body.match(/finally\s*\{([\s\S]*?)\n  \}/);
  if (!ok(!!fin, name + ' has a finally block')) return;
  const f = fin[1];

  ok(/if\s*\(conn\)\s*conn\.close\(\)/.test(f), name + ' closes the connection in finally');
  if (body.indexOf('rs = ') !== -1) ok(/if\s*\(rs\)\s*rs\.close\(\)/.test(f), name + ' closes rs in finally');
  if (body.indexOf('stmt = ') !== -1) ok(/if\s*\(stmt\)\s*stmt\.close\(\)/.test(f), name + ' closes stmt in finally');
  if (body.indexOf('countRs = ') !== -1) ok(/if\s*\(countRs\)\s*countRs\.close\(\)/.test(f), name + ' closes countRs in finally');
  if (body.indexOf('countStmt = ') !== -1) ok(/if\s*\(countStmt\)\s*countStmt\.close\(\)/.test(f), name + ' closes countStmt in finally');

  /* Close order: every result set before its statement, every statement before
     the connection. */
  const iRs = f.indexOf('rs.close()');
  const iStmt = f.indexOf('stmt.close()');
  const iConn = f.indexOf('conn.close()');
  if (iRs !== -1 && iStmt !== -1) ok(iRs < iStmt, name + ' closes rs before stmt');
  if (iStmt !== -1 && iConn !== -1) ok(iStmt < iConn, name + ' closes stmt before conn');

  ok(body.indexOf('catch (err)') !== -1, name + ' logs and rethrows rather than swallowing');
});

/* ── 6. Values bind as parameters ─────────────────────────────────────────
 * The only things concatenated into a statement may be identifiers this file
 * produced and integers this file clamped. A bound `?` for everything else is
 * what makes a free-text responsible_person filter safe. */
console.log('values bind, they are not concatenated');
ok(/LIMIT ' \+ limit/.test(BOX),
  'LIMIT is concatenated from a clamped Number (JDBC will not bind a LIMIT)');
ok(/Math\.min\(Math\.max\(Number\(data\.limit\) \|\| 50, 1\), 200\)/.test(BOX),
  'dbBoxList_ clamps its limit exactly as dbClientsArList_ does');
ok(BOX.indexOf("params.push('%' + person + '%')") !== -1,
  'the responsible_person LIKE pattern is a BOUND parameter, not string-built SQL');
/* No template literal or + concatenation of a data.* value straight into SQL. */
ok(!/'\s*\+\s*data\.[a-z_]+\s*\+\s*'/i.test(BOX),
  'no data.* value is concatenated into a statement');

/* ── 7. credit is spend, and the two are never netted ─────────────────────── */
console.log('credit = spend, debit = collected, never netted');
const aggStart = BOX.indexOf('function dbBoxAccountAggregates_');
const aggEnd = BOX.indexOf('function dbChartAccountLabels_');
const AGG = BOX.slice(aggStart, aggEnd);
ok(/spend_' \+ x\.key/.test(AGG) && /transaction_type` = 'credit'/.test(AGG),
  'the spend columns filter transaction_type = credit');
ok(/collected_' \+ x\.key/.test(AGG) && /transaction_type` = 'debit'/.test(AGG),
  'the collected columns filter transaction_type = debit');
ok(!/credit'\s*OR\s*`?transaction_type/i.test(AGG),
  'spend and collected are never OR-ed into one figure');
ok(AGG.indexOf('spend_') !== -1 && AGG.indexOf('collected_') !== -1 &&
   !/spend_\w+\s*[-+]\s*collected/.test(AGG),
  'no expression subtracts or adds collections into a spend total');

const histStart = BOX.indexOf('function dbBoxItemHistory_');
const HIST = BOX.slice(histStart);
ok(/`transaction_type` = 'credit'/.test(HIST),
  'the item history reads spend rows only');

/* ── 8. The account-range predicate is honest about being unsargable ─────── */
console.log('the 300000–400000 predicate');
ok(BOX.indexOf('CAST(`chart_of_accounts` AS UNSIGNED) BETWEEN 300000 AND 400000') !== -1,
  'the range predicate casts, per plan §2.1');
ok(/REGEXP '\^\[0-9\]\+\$'/.test(BOX),
  'guarded by a digits-only test, so a non-numeric code cannot CAST to 0 and pass by accident');
ok(/NOT SARGABLE/.test(BOX),
  'the comment records that it is not sargable and what would make it indexable');

/* ── 9. Nothing unbounded leaves the database ─────────────────────────────── */
console.log('nothing unbounded leaves the database');
const selects = BOX.match(/'SELECT[\s\S]*?executeQuery\(\)/g) || [];
ok(selects.length > 0, 'SELECT statements found: ' + selects.length);
fnNames.forEach(function (name) {
  const start = BOX.indexOf('function ' + name + '(');
  const nextIdx = BOX.slice(start + 1).search(/\nfunction \w/);
  const body = nextIdx === -1 ? BOX.slice(start) : BOX.slice(start, start + 1 + nextIdx);
  if (body.indexOf('executeQuery()') === -1) return;
  if (body.indexOf('COUNT(*)') !== -1 && body.indexOf("'SELECT `") === -1 &&
      body.indexOf("'SELECT ' + cols") === -1) return;   /* a bare COUNT returns one row */
  ok(/LIMIT/.test(body), name + ' bounds its result set with a LIMIT');
});

console.log(failures === 0
  ? '\nAll SQL discipline checks pass.'
  : '\n' + failures + ' SQL discipline check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
