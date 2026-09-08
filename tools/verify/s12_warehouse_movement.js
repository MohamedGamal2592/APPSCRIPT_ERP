/**
 * S12 — حركة المخزن (valley_warehouse_movement).
 *
 * The table is a PRODUCTION table inherited from the legacy AppSheet app, with
 * exactly 17 physical columns. This run added a page on top of it and must not
 * have changed its shape. Everything here is offline, over the real source: no
 * network, no spreadsheet, no Google service.
 *
 * The interesting half is not the string matching — it is section 8, which
 * EXTRACTS the real handler block out of Company_ValleyFoods_Actions.js and
 * RUNS saveValleyWarehouseMovement_ against stubbed sheet access, then asserts
 * on the row map and the formulas it would have written. Nothing reaches a real
 * spreadsheet; the stubs record instead of writing.
 *
 * Run: node tools/verify/s12_warehouse_movement.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const PAGE_FILE = path.join(ROOT, 'Company_ValleyFoods_WarehouseMovement.html');
const PAGE = fs.existsSync(PAGE_FILE) ? fs.readFileSync(PAGE_FILE, 'utf8') : '';

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
}

/* The 17 physical columns, in sheet order, transcribed from
   appsheet_old_project.html § table_valley_warehouse_movement_Schema.
   `movmenent_sign` is misspelled in production and stays misspelled. */
const EXPECTED_HEADERS = [
  'unique_id', 'id', 'warehouse', 'vendor', 'item', 'item_code', 'unit', 'qty',
  'amount', 'movement_type', 'movmenent_sign', 'movement_date', 'asset_target',
  'responsible_person', 'notes', 'user', 'created_at'
];

/* ── 1. WH_MOVE_HEADERS is those 17 names, in order ──────────────────────── */
console.log('\n1 — the 17 headers, in sheet order\n');

const mHdr = SRC.match(/WH_MOVE_HEADERS\s*=\s*\[([\s\S]*?)\]\s*;/);
check(!!mHdr, 'WH_MOVE_HEADERS is declared');
const headers = mHdr
  ? mHdr[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  : [];
check(headers.length === 17, 'it has exactly 17 entries', 'got ' + headers.length);
check(JSON.stringify(headers) === JSON.stringify(EXPECTED_HEADERS),
  'every name matches the sheet, in order',
  'got: ' + headers.join(','));
check(headers[10] === 'movmenent_sign',
  'column K keeps the production misspelling `movmenent_sign`');
check(headers.indexOf('movement_sign') === -1,
  'the corrected spelling `movement_sign` is NOT in the header list');
check(headers.indexOf('user_name') === -1 && headers.indexOf('product_current') === -1,
  'the two legacy VIRTUAL columns are not treated as sheet columns');

/* ── 2. The two formula strings, byte for byte ───────────────────────────── */
console.log('\n2 — the two sheet formulas\n');

/* item_code (F) — the legacy R1C1 resolved to A1:
     RC[-1] -> E, C[-5]:C[-3] -> A:C, C[-5]:C -> A:F  */
const ITEM_CODE_FORMULA =
  "'item_code': '=IFERROR(VLOOKUP(E' + r + ',valley_product_purchasing!A:C,3,0)," +
  "IFERROR(VLOOKUP(E' + r + ',valley_manufacture_header!A:C,3,0)," +
  "IFERROR(VLOOKUP(E' + r + ',valley_manufacture_by_product!A:F,6,0),\"\")))'";

/* movmenent_sign (K) — compares the FULL enum string. A version comparing only
   "وارد" makes every row negative and looks correct in review. */
const SIGN_FORMULA =
  "'movmenent_sign': '=IF(J' + r + '=\"وارد داخلي / مرتجع للمخزن\",H' + r + ',H' + r + '*-1)'";

check(SRC.indexOf(ITEM_CODE_FORMULA) !== -1,
  'the item_code formula is present, byte for byte (addresses E, writes F)');
check(SRC.indexOf(SIGN_FORMULA) !== -1,
  'the movmenent_sign formula is present, byte for byte (reads J and H, writes K)');
check(!/=IF\(J'\s*\+\s*r\s*\+\s*'="وارد"/.test(SRC),
  'the sign formula does NOT compare the truncated string "وارد"');

/* ── 3. WH_MOVE_TYPES is exactly the two enum strings ────────────────────── */
console.log('\n3 — the movement-type enum\n');

const mTypes = SRC.match(/WH_MOVE_TYPES\s*=\s*\[([\s\S]*?)\]\s*;/);
check(!!mTypes, 'WH_MOVE_TYPES is declared');
const types = mTypes
  ? mTypes[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  : [];
check(types.length === 2, 'it has exactly two values, with no "other"', 'got ' + types.length);
check(types[0] === 'منصرف', 'the issue value is «منصرف»');
check(types[1] === 'وارد داخلي / مرتجع للمخزن',
  'the receipt value is the full «وارد داخلي / مرتجع للمخزن»');
check(SRC.indexOf("const WH_IN_TYPE      = 'وارد داخلي / مرتجع للمخزن';") !== -1,
  'WH_IN_TYPE is the same full string');
check(SRC.indexOf("const WH_WAREHOUSE    = 'مخزن مصنع فالي فودز';") !== -1,
  'WH_WAREHOUSE is the constant «مخزن مصنع فالي فودز»');

/* ── 4. settingsEnsureSheet_ never sees this sheet ───────────────────────── */
console.log('\n4 — the schema-appending helper is never pointed at this table\n');

check(!/settingsEnsureSheet_\s*\([^)]*WH_MOVE_SHEET/.test(SRC),
  'settingsEnsureSheet_ is never called with WH_MOVE_SHEET');
check(!/settingsEnsureSheet_\s*\([^)]*['"]valley_warehouse_movement['"]/.test(SRC),
  'nor with the literal sheet name');
check(/function whAssertHeaders_\s*\(/.test(SRC),
  'whAssertHeaders_ exists as the read-and-assert alternative');
{
  /* it must not write: no append, no setValues, no insertSheet in its body */
  const body = SRC.slice(SRC.indexOf('function whAssertHeaders_'));
  const end = body.indexOf('\n  }');
  const fn = body.slice(0, end === -1 ? 600 : end);
  check(!/appendRow|setValues|insertSheet|getRange\s*\([^)]*\)\s*\.set/.test(fn),
    'whAssertHeaders_ contains no write of any kind');
  check(/throw new Error/.test(fn), 'it throws on a mismatch rather than repairing');
}

/* ── 5. cost stripping is server-side ────────────────────────────────────── */
console.log('\n5 — amount and unit_cost are stripped, not hidden\n');

check(/warehouse_move:\s*\['amount',\s*'unit_cost'\]/.test(SRC),
  "VF_COST_KEYS.warehouse_move is ['amount', 'unit_cost']");
check(/if\s*\(!canCost\)\s*vfStripCostAll_\(paged\.rows,\s*VF_COST_KEYS\.warehouse_move\)/.test(SRC),
  'the list strips them when vfCanSeeCost_ is false');
check(/if\s*\(!canCost\)\s*vfStripCostAll_\(batches,\s*VF_COST_KEYS\.warehouse_move\)/.test(SRC),
  'the options payload strips unit_cost off the batch list too');

/* ── 6. the over-issue guard is server-side and reads the sheet ──────────── */
console.log('\n6 — the over-issue guard\n');

const saveStart = SRC.indexOf('function saveValleyWarehouseMovement_');
check(saveStart !== -1, 'saveValleyWarehouseMovement_ exists');
const saveBody = saveStart === -1 ? '' : SRC.slice(saveStart, saveStart + 9000);

check(/whBatchAvailability_\(dbId\)/.test(saveBody),
  'the save recomputes availability from the sheet');
check(/availability\[batchUid\]/.test(saveBody),
  'and keys it by the batch uid');
check(/Number\(batch\.available\)/.test(saveBody),
  '`available` comes from the recomputed batch, never from the payload');
check(!/d\.available|data\.available|d\.amount|data\.amount|d\.unit_cost|data\.unit_cost|row\.available|row\.amount|row\.unit_cost/.test(saveBody),
  'the payload\'s own available / amount / unit_cost are never read');
check(/Math\.round\(\(Number\(batch\.unit_cost\)[^)]*\)\s*\*\s*qty\s*\*\s*100\)\s*\/\s*100/.test(saveBody),
  'amount is computed server-side as batch.unit_cost x qty, rounded to 2');
check(/type\s*!==\s*WH_IN_TYPE/.test(saveBody),
  'the guard applies to منصرف only, not to the internal receipt');
/* The batch path adds a second obligation: rows of ONE submission drawing on
   the same batch must not each be measured against the same starting figure. */
check(/drawn\[batchUid\]/.test(saveBody),
  'earlier rows of the same submission draw the batch down for later ones');
check(/remaining/.test(saveBody),
  'and the guard compares against what is left, not the untouched figure');

/* whBatchAvailability_ must read the movement sheet itself */
check(/getAllRecords_\(dbId, WH_MOVE_SHEET\)\.forEach/.test(SRC),
  'availability folds in this table\'s own movmenent_sign');


/* ── 7. the page ships add-only, with no warehouse / asset_target field ──── */
console.log('\n7 — the page template\n');

if (!PAGE) {
  failed++;
  console.log('  FAIL  Company_ValleyFoods_WarehouseMovement.html is missing');
} else {
  check(!/id\s*=\s*['"]warehouse['"]|key:\s*['"]warehouse['"]/.test(PAGE),
    'no `warehouse` input — it is a server-side constant');
  check(!/id\s*=\s*['"]asset_target['"]|key:\s*['"]asset_target['"]/.test(PAGE),
    'no `asset_target` input — it is always written blank');
  check(PAGE.indexOf('delete_valley_warehouse_movement') === -1,
    'no delete action is wired up');
  check(!/save_valley_warehouse_movement_update|_update['"]/.test(PAGE),
    'no update/edit action is wired up');
  check(PAGE.indexOf('save_valley_warehouse_movement') !== -1,
    'the save action IS wired up');
  check(PAGE.indexOf('get_valley_warehouse_movements') !== -1,
    'the list action is wired up');
  /* the ledger is append-only: no row-level edit or delete affordance */
  check(!/onEdit|editMovement|deleteMovement|openEdit/.test(PAGE),
    'no per-row edit or delete handler exists');
}

/* the backend must not ship an edit or delete handler either */
check(SRC.indexOf('deleteValleyWarehouseMovement_') === -1,
  'no delete handler exists on the server');
check(SRC.indexOf("'save_valley_warehouse_movement': { page: 'vf_warehouse_movement', access: 'full' }") === -1,
  'no action is registered at `full` access');

/* ── 7b. the page and the handler agree on the multi-row shape ───────────── */
console.log('\n7b — the form posts many rows, and the server reads them\n');
if (PAGE) {
  check(/rows:\s*rows\.map\(/.test(PAGE),
    'the form posts a `rows` array, not one movement per request');
  check(/Array\.isArray\(d\.rows\)/.test(SRC),
    'and the handler reads it');

  /* The shared facts belong to the submission; only what differs is repeated. */
  ['wm-type', 'wm-date', 'wm-responsible', 'wm-vendor'].forEach(function (k) {
    check(PAGE.indexOf("'" + k + "'") !== -1, k + ' is a header field, entered once');
  });
  check(/rows:\s*rows\.map\(function[^}]*item:[^}]*qty:[^}]*notes:/.test(PAGE.replace(/\s+/g, ' ')),
    'a row carries only batch, quantity and notes');

  /* Rows are keyed, not indexed — removing one must not renumber the rest,
     which is what allows a removal without re-rendering and destroying a combo
     that is being typed into. */
  check(/wm-item-'\s*\+\s*k|wm-item-' \+ row\.k/.test(PAGE),
    'row controls are keyed by a stable row key, not by array index');
  check(/function removeRow\(/.test(PAGE) && /function addRow\(/.test(PAGE),
    'rows can be added and removed');
  check(/WM_PAGE\.addRow|WM_PAGE\.removeRow/.test(PAGE),
    'and both are reachable from the markup');

  /* The client must not send figures the server derives. */
  check(!/amount:\s*[^,}]*(qty|unit_cost)/.test(PAGE),
    'the form still sends no amount — the server prices every row itself');
  check(PAGE.indexOf('unit_cost:') === -1,
    'and no unit_cost');
}


/* ── 8. dry run: what the save would actually write ──────────────────────── */
console.log('\n8 — dry run of the real save handler, against stubbed sheet access\n');

/* Lift the real handler block out of the real source and run it. The slice is
   delimited by the two comment banners around it, so a drift in either one
   fails loudly here rather than silently testing nothing. */
const BLOCK_START = SRC.indexOf("const WH_MOVE_SHEET   = 'valley_warehouse_movement';");
const BLOCK_END = SRC.indexOf('/* ---------- SALES INVOICES', BLOCK_START);
check(BLOCK_START !== -1 && BLOCK_END > BLOCK_START,
  'the handler block can be located in the real source');

const captured = { written: null, sheetsTouched: [], audit: null };

if (BLOCK_START !== -1 && BLOCK_END > BLOCK_START) {
  const block = SRC.slice(BLOCK_START, BLOCK_END);

  /* ---- fixtures ---- */
  const CURRENT_PRODUCTS = [
    { unique_id: 'BATCH-A', transaction_code: 'PO-1001', product_id: '7',
      product: 'زيت نخيل', current_qty: 100, unit_cost: 12.5, unit: 'كجم',
      transaction_date: '2026-01-10' },
    { unique_id: 'BATCH-B', transaction_code: 'PO-1002', product_id: '9',
      product: 'سكر', current_qty: 40, unit_cost: 3, unit: '',
      transaction_date: '2026-02-01' }
  ];
  /* BATCH-A: 100 − 10 (sold) + 2 (returned) − 5 (consumed) − 7 (issued) = 80 */
  const SALES_STOCK = [
    { unique_id: 'ALLOC-1', product_unique_id: 'BATCH-A', product_qty: 10 }
  ];
  const RETURNS_STOCK = [{ product_unique_id: 'ALLOC-1', product_qty: 2 }];
  const MFG_FOOTER = [{ item: 'BATCH-A', qty: 5 }];
  const EXISTING_MOVES = [
    { id: 1, item: 'BATCH-A', qty: 7, movement_type: 'منصرف', movmenent_sign: -7,
      movement_date: '2026-03-01', vendor: '18', responsible_person: 'E-1',
      unit: 'كجم', amount: 87.5, unique_id: 'aaa', item_code: 'X1', notes: '', user: 'a@b.c' }
  ];
  const PARTIES = [{ id: 18, name: 'مورد افتراضي' }];
  const EMPLOYEES = [{ emp_id: 'E-1', name: 'أحمد' }];
  const PRODUCTS = [{ id: '9', name_ar: 'سكر', unit: 'شيكارة' }];

  const TABLES = {
    'valley_current_products': CURRENT_PRODUCTS,
    'valley_sales_product_stock': SALES_STOCK,
    'valley_sales_returns_stock': RETURNS_STOCK,
    'valley_manufacture_footer': MFG_FOOTER,
    'valley_warehouse_movement': EXISTING_MOVES,
    'valley_legal_customer_vendor': PARTIES,
    'valley_employee_info': EMPLOYEES,
    'valley_products': PRODUCTS
  };

  /* A sheet stub that records the ONE batched write and refuses anything else,
     so a handler that went back to appending row by row fails here. */
  const fakeSheet = {
    _name: 'valley_warehouse_movement',
    getLastRow: () => EXISTING_MOVES.length + 1,
    getLastColumn: () => EXPECTED_HEADERS.length,
    getRange: (row, col, nRows, nCols) => ({
      setValues: (v) => {
        if (captured.written) throw new Error('DRY RUN: the batch must be ONE setValues');
        captured.written = { startRow: row, col: col, rows: nRows, cols: nCols, matrix: v };
      },
      getValues: () => { throw new Error('DRY RUN: the save must not read back'); },
      setNumberFormat: () => {}
    }),
    appendRow: () => { throw new Error('DRY RUN: appendRow must not be reached'); },
    insertSheet: () => { throw new Error('DRY RUN: insertSheet must not be reached'); }
  };

  const env = {
    /* sheet access */
    getSheet_: (name) => { captured.sheetsTouched.push(name); return fakeSheet; },
    getHeaders_: () => EXPECTED_HEADERS.slice(),
    getAllRecords_: (dbId, name) => {
      if (!TABLES[name]) throw new Error('no fixture for ' + name);
      /* hand out copies: a handler that mutated a record would not corrupt the
         next read, exactly as the real per-execution cache behaves */
      return TABLES[name].map(r => Object.assign({}, r));
    },
    /* §4: valley_current_products is read LIVE, never through the memo, so it
       has its own reader rather than going through getAllRecords_. */
    vfCurrentProducts_: () => CURRENT_PRODUCTS.map(r => Object.assign({}, r)),
    /* the write path, recorded instead of performed */
    getNextIdBatch_: (dbId, name, count) => { captured.idCount = count; return 99; },
    noteMutation_: () => {},
    logHistoryMany_: (entries) => { captured.audit = entries; },
    /* leaf helpers */
    uid16Hex_: () => 'ffffffff00000001',
    parseDate_: (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; },
    vfPage_: (rows, payload, dateField) => ({ rows: rows.slice(), total: rows.length }),
    vfCanSeeCost_: (user) => !!(user && user.canCost),
    vfStripCostAll_: (list, keys) => {
      (list || []).forEach(o => keys.forEach(k => { delete o[k]; }));
      return list;
    },
    VF_COST_KEYS: { warehouse_move: ['amount', 'unit_cost'], batch: ['unit_cost'] },
    /* sheet-name constants the block closes over */
    MFG_CONSUMPTION_SHEET: 'valley_manufacture_footer',
    FIN_PARTIES_SHEET: 'valley_legal_customer_vendor',
    FIN_PRODUCTS_SHEET: 'valley_products',
    EMP_INFO_SHEET: 'valley_employee_info'
  };

  const factory = new Function('env',
    'with (env) {\n' + block + '\n' +
    'return { save: saveValleyWarehouseMovement_, list: getValleyWarehouseMovements_,' +
    ' options: getValleyWarehouseMoveOptions_, avail: whBatchAvailability_,' +
    ' assert: whAssertHeaders_, formulas: whMoveFormulaMap_,' +
    ' HEADERS: WH_MOVE_HEADERS, TYPES: WH_MOVE_TYPES, IN: WH_IN_TYPE, WAREHOUSE: WH_WAREHOUSE };\n}');
  const H = factory(env);

  /** the written row i, as {header: value} */
  function writtenRow(i) {
    const o = {};
    if (!captured.written) return o;
    EXPECTED_HEADERS.forEach((h, c) => { o[h] = captured.written.matrix[i][c]; });
    return o;
  }
  function reset() { captured.written = null; captured.audit = null; }

  /* -- 8a. availability arithmetic -- */
  const avail = H.avail('db');
  check(avail['BATCH-A'].available === 80,
    'availability = 100 − 10 sold + 2 returned − 5 consumed − 7 issued = 80',
    'got ' + avail['BATCH-A'].available);

  /* -- 8b. a good single save (the old payload shape still works) -- */
  const payload = {
    movement_date: '2026-09-06',
    movement_type: 'منصرف',
    item: 'BATCH-A',
    qty: 4,
    vendor: '18',
    responsible_person: 'E-1',
    notes: 'صرف للإنتاج',
    /* the client is lying about all three; the server must ignore them */
    available: 999999,
    amount: 1,
    unit_cost: 1
  };
  reset();
  const out = H.save(payload, { email: 'user@valley.test', canCost: true }, 'db');
  check(out && out.status === 'success', 'a valid منصرف saves');
  check(out.count === 1, 'and reports one movement', 'got ' + (out && out.count));

  check(!!captured.written, 'the row reached the sheet in one batched write');
  check(captured.written.rows === 1 && captured.written.cols === 17,
    'exactly one row of 17 columns',
    captured.written.rows + ' x ' + captured.written.cols);
  check(captured.sheetsTouched.indexOf('valley_warehouse_movement') !== -1,
    'it targets valley_warehouse_movement');

  const a = writtenRow(0);
  check(a.warehouse === 'مخزن مصنع فالي فودز', 'warehouse is the constant');
  check(a.asset_target === '', 'asset_target is written blank');
  check(a.item === 'BATCH-A', 'item is the batch uid');
  check(a.unit === 'كجم', 'unit comes from the batch');
  check(a.qty === 4, 'qty is the payload qty');
  check(a.amount === 50, "amount = unit_cost 12.5 x qty 4 = 50, not the payload's 1",
    'got ' + a.amount);
  check(a.user === 'user@valley.test', 'user is the session email');
  check(a.id === 99, 'id comes from the batch allocator, not from the payload', 'got ' + a.id);
  check(String(a.unique_id).length === 16, 'unique_id is a 16-char id');
  check(captured.idCount === 1, 'exactly one id was allocated');

  /* the two formulas now ride in the same matrix as the values */
  check(typeof a.item_code === 'string' && a.item_code.charAt(0) === '=',
    'item_code is written as a FORMULA', JSON.stringify(a.item_code));
  check(typeof a.movmenent_sign === 'string' && a.movmenent_sign.charAt(0) === '=',
    'movmenent_sign likewise', JSON.stringify(a.movmenent_sign));
  const rowNo = captured.written.startRow;
  check(a.item_code.indexOf('VLOOKUP(E' + rowNo + ',') !== -1,
    'item_code (F) reads E on its OWN row', a.item_code);
  check(a.movmenent_sign === '=IF(J' + rowNo + '="وارد داخلي / مرتجع للمخزن",H' + rowNo + ',H' + rowNo + '*-1)',
    'movmenent_sign (K) reads J and H on its own row, with the full enum',
    'got ' + a.movmenent_sign);
  check(EXPECTED_HEADERS[5] === 'item_code' && EXPECTED_HEADERS[10] === 'movmenent_sign',
    'the formulas sit in the asserted 17-column row');
  check(!!captured.audit && captured.audit.length === 1,
    'the audit trail is written once for the batch',
    captured.audit ? captured.audit.length : 'none');

  console.log('\n        captured row (header -> value):');
  EXPECTED_HEADERS.forEach((h) => {
    const v = a[h];
    console.log('          ' + h.padEnd(20) +
      ' = ' + (v instanceof Date ? v.toISOString().slice(0, 10) + ' (Date)' : JSON.stringify(v)));
  });

  /* -- 8c. the over-issue guard actually throws -- */
  console.log('');
  function throws(fn) { try { fn(); return null; } catch (e) { return e.message; } }

  reset();
  const over = throws(() => H.save(
    Object.assign({}, payload, { qty: 80.001 }),
    { email: 'user@valley.test', canCost: true }, 'db'));
  check(!!over, 'qty = available + 0.001 is refused');
  check(over && over.indexOf('80') !== -1,
    'the message names the available quantity', 'got: ' + over);
  check(captured.written === null, 'and nothing was written');

  reset();
  check(throws(() => H.save(Object.assign({}, payload, { qty: 80 }),
    { email: 'u@v.t', canCost: true }, 'db')) === null,
    'qty exactly equal to available is allowed');

  /* the internal receipt is NOT capped by availability */
  reset();
  check(throws(() => H.save(Object.assign({}, payload,
    { movement_type: 'وارد داخلي / مرتجع للمخزن', qty: 5000 }),
    { email: 'u@v.t', canCost: true }, 'db')) === null,
    'وارد داخلي / مرتجع للمخزن is not capped by available');

  /* -- 8d. the other five validations -- */
  console.log('');
  reset();
  check(!!throws(() => H.save(Object.assign({}, payload, { movement_date: '' }),
    { email: 'u@v.t' }, 'db')), 'a missing date is refused');
  check(!!throws(() => H.save(Object.assign({}, payload, { movement_type: 'وارد' }),
    { email: 'u@v.t' }, 'db')), 'a truncated «وارد» is refused as an invalid type');
  check(!!throws(() => H.save(Object.assign({}, payload, { item: 'NOPE' }),
    { email: 'u@v.t' }, 'db')), 'an unknown batch is refused');
  check(!!throws(() => H.save(Object.assign({}, payload, { qty: 0 }),
    { email: 'u@v.t' }, 'db')), 'qty of zero is refused');
  check(!!throws(() => H.save(Object.assign({}, payload, { responsible_person: 'E-404' }),
    { email: 'u@v.t' }, 'db')), 'an unknown responsible person is refused');

  /* -- 8e. the unit falls back to valley_products when the batch has none -- */
  reset();
  H.save({ movement_date: '2026-09-06', movement_type: 'منصرف', item: 'BATCH-B',
    qty: 1, responsible_person: 'E-1' }, { email: 'u@v.t' }, 'db');
  check(writtenRow(0).unit === 'شيكارة',
    'a batch with no unit falls back to valley_products.unit via product_id',
    'got ' + writtenRow(0).unit);

  /* -- 8g. MANY movements in one submission -- */
  console.log('\n        many rows in one submission\n');
  const shared = {
    movement_date: '2026-09-06',
    movement_type: 'منصرف',
    responsible_person: 'E-1',
    vendor: '18'
  };

  reset();
  const many = H.save(Object.assign({}, shared, {
    rows: [
      { item: 'BATCH-A', qty: 10, notes: 'أ' },
      { item: 'BATCH-B', qty: 2, notes: 'ب' },
      { item: 'BATCH-A', qty: 5 }
    ]
  }), { email: 'u@v.t', canCost: true }, 'db');
  check(many && many.status === 'success', 'three movements save together',
    many && many.message);
  check(many.count === 3, 'and the response says three', 'got ' + many.count);
  check(captured.written && captured.written.rows === 3,
    'all three reach the sheet in ONE setValues',
    captured.written ? captured.written.rows : 'nothing written');
  check(captured.idCount === 3, 'three ids allocated in one call', captured.idCount);
  check(captured.audit && captured.audit.length === 3,
    'and ONE audit write covering all three',
    captured.audit ? captured.audit.length : 'none');

  const r0 = writtenRow(0), r1 = writtenRow(1), r2 = writtenRow(2);
  check(r0.item === 'BATCH-A' && r1.item === 'BATCH-B' && r2.item === 'BATCH-A',
    'in the order they were entered');
  check(r0.id === 99 && r1.id === 100 && r2.id === 101,
    'with consecutive ids', [r0.id, r1.id, r2.id].join(','));
  check(r0.movement_type === 'منصرف' && r1.movement_type === 'منصرف',
    'the shared header applies to every row');
  check(r0.notes === 'أ' && r1.notes === 'ب' && r2.notes === '',
    'and a per-row field overrides nothing it did not set');
  check(r0.amount === 125 && r1.amount === 6,
    'each row prices from its OWN batch (12.5x10=125, 3x2=6)',
    r0.amount + ' / ' + r1.amount);
  /* each row's formulas must address its own row, not the first */
  const sr = captured.written.startRow;
  check(r1.item_code.indexOf('VLOOKUP(E' + (sr + 1) + ',') !== -1 &&
        r2.item_code.indexOf('VLOOKUP(E' + (sr + 2) + ',') !== -1,
    'every row\'s formulas address its own row number',
    [r0.item_code, r1.item_code, r2.item_code].join('\n        '));

  /* THE ONE THAT MATTERS: two rows drawing on the same batch */
  reset();
  const overdraw = throws(() => H.save(Object.assign({}, shared, {
    rows: [
      { item: 'BATCH-A', qty: 50 },
      { item: 'BATCH-A', qty: 40 }   /* 50 + 40 = 90 > 80 available */
    ]
  }), { email: 'u@v.t' }, 'db'));
  check(!!overdraw,
    'two rows that TOGETHER overdraw one batch are refused — 50 + 40 > 80',
    'no error thrown; the batch would have been overdrawn');
  check(overdraw && /السطر 2/.test(overdraw),
    '  and the message names the offending line', 'got: ' + overdraw);
  check(captured.written === null, '  with nothing written — all or nothing');

  reset();
  check(throws(() => H.save(Object.assign({}, shared, {
    rows: [{ item: 'BATCH-A', qty: 50 }, { item: 'BATCH-A', qty: 30 }]
  }), { email: 'u@v.t' }, 'db')) === null,
    'and 50 + 30 = exactly 80 is allowed');

  /* an inbound row credits the batch for a later outbound one */
  reset();
  check(throws(() => H.save(Object.assign({}, shared, {
    rows: [
      { item: 'BATCH-A', qty: 20, movement_type: 'وارد داخلي / مرتجع للمخزن' },
      { item: 'BATCH-A', qty: 95 }
    ]
  }), { email: 'u@v.t' }, 'db')) === null,
    'a return earlier in the same submission credits a later issue (80 + 20 >= 95)');

  /* one bad row rejects the whole submission */
  reset();
  const partial = throws(() => H.save(Object.assign({}, shared, {
    rows: [
      { item: 'BATCH-A', qty: 1 },
      { item: 'NOPE', qty: 1 },
      { item: 'BATCH-B', qty: 1 }
    ]
  }), { email: 'u@v.t' }, 'db'));
  check(!!partial, 'one unknown batch rejects the whole submission');
  check(partial && /السطر 2/.test(partial), '  naming the line', 'got: ' + partial);
  check(captured.written === null,
    '  and the two good rows are NOT written either — the user still has them all');

  /* the cap */
  reset();
  const tooMany = [];
  for (let i = 0; i < 201; i++) tooMany.push({ item: 'BATCH-A', qty: 0.001 });
  check(!!throws(() => H.save(Object.assign({}, shared, { rows: tooMany }),
    { email: 'u@v.t' }, 'db')), 'more than 200 rows in one submission is refused');

  /* an empty rows array is still the single-movement shape, not a silent no-op */
  reset();
  check(!!throws(() => H.save(Object.assign({}, shared, { rows: [] }),
    { email: 'u@v.t' }, 'db')),
    'a submission with an empty rows array is refused, not silently ignored');


  /* -- 8f. cost gating, differential over the SAME data -- */
  console.log('');
  const withCost = H.list({}, { email: 'u@v.t', canCost: true }, 'db');
  const noCost = H.list({}, { email: 'u@v.t', canCost: false }, 'db');
  check('amount' in withCost.rows[0], 'with the grant, `amount` is in the row');
  check(!('amount' in noCost.rows[0]), 'without it, `amount` is ABSENT from the row');
  check(noCost.rows[0].qty === withCost.rows[0].qty,
    'everything non-cost is identical between the two');
  check(noCost.can_see_cost === false && withCost.can_see_cost === true,
    'the response says which of the two shapes it is');
  check(JSON.stringify(noCost).indexOf('87.5') === -1,
    'the ungranted payload contains no cost value anywhere, at any depth');

  const optNo = H.options({}, { email: 'u@v.t', canCost: false }, 'db');
  const optYes = H.options({}, { email: 'u@v.t', canCost: true }, 'db');
  check(optYes.batches.length > 0 && 'unit_cost' in optYes.batches[0],
    'with the grant, the batch options carry unit_cost');
  check(!('unit_cost' in optNo.batches[0]),
    'without it, unit_cost is ABSENT from the batch options');
  check(optNo.batches[0].available === optYes.batches[0].available,
    'available survives the strip — the picker still works without cost');
  check(optNo.batches.every(b => b.available > 0),
    'only batches with available > 0 are offered');

  /* -- 8g. the header assertion refuses a reordered sheet -- */
  console.log('');
  /* `with (env)` resolves getHeaders_ dynamically, so swapping it here is what
     the handler will actually see on its next call. */
  const realHeaders = env.getHeaders_;

  const typo = EXPECTED_HEADERS.slice();
  typo[10] = 'movement_sign';               /* the plausible correction */
  env.getHeaders_ = () => typo;
  const typoErr = throws(() => H.assert(fakeSheet));
  check(!!typoErr, 'a sheet whose column K reads `movement_sign` is refused, not repaired');
  check(typoErr && typoErr.indexOf('11') !== -1,
    'the error names the offending column number', 'got: ' + typoErr);
  check(!!throws(() => H.save(payload, { email: 'u@v.t' }, 'db')),
    'and the save refuses to run against that sheet at all');

  const swapped = EXPECTED_HEADERS.slice();
  swapped[7] = 'amount'; swapped[8] = 'qty';   /* H and I transposed */
  env.getHeaders_ = () => swapped;
  check(!!throws(() => H.assert(fakeSheet)),
    'a sheet with qty and amount transposed is refused — the F/K formulas are positional');

  env.getHeaders_ = () => EXPECTED_HEADERS.slice(0, 16);
  check(!!throws(() => H.assert(fakeSheet)), 'a truncated header row is refused');

  env.getHeaders_ = realHeaders;
  check(throws(() => H.assert(fakeSheet)) === null,
    'the real 17-column row passes');

  check(captured.sheetsTouched.every(n => n === 'valley_warehouse_movement'),
    'getSheet_ was only ever asked for valley_warehouse_movement');
}

/* ── 9. registration ─────────────────────────────────────────────────────── */
console.log('\n9 — registration\n');


check(/'get_valley_warehouse_movements':\s*\{\s*page:\s*'vf_warehouse_movement',\s*access:\s*'read'\s*\}/.test(SRC),
  'the list action is gated read on vf_warehouse_movement');
check(/'save_valley_warehouse_movement':\s*\{\s*page:\s*'vf_warehouse_movement',\s*access:\s*'write'\s*\}/.test(SRC),
  'the save action is gated write on vf_warehouse_movement');
check(/'save_valley_warehouse_movement':\s*'valley_warehouse_movement'/.test(SRC),
  'ACTION_TABLES maps the save to the right table');
check(/ValleyFoods\.register\('save_valley_warehouse_movement',\s*saveValleyWarehouseMovement_\)/.test(SRC),
  'the save handler is registered');

{
  const REG = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Registry.js'), 'utf8');
  check(/action:\s*'vf_warehouse_movement'/.test(REG), 'the page is in the registry');
  check(/template:\s*'Company_ValleyFoods_WarehouseMovement'/.test(REG),
    'it points at the right template');
  const NAV = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Nav.html'), 'utf8');
  check(NAV.indexOf('vf_warehouse_movement') !== -1, 'it has a nav entry');
}

/* ── 10. the page renders correctly when the cost keys are ABSENT ────────── */
/* Section 5 proved the server deletes them. This proves the page survives it:
   the same list, once with the grant and once without, booted for real on the
   DOM stub. The failure this catches is a column header hanging over `NaN`. */

const { bootPage, flush } = require('./pageharness');

/* Two rows as the server would actually send them: WITH cost keys, and the
   same rows with `amount` deleted — which is what vfStripCostAll_ does. */
const LIST_ROWS = [
  { id: 2, unique_id: 'u2', movement_date: '2026-09-05', item: 'BATCH-A',
    item_label: 'PO-1001 — زيت نخيل', item_code: 'IT-77', vendor: '18',
    vendor_name: 'مورد افتراضي', unit: 'كجم', qty: 4, amount: 50,
    movement_type: 'منصرف', movmenent_sign: -4, responsible_person: 'E-1',
    responsible_name: 'أحمد', notes: 'صرف للإنتاج', user: 'a@b.c' },
  { id: 1, unique_id: 'u1', movement_date: '2026-09-01', item: 'BATCH-B',
    item_label: 'PO-1002 — سكر', item_code: 'IT-78', vendor: '',
    vendor_name: '', unit: 'شيكارة', qty: 3, amount: 9,
    movement_type: 'وارد داخلي / مرتجع للمخزن', movmenent_sign: 3,
    responsible_person: 'E-1', responsible_name: 'أحمد', notes: '', user: 'a@b.c' }
];

function listResponse(canCost) {
  const rows = LIST_ROWS.map(r => {
    const c = Object.assign({}, r);
    if (!canCost) delete c.amount;          /* exactly what the server does */
    return c;
  });
  return {
    status: 'success', rows: rows, total: rows.length, can_see_cost: canCost,
    warehouse: 'مخزن مصنع فالي فودز',
    movement_types: ['منصرف', 'وارد داخلي / مرتجع للمخزن'],
    in_type: 'وارد داخلي / مرتجع للمخزن'
  };
}

/* UIC.PagedTable is intercepted rather than run: the DOM stub does not reflect
   an innerHTML write into a nested node, so the table's own markup never
   reaches a readable string. What the page actually decides — which headers it
   builds, and what each row's cells contain — is in the opts it hands over, and
   those are the page's real functions, called here with the real rows. */
async function renderList(canCost) {
  const s = bootPage({
    page: 'Company_ValleyFoods_WarehouseMovement.html',
    isSuperAdmin: true,
    containers: ['vf-wm-content', 'wm-table'],
    scriptlets: { CURRENT_ACTION: "'vf_warehouse_movement'" },
    expose: ['renderApp'],
    call: (action) => {
      if (action === 'get_valley_warehouse_movements') return listResponse(canCost);
      return { status: 'success' };
    }
  });
  let table = null;
  s.UIC.PagedTable = (opts) => { table = opts; };
  s.exported('renderApp')();
  await flush(); await flush(); await flush();
  if (!table) throw new Error('the page never built its table (canCost=' + canCost + ')');

  const headerLabels = (table.headers || [])
    .map(h => (typeof h === 'string' ? h : h.label));
  /* run the page's own mapRow over the payload it was given */
  const resp = listResponse(canCost);
  const cells = resp.rows.map(r => table.mapRow(r));
  return {
    shell: s.html('vf-wm-content'),
    headers: headerLabels,
    cells: cells,
    markup: headerLabels.join(' | ') + '\n' + cells.map(c => c.join(' | ')).join('\n')
  };
}

(async function () {
  console.log('\n10 — the page rendered against both payload shapes\n');
  try {
    const yes = await renderList(true);
    const no = await renderList(false);

    check(yes.headers.indexOf('القيمة') !== -1, 'with the grant, the القيمة column IS built');
    check(no.headers.indexOf('القيمة') === -1,
      'without it, the القيمة column is not built at all — no empty header');
    check(yes.headers.length === no.headers.length + 1,
      'exactly one column differs between the two',
      yes.headers.length + ' vs ' + no.headers.length);
    check(yes.cells[0].length === yes.headers.length &&
      no.cells[0].length === no.headers.length,
      'each row emits exactly as many cells as there are headers, in both shapes');

    check(yes.markup.indexOf('50.00') !== -1, 'with the grant, the amount is rendered');

    /* The whole point: a missing key must not become NaN or undefined on screen. */
    check(no.markup.indexOf('NaN') === -1, 'the ungranted render contains no NaN');
    check(no.markup.indexOf('undefined') === -1, 'the ungranted render contains no `undefined`');
    check(no.markup.indexOf('50.00') === -1 && no.markup.indexOf('9.00') === -1,
      'and no cost figure appears anywhere in the ungranted markup');

    /* everything non-cost still renders in both */
    ['PO-1001', 'IT-77', 'مورد افتراضي', 'كجم', 'أحمد', 'صرف للإنتاج'].forEach(t => {
      check(no.markup.indexOf(t) !== -1, 'without the grant, «' + t + '» still renders');
    });

    check(yes.markup.indexOf('منصرف') !== -1 &&
      yes.markup.indexOf('وارد داخلي / مرتجع للمخزن') !== -1,
      'both movement types render with their full labels');
    check(/−\s*4/.test(no.markup) && /\+\s*3/.test(no.markup),
      'the sign is carried on the quantity: منصرف shows −, وارد shows +');

    /* an empty vendor or note must read as a dash or blank, never as undefined */
    check(no.cells[1].every(c => String(c).indexOf('undefined') === -1),
      'a row with an empty vendor and empty notes renders cleanly');

    /* add-only, in the shell the page actually produced */
    check(yes.shell.indexOf('إضافة حركة') !== -1, 'the add button is drawn for a writer');
    check(!/حذف|تعديل/.test(yes.shell + yes.markup),
      'no delete or edit affordance is drawn anywhere');

    console.log('\n        ungranted row 1: ' + no.cells[0].join(' | ').replace(/<[^>]*>/g, ''));
    console.log('        granted   row 1: ' + yes.cells[0].join(' | ').replace(/<[^>]*>/g, ''));
  } catch (e) {
    failed++;
    console.log('  FAIL  the page threw while rendering: ' + e.message);
    console.log('        ' + String(e.stack || '').split('\n').slice(1, 4).join('\n        '));
  }

  console.log('');
  if (failed) { console.log('S12 — ' + failed + ' check(s) FAILED.\n'); process.exit(1); }
  console.log('S12 — all checks pass.\n');
})();
