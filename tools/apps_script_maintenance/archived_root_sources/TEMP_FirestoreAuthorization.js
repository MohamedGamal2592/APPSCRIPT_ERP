/**
 * TEMPORARY: run once from the Apps Script editor, then delete this file.
 * Running it prompts the deploying account for any missing OAuth scopes and
 * performs the existing read-only Firestore configuration preflight.
 */
function authorizeFirestoreAccess() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/datastore'
  ]);

  var config = getSystemStorageConfig_();
  var token = ScriptApp.getOAuthToken();
  var tokenInfoResponse = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true }
  );
  var tokenInfo = {};
  try { tokenInfo = JSON.parse(tokenInfoResponse.getContentText() || '{}'); } catch (ignore) {}
  var scopes = String(tokenInfo.scope || '').split(/\s+/).filter(Boolean);

  var url = firestoreDocumentsBaseUrl_(config, 'erp_preflight_probe') + '?pageSize=1';
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token }
  });
  var status = response.getResponseCode();
  var responseText = String(response.getContentText() || '').slice(0, 1000);
  var result = {
    ok: status >= 200 && status < 300,
    httpStatus: status,
    tokenEmail: tokenInfo.email || '',
    hasDatastoreScope: scopes.indexOf('https://www.googleapis.com/auth/datastore') !== -1,
    response: responseText
  };
  console.log(JSON.stringify(result));

  if (!result.ok) throw new Error('FIRESTORE_HTTP_' + status + ': ' + (responseText || 'Empty response'));
  return result;
}
