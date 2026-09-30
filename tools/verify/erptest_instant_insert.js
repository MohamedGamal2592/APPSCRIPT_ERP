/*
 * erp_test instant-insert static checker (Plan_ErpTest_Instant_Insert.md P4).
 * Reads local files only. Prints one PASS/FAIL line per assertion and exits 1
 * if any failed. No network, no Google services, no spreadsheet.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const NL = '\r\n';

const results = [];
function check(n, label, ok, detail) {
  results.push(ok ? 1 : 0);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + ' ' + label + (ok ? '' : ' — ' + detail));
}

const code = read('Code.js');
const act = read('Company_ErpTest_Actions.js');
if (code.indexOf('\r\n') === -1 || act.indexOf('\r\n') === -1) {
  console.log('FAIL 0 sources are not CRLF — this script assumes CRLF markers (F1)');
  process.exit(1);
}

// ---- 1: ET_FAST_INSERT_ declared exactly once, shipped value false ----
(function () {
  const noCmp = code.replace(/!==|===|==/g, ' ');
  const assigns = noCmp.match(/ET_FAST_INSERT_\s*=\s*(true|false)/g) || [];
  check(1, 'ET_FAST_INSERT_ declared exactly once, shipped false',
    assigns.length === 1 && assigns[0] === 'ET_FAST_INSERT_ = false',
    'assignments found: ' + JSON.stringify(assigns));
})();

// ---- 2: the fast branch needs BOTH the flag AND the per-call opt-in ----
(function () {
  const m = /if\s*\(([^)]*opts\.fastCounter[^)]*)\)/.exec(code);
  const cond = m ? m[1] : '';
  check(2, 'fast branch guarded by ET_FAST_INSERT_ and opts.fastCounter',
    !!m && cond.indexOf('ET_FAST_INSERT_ === true') !== -1 && cond.indexOf('opts.fastCounter === true') !== -1,
    'condition found: ' + JSON.stringify(cond));
})();

// ---- 3: the fast branch sits after the isSystemTableBackend_ branch ----
(function () {
  const fnStart = code.indexOf('function getNextIdUnderLock_');
  const fnEnd = code.indexOf(NL + '}' + NL, fnStart);
  const body = fnStart === -1 ? '' : code.slice(fnStart, fnEnd);
  const iSys = body.indexOf('isSystemTableBackend_');
  const iFast = body.indexOf('opts.fastCounter');
  check(3, 'fast branch is after the isSystemTableBackend_ branch',
    fnStart !== -1 && fnEnd !== -1 && iSys !== -1 && iFast !== -1 && iSys < iFast,
    'isSystemTableBackend_@' + iSys + ' fastCounter@' + iFast);
})();

// ---- 4: both helpers exist; maxIdOf_ on exactly one path (the cold seed) ----
(function () {
  const pStart = code.indexOf('function etNextIdFromProperties_');
  const pEnd = code.indexOf(NL + '}' + NL, pStart);
  const pBody = pStart === -1 ? '' : code.slice(pStart, pEnd);
  const nMax = pBody.split('maxIdOf_').length - 1;
  const hasReseed = code.indexOf('function etReseedInsertIds_') !== -1;
  check(4, 'etNextIdFromProperties_ + etReseedInsertIds_ exist, maxIdOf_ once (cold seed)',
    pStart !== -1 && hasReseed && nMax === 1,
    'etNextIdFromProperties_@' + pStart + ' reseed=' + hasReseed + ' maxIdOf_ count=' + nMax);
})();

// ---- 5 + 6: positional lock-narrowing checks inside tlDbCreate_ ----
(function () {
  const tStart = act.indexOf('  function tlDbCreate_(');
  const tEnd = act.indexOf(NL + '  }' + NL, tStart);
  const slice = tStart === -1 ? '' : act.slice(tStart, tEnd);
  const lockOpen = slice.indexOf('executeWithLock_(function () {');
  const lockClose = lockOpen === -1 ? -1 : slice.indexOf(NL + '    });', lockOpen);
  const iDerive = slice.indexOf('tlDbDeriveRow_');
  const iAppend = slice.indexOf('tlDbAppendRow_');
  const iNote = slice.indexOf('noteRecordChange_');
  const iRec = slice.indexOf('tlDbRowRecord_');
  const shaped = tStart !== -1 && tEnd !== -1 && lockOpen !== -1 && lockClose !== -1 &&
    iDerive !== -1 && iAppend !== -1 && iNote !== -1 && iRec !== -1;
  check(5, 'noteRecordChange_ + tlDbRowRecord_ are OUTSIDE the lock callback',
    shaped && iNote > lockClose && iRec > lockClose,
    'lock[' + lockOpen + '..' + lockClose + '] note@' + iNote + ' record@' + iRec);
  check(6, 'tlDbDeriveRow_ + tlDbAppendRow_ are INSIDE the lock callback (box_balance guard)',
    shaped && iDerive > lockOpen && iDerive < lockClose && iAppend > lockOpen && iAppend < lockClose,
    'lock[' + lockOpen + '..' + lockClose + '] derive@' + iDerive + ' append@' + iAppend);
})();

// ---- 7: no 4th getNextIdUnderLock_ argument in the other four companies ----
(function () {
  const others = ['Company_TopLight_Actions.js', 'Company_TopChemical_Actions.js',
    'Company_ValleyFoods_Actions.js', 'Company_Assessment_Actions.js'];
  const offenders = [];
  others.forEach((f) => {
    const src = read(f);
    let idx = 0;
    for (;;) {
      idx = src.indexOf('getNextIdUnderLock_(', idx);
      if (idx === -1) break;
      let depth = 0, depth0commas = 0, i = idx + 'getNextIdUnderLock_'.length;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
        else if (c === ',' && depth === 1) depth0commas++;
      }
      if (depth0commas >= 3) {
        const line = src.slice(0, idx).split('\n').length;
        offenders.push(f + ':' + line);
      }
      idx += 'getNextIdUnderLock_'.length;
    }
  });
  check(7, 'no 4th getNextIdUnderLock_ argument outside erp_test',
    offenders.length === 0, 'offenders: ' + offenders.join(', '));
})();

const failed = results.filter((r) => !r).length;
if (failed) {
  console.log('erptest_instant_insert: FAIL (' + failed + ' of ' + results.length + ')');
  process.exit(1);
}
console.log('erptest_instant_insert: OK (' + results.length + ' assertions)');
