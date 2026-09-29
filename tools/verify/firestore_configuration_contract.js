/** Offline configuration, preflight and router-safety checks. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..', '..');
let props = {};
let requests = 0;
let scriptId = 'unconfigured-script';
let lastRequestUrl = '';
const sandbox = {
  CONFIG: {
    SYSTEM_STORAGE_BACKEND: 'firestore',
    FIRESTORE_PROJECT_IDS_BY_SCRIPT: { 'linked-production-script': 'erp-project-3cae0' },
    FIRESTORE_DATABASE_ID: '(default)',
    ERP_ENVIRONMENT: 'production'
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key] === undefined ? null : props[key] }) },
  ScriptApp: { getOAuthToken: () => 'test-token', getScriptId: () => scriptId },
  UrlFetchApp: { fetch: url => { requests++; lastRequestUrl = url; return { getResponseCode: () => 200, getContentText: () => '' }; } },
  Utilities: { getUuid: () => 'id', sleep: () => {} }, console
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'Code.js'), 'utf8'), sandbox);
/* Code.js owns the canonical CONFIG binding now. Re-apply the fixture's
   linked-script map after loading it so this contract exercises the same
   explicit configuration as the pre-consolidation test. */
vm.runInContext("CONFIG.FIRESTORE_PROJECT_IDS_BY_SCRIPT = {'linked-production-script':'erp-project-3cae0'}; CONFIG.SYSTEM_STORAGE_BACKEND = 'firestore'; CONFIG.FIRESTORE_DATABASE_ID = '(default)'; CONFIG.ERP_ENVIRONMENT = 'production';", sandbox);
function throwsCode(fn, code) { assert.throws(fn, e => e.code === code, code); }
props = { SYSTEM_STORAGE_BACKEND: 'firestore', FIRESTORE_PROJECT_ID: '', FIRESTORE_DATABASE_ID: '(default)', ERP_ENVIRONMENT: 'staging' };
throwsCode(() => sandbox.getSystemStorageConfig_(), 'STORAGE_CONFIGURATION_ERROR');
assert.strictEqual(sandbox.firestoreConfigurationPreflight_().code, 'STORAGE_CONFIGURATION_ERROR');
assert.strictEqual(requests, 0, 'configuration failure must not call Firestore');
scriptId = 'linked-production-script';
assert.strictEqual(sandbox.getSystemStorageConfig_().projectId, 'erp-project-3cae0', 'the linked script may use its pinned Firestore project');
assert.strictEqual(sandbox.firestoreConfigurationPreflight_().ok, true);
assert.ok(lastRequestUrl.includes('/documents/erp_preflight_probe?pageSize=1'), 'preflight must use a non-reserved collection id');
scriptId = 'unconfigured-script';
props.FIRESTORE_PROJECT_ID = '  erp-project-3cae0  ';
assert.strictEqual(JSON.stringify(sandbox.getSystemStorageConfig_()), JSON.stringify({ backend: 'firestore', projectId: 'erp-project-3cae0', databaseId: '(default)', environment: 'staging' }));
props.SYSTEM_STORAGE_BACKEND = 'bogus'; throwsCode(() => sandbox.getSystemStorageConfig_(), 'STORAGE_BACKEND_ERROR');
props.SYSTEM_STORAGE_BACKEND = 'firestore'; props.FIRESTORE_DATABASE_ID = 'bad/name'; throwsCode(() => sandbox.getSystemStorageConfig_(), 'STORAGE_CONFIGURATION_ERROR');
props.FIRESTORE_DATABASE_ID = '(default)'; props.ERP_ENVIRONMENT = 'qa'; throwsCode(() => sandbox.getSystemStorageConfig_(), 'STORAGE_CONFIGURATION_ERROR');
sandbox.PropertiesService.getScriptProperties = () => { throw new Error('denied'); };
throwsCode(() => sandbox.getSystemStorageConfig_(), 'STORAGE_PROPERTY_ACCESS_ERROR');
const code = fs.readFileSync(path.join(root, 'Code.js'), 'utf8');
assert.ok(/function logSystemAction_\([\s\S]*?try \{/.test(code));
assert.ok(code.includes('System logging disabled:'));
assert.ok(code.includes('return { status: \'error\', message: err.message };'));
const telemetry = fs.readFileSync(path.join(root, 'Code.js'), 'utf8');
assert.ok(telemetry.includes('function perfRecordRequest_') && telemetry.includes('never the reason a request fails'));
assert.ok(!/firestoreConfigurationPreflight_.*ROUTES/.test(code));
console.log('Firestore configuration contract: property errors, validation, bounded preflight guard and router-safe secondary reporting pass.');
