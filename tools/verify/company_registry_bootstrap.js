/*
 * Regression guard for the merged Apps Script load order.
 *
 * Company action IIFEs register document validators while source files load.
 * That path may ask for company policies before all Registry files exist. The
 * bootstrap must remain retryable, then publish all four companies atomically
 * when a real entry point runs after source evaluation is complete.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const orderedFiles = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8')).filePushOrder;

function inertService() {
  const noop = function () {};
  let service;
  service = new Proxy(function () {}, {
    get: function (_target, prop) {
      if (prop === 'getScriptProperties') return function () { return { getProperty: function () { return null; } }; };
      if (prop === 'getScriptCache') {
        return function () {
          return { get: function () { return null; }, getAll: function () { return {}; }, put: noop, remove: noop, removeAll: noop };
        };
      }
      return function () { return service; };
    },
    apply: function () { return service; }
  });
  return service;
}

const service = inertService();
const context = {
  console: console,
  PropertiesService: service,
  CacheService: service,
  Utilities: service,
  SpreadsheetApp: service,
  DriveApp: service,
  UrlFetchApp: service,
  ScriptApp: service,
  HtmlService: service,
  ContentService: service,
  LockService: service,
  Session: service,
  Jdbc: service,
  Logger: console,
  Date: Date,
  JSON: JSON,
  Math: Math,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  Boolean: Boolean,
  RegExp: RegExp,
  Map: Map,
  Set: Set,
  Promise: Promise,
  Error: Error,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN
};
vm.createContext(context);

orderedFiles.forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  if (file === 'Company_TopChemical_Actions.js') {
    assert.strictEqual(
      vm.runInContext('_companiesInitialized_', context),
      false,
      'an early policy lookup must not permanently complete company registration'
    );
    assert.deepStrictEqual(
      Array.from(vm.runInContext('Object.keys(COMPANY_REGISTRY)', context)),
      [],
      'an incomplete registration set must not be published'
    );
  }
});

const registered = JSON.parse(vm.runInContext(
  'ensureCompaniesRegistered_(); JSON.stringify(Object.keys(COMPANY_REGISTRY).sort().map(function (key) {' +
    'var company = COMPANY_REGISTRY[key]; return { key: key, main: company.pages[0].action };' +
  '}))',
  context
));

assert.deepStrictEqual(registered, [
  { key: '32fafd256ccb7a1c', main: 'ac_dashboard' },
  { key: '37fc50edf1424abd', main: 'et_dashboard' },
  { key: '3fe1b5cb67b7223e', main: 'tc_dashboard' },
  { key: '8df5c89a117fe9a5', main: 'tl_dashboard' },
  { key: '9940659bd83035d7', main: 'vf_dashboard' }
]);
assert.strictEqual(vm.runInContext('_companiesInitialized_', context), true);

const dashboardCompanies = JSON.parse(vm.runInContext(
  'getAllRecords_ = function () { return [' +
    "{company_unique_id:'32fafd256ccb7a1c',company_name_en:'Assessment'}," +
    "{company_unique_id:'37fc50edf1424abd',company_name_en:'Testing System'}," +
    "{company_unique_id:'3fe1b5cb67b7223e',company_name_en:'Top Chemical'}," +
    "{company_unique_id:'8df5c89a117fe9a5',company_name_en:'Top Light'}," +
    "{company_unique_id:'9940659bd83035d7',company_name_en:'Valley Foods'}" +
  ']; }; JSON.stringify(getDashboardData_({}, "", {isSuperAdmin:true, company:""}).companies)',
  context
));
assert.deepStrictEqual(
  dashboardCompanies.map(function (company) { return [company.unique_id, company.is_ready, company.main_page]; }),
  [
    ['32fafd256ccb7a1c', true, 'ac_dashboard'],
    ['37fc50edf1424abd', true, 'et_dashboard'],
    ['3fe1b5cb67b7223e', true, 'tc_dashboard'],
    ['8df5c89a117fe9a5', true, 'tl_dashboard'],
    ['9940659bd83035d7', true, 'vf_dashboard']
  ],
  'the main dashboard must expose every registered company as ready and navigable'
);

console.log('Company registry bootstrap: OK');
