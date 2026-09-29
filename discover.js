// Same discovery as etDiscover_, but (1) caps sample cells to 60 chars so giant
// JSON blobs can't bloat the log, and (2) prints the result in numbered chunks
// so Apps Script's per-entry log cap never truncates it. Read-only; writes nothing.
function etDiscoverChunked() {
  var ids = { erp_test: '1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE', top_light: '1xIGriBRv61Mvchv5xezQkxi7pnS64yH5ITwZrk3DjJ4' };
  var CAP = 60;
  var out = {};
  Object.keys(ids).forEach(function (k) {
    var ss = SpreadsheetApp.openById(ids[k]);
    out[k] = { title: ss.getName(), tz: ss.getSpreadsheetTimeZone(), sheets: [] };
    ss.getSheets().forEach(function (sh) {
      var lr = sh.getLastRow(), lc = sh.getLastColumn();
      var headers = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
      var probeRows = Math.min(Math.max(lr - 1, 0), 200);
      var formulaCols = {};
      if (probeRows && lc) {
        var f = sh.getRange(2, 1, probeRows, lc).getFormulas();
        for (var c = 0; c < lc; c++) {
          var n = 0, first = '';
          for (var r = 0; r < probeRows; r++) if (f[r][c]) { n++; if (!first) first = f[r][c]; }
          if (n) formulaCols[headers[c] || ('#' + (c + 1))] = { count: n, first: first };
        }
      }
      var sample = lr > 1 ? sh.getRange(2, 1, Math.min(2, lr - 1), lc).getDisplayValues() : [];
      sample = sample.map(function (row) { return row.map(function (v) { var s = String(v); return s.length > CAP ? s.slice(0, CAP) : s; }); });
      out[k].sheets.push({ name: sh.getName(), hidden: sh.isSheetHidden(), lastRow: lr, lastCol: lc, headers: headers, formulaCols: formulaCols, sample: sample });
    });
  });
  var boxes = SpreadsheetApp.openById(ids.erp_test).getSheetByName('erp_test_box_account_codes');
  out.erp_test_box_values = boxes ? boxes.getDataRange().getDisplayValues().slice(0, 50) : 'MISSING';

  var s = JSON.stringify(out);
  var CH = 7000;
  var parts = Math.ceil(s.length / CH);
  console.log('ETLEN=' + s.length + ' PARTS=' + parts);
  for (var i = 0; i < parts; i++) {
    console.log('##' + i + '##' + s.substring(i * CH, i * CH + CH));
  }
  console.log('##END##');
  return out;
}
