// P3 step 3.1 — generate Company_ErpTest_Schema.js from header_map.json + field_inventory.json.
// Do not hand-edit the output. Reads local files only.
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const ROOT = path.resolve(DIR, '..', '..');

const headerMap = JSON.parse(fs.readFileSync(DIR + '/header_map.json', 'utf8'));
const overrides = JSON.parse(fs.readFileSync(DIR + '/header_map_overrides.json', 'utf8'));
const fieldInv = JSON.parse(fs.readFileSync(DIR + '/field_inventory.json', 'utf8'));

// ET_HEADER_MAP: { "<erp_test tab>": { "<TL header>": "<ET header> } } keeping ONLY pairs where TL != ET.
const ET_HEADER_MAP = {};
for (const [tab, info] of Object.entries(headerMap)) {
  const pairs = {};
  for (const [tlH, etH] of Object.entries(info.map || {})) {
    if (etH && etH !== tlH) pairs[tlH] = etH;
  }
  // fold in manual overrides (renames the algorithm can't infer)
  const ov = overrides[tab] || {};
  for (const [tlH, etH] of Object.entries(ov)) {
    if (tlH === '_note') continue;
    if (etH && etH !== tlH) pairs[tlH] = etH;
  }
  if (Object.keys(pairs).length) ET_HEADER_MAP[tab] = pairs;
}

// ET_CHART_COLS from P0 check 6.4 (recorded in the report / discovery: idx 8,13,14 of top_light_chart_of_accounts).
const ET_CHART_COLS = { key: 'المستوى الخامس', name: 'كود المستوى', main: 'اسم الحساب الرئيسي' };

// ET_FIELD_INVENTORY = field_inventory.json (chart placeholders already substituted).
const ET_FIELD_INVENTORY = fieldInv;

const banner = '// GENERATED FILE — do not hand-edit.\n' +
  '// Produced by tools/erptest/gen_schema.js from tools/erptest/header_map.json,\n' +
  '// tools/erptest/header_map_overrides.json and tools/erptest/field_inventory.json.\n' +
  '// Regenerate with: node tools/erptest/gen_schema.js\n\n';

const out = banner +
  'var ET_HEADER_MAP = ' + JSON.stringify(ET_HEADER_MAP, null, 2) + ';\n\n' +
  'var ET_CHART_COLS = ' + JSON.stringify(ET_CHART_COLS, null, 2) + ';\n\n' +
  'var ET_FIELD_INVENTORY = ' + JSON.stringify(ET_FIELD_INVENTORY, null, 2) + ';\n';

fs.writeFileSync(ROOT + '/Company_ErpTest_Schema.js', out, 'utf8');
console.log('wrote Company_ErpTest_Schema.js');
console.log('ET_HEADER_MAP tabs:', Object.keys(ET_HEADER_MAP).length);
for (const [t, m] of Object.entries(ET_HEADER_MAP)) console.log('  ', t, Object.keys(m).length, 'renamed pairs');
