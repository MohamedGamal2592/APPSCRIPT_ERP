/** Offline contract checks for the Firestore REST adapter. */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const requests = [];
const responses = [];
const sleeps = [];
const sandbox = {
  console,
  ScriptApp: { getOAuthToken: () => 'test-token' },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(String(value), 'utf8').digest()),
    getUuid: () => 'fixed-uuid',
    sleep: (milliseconds) => sleeps.push(milliseconds)
  },
  UrlFetchApp: {
    fetch: (url, request) => {
      requests.push({ url, request });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return {
        getResponseCode: () => next.status,
        getContentText: () => next.body === undefined ? '' : JSON.stringify(next.body),
        getAllHeaders: () => next.headers || {}
      };
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, '02_Firestore.js'), 'utf8'), sandbox, { filename: '02_Firestore.js' });

const config = { projectId: 'erp-test', databaseId: '(default)' };
const encoded = sandbox.firestoreEncodeValue_({
  blank: '', zero: 0, flag: false, none: null,
  when: new Date('2026-01-02T03:04:05.000Z'),
  list: [1.5, 'x'], nested: { ok: true }
});
assert.strictEqual(encoded.mapValue.fields.blank.stringValue, '');
assert.strictEqual(encoded.mapValue.fields.zero.integerValue, '0');
assert.strictEqual(encoded.mapValue.fields.flag.booleanValue, false);
assert.strictEqual(encoded.mapValue.fields.none.nullValue, null);
assert.strictEqual(encoded.mapValue.fields.when.timestampValue, '2026-01-02T03:04:05.000Z');
const decoded = sandbox.firestoreDecodeValue_(encoded);
assert.strictEqual(decoded.zero, 0);
assert.strictEqual(decoded.flag, false);
assert.strictEqual(decoded.blank, '');
assert.strictEqual(decoded.when.toISOString(), '2026-01-02T03:04:05.000Z');
assert.strictEqual(decoded.nested.ok, true);

assert.strictEqual(sandbox.firestoreQuoteFieldPath_('simple_name'), 'simple_name');
assert.strictEqual(sandbox.firestoreQuoteFieldPath_('If shipping via CIF, enter the insurance value.'), '`If shipping via CIF, enter the insurance value.`');
assert.strictEqual(sandbox.firestoreQuoteFieldPath_('a`b'), '`a``b`');

responses.push({ status: 503, body: { error: { status: 'UNAVAILABLE', message: 'retry' } } });
responses.push({ status: 200, body: { ok: true } });
assert.strictEqual(sandbox.firestoreRequest_('get', 'https://example.test/retry', null, { maxRetries: 1 }).ok, true);
assert.strictEqual(requests.length, 2);

responses.push({ status: 429, headers: { 'Retry-After': '3' } });
responses.push({ status: 200, body: { ok: true } });
const callsBefore429 = requests.length;
assert.strictEqual(sandbox.firestoreRequest_('get', 'https://example.test/throttled', null, { maxRetries: 1 }).ok, true);
assert.strictEqual(requests.length, callsBefore429 + 2);
assert.ok(sleeps[sleeps.length - 1] >= 3000, '429 retry honors Retry-After');

responses.push({ status: 200, body: { writeResults: [{ updateTime: '2026-01-02T03:04:05.000Z' }, { updateTime: '2026-01-02T03:04:05.000Z' }] } });
const callsBeforeBatch = requests.length;
const createdBatch = sandbox.firestoreCreateDocuments_(config, 'ERP_Test', [
  { operationId: 'audit:a', record: { status: 'first' } },
  { operationId: 'audit:b', record: { status: 'second' } }
]);
assert.strictEqual(createdBatch.length, 2);
assert.strictEqual(requests.length, callsBeforeBatch + 1, 'batch create uses one HTTP request');
assert.strictEqual(JSON.parse(requests[requests.length - 1].request.payload).writes.length, 2);

responses.push({ status: 200, body: [
  { document: { name: 'projects/erp-test/databases/(default)/documents/ERP_Test/a', fields: { status: { stringValue: 'active' } } } },
  { document: { name: 'projects/erp-test/databases/(default)/documents/ERP_Test/b', fields: { status: { stringValue: 'active' } } } }
] });
const query = sandbox.firestoreQueryDocuments_(config, 'ERP_Test', {
  filters: [{ field: 'status', value: 'active' }],
  orderBy: [{ field: 'status', direction: 'ASCENDING' }],
  limit: 2,
  cursor: JSON.stringify({ values: [{ stringValue: 'previous' }, { referenceValue: 'old-doc' }] })
});
assert.strictEqual(query.records.length, 2);
const queryBody = JSON.parse(requests[requests.length - 1].request.payload);
assert.strictEqual(queryBody.structuredQuery.orderBy[0].field.fieldPath, 'status');
assert.strictEqual(queryBody.structuredQuery.orderBy[1].field.fieldPath, '__name__');
assert.ok(queryBody.structuredQuery.startAt);
assert.strictEqual(query.nextCursor !== null, true);

responses.push({ status: 200, body: { name: 'projects/erp-test/databases/(default)/documents/ERP_Test/a', fields: { status: { stringValue: 'closed' } }, updateTime: '2026-01-02T03:04:05.000Z' } });
const patched = sandbox.firestorePatchDocument_(config, 'ERP_Test', 'a', { status: 'closed' }, { expectedUpdateTime: '2026-01-02T00:00:00.000Z' });
assert.strictEqual(patched.data.status, 'closed');
assert.ok(requests[requests.length - 1].url.includes('updateMask.fieldPaths=status'));
assert.ok(requests[requests.length - 1].url.includes('currentDocument.updateTime='));

console.log('Firestore storage contract: typed values, exact paths, retries, pagination and preconditions pass.');
