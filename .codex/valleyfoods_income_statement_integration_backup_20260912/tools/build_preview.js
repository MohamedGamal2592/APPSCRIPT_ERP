/**
 * build_preview.js — regenerate design_preview/_sources.js
 *
 *     node tools/build_preview.js
 *
 * WHY A GENERATED BUNDLE
 * ----------------------
 * The design preview must show the REAL CSS_Tokens.html, the REAL
 * UI_Components.html and the REAL theme CSS from Theme_Builders.js. A hand-written
 * copy of those would drift and become a lie — worse than no preview at all.
 *
 * A browser opened on a file:// page refuses to read its neighbouring files, so
 * the preview cannot simply fetch them when the owner double-clicks it. Instead
 * this script extracts them into one bundle, stamps a fingerprint over the
 * source bytes, and tools/ui_check.js check C9 FAILS whenever that fingerprint
 * no longer matches the sources. The preview therefore cannot silently drift:
 * either it is current, or the suite says so out loud.
 *
 * The three theme functions are not copied either — they are EXECUTED here,
 * against stubs, so the preview shows what the server would really emit. No
 * spreadsheet is opened and no Google service is contacted; the stubs return
 * fixed values.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const S = require('./lib/sources');

/* Files whose bytes the preview claims to be showing. */
const WATCHED = ['CSS_Tokens.html', 'UI_Components.html', 'Client_Helpers.html', '03_Security.js', 'Theme_Builders.js'];

const OUT = path.join(S.ROOT, 'design_preview', '_sources.js');

/** A hash over the exact bytes of every file the preview reproduces. */
function fingerprint() {
  const h = crypto.createHash('sha256');
  WATCHED.forEach(function (f) {
    h.update(f);
    h.update(fs.readFileSync(path.join(S.ROOT, f)));
  });
  return h.digest('hex').slice(0, 16);
}

/* ── Executing 03_Security.js's theme functions against stubs ───────────── */

/** A fake ERP_Companies sheet, so the generic theme path runs for real. */
function fakeCompaniesSheet(colors) {
  const rows = [
    ['company_unique_id', 'company_name_ar', 'company_name_en', 'company_colors'],
    ['vf-uid', 'فالي فودز', 'ValleyFoods', colors]
  ];
  return {
    getDataRange: function () { return { getValues: function () { return rows; } }; },
    getLastRow: function () { return rows.length; },
    getLastColumn: function () { return rows[0].length; },
    getRange: function () { return { getValues: function () { return rows; } }; }
  };
}

function themeSandbox(colors) {
  const sandbox = {
    console: { log: function () {}, error: function () {}, warn: function () {} },
    JSON: JSON, Math: Math, Date: Date, String: String, Number: Number,
    Array: Array, Object: Object, RegExp: RegExp, Error: Error, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent, Promise: Promise,
    CONFIG: { AUTH_SPREADSHEET_ID: 'stub', CACHE_THEME_SECONDS: 60 },
    /* Every Google service the file may reference, inert. */
    CacheService: { getScriptCache: function () { return { get: function () { return null; }, put: function () {}, remove: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; } },
    SpreadsheetApp: { openById: function () { return { getSheetByName: function () { return null; } }; }, flush: function () {} },
    Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; }, getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: {
      getUuid: function () { return 'stub-uuid'; },
      formatDate: function () { return '2026-01-01'; },
      sleep: function () {},
      computeDigest: function () { return [0]; },
      DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
      base64Encode: function (s) { return Buffer.from(String(s)).toString('base64'); },
      Charset: { UTF_8: 'UTF_8' }
    },
    Logger: { log: function () {} },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    ScriptApp: { getService: function () { return { getUrl: function () { return ''; } }; }, newTrigger: function () { throw new Error('blocked'); } },
    UrlFetchApp: { fetch: function () { throw new Error('blocked'); } },
    HtmlService: { createTemplate: function () { return { evaluate: function () { return {}; } }; } },
    DriveApp: {}, MailApp: {}, GmailApp: {},
    /* Data-layer helpers 03_Security.js calls. */
    getSheet_: function (name) {
      if (String(name) === 'ERP_Companies') return fakeCompaniesSheet(colors);
      return fakeCompaniesSheet(colors);
    },
    getHeaders_: function (sheet) { return sheet.getDataRange().getValues()[0]; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function extractThemes() {
  const src = S.read('03_Security.js') + '\n' + S.read('Theme_Builders.js');
  const out = {};

  /* TopLight and TopChemical are pure string builders — no service calls. */
  const plain = themeSandbox('green,white');
  try {
    vm.runInContext(src, plain, { filename: 'Theme_Builders.js' });
  } catch (e) {
    throw new Error('could not load the security/theme sources into the stub sandbox: ' + e.message);
  }
  out.TopLight = plain.topLightThemeCss_();
  out.TopChemical = plain.topChemicalThemeCss_();

  /* ValleyFoods takes the generic path. Run it against the fake sheet so the
     preview shows the real mapping, not a guess at it. */
  out.ValleyFoods = plain.getCompanyThemeCSS_('ValleyFoods');

  return out;
}

/* ── Bundle ─────────────────────────────────────────────────────────────── */

/** Split a theme's returned markup into its <link> head and its CSS. */
function splitThemeMarkup(markup) {
  const links = (markup.match(/<link\b[^>]*>/gi) || []).join('\n');
  const css = S.styleBlocks(markup).join('\n');
  return { links: links, css: css };
}

function build() {
  const tokensSrc = S.read('CSS_Tokens.html');
  const tokens = {
    links: (tokensSrc.match(/<link\b[^>]*>/gi) || []).join('\n'),
    css: S.styleBlocks(tokensSrc).join('\n')
  };

  const componentsJs = S.scriptBlocks(S.read('UI_Components.html'))
    .map(b => S.stripScriptlets(b.body)).join('\n;\n');

  const helpersJs = S.scriptBlocks(S.read('Client_Helpers.html'))
    .map(b => S.stripScriptlets(b.body)).join('\n;\n');

  const themesRaw = extractThemes();
  const themes = {};
  Object.keys(themesRaw).forEach(k => { themes[k] = splitThemeMarkup(themesRaw[k]); });

  const payload = {
    generated: new Date().toISOString(),
    watched: WATCHED,
    tokens: tokens,
    componentsJs: componentsJs,
    helpersJs: helpersJs,
    themes: themes
  };

  const body =
    '/* GENERATED FILE — do not edit by hand.\n' +
    ' *\n' +
    ' * Produced by: node tools/build_preview.js\n' +
    ' * Contains the real bytes of: ' + WATCHED.join(', ') + '\n' +
    ' *\n' +
    ' * tools/ui_check.js check C9 fails while this file is out of date, so the\n' +
    ' * design preview can never quietly show something the source no longer says.\n' +
    ' */\n' +
    "window.__PREVIEW_FINGERPRINT__ = '" + fingerprint() + "';\n" +
    'window.__PREVIEW_SOURCES__ = ' + JSON.stringify(payload, null, 1) + ';\n';

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body, 'utf8');
  return { bytes: body.length, fingerprint: fingerprint() };
}

module.exports = { fingerprint: fingerprint, build: build, WATCHED: WATCHED };

if (require.main === module) {
  const r = build();
  console.log('design_preview/_sources.js written — ' + r.bytes + ' bytes, fingerprint ' + r.fingerprint);
  console.log('sources: ' + WATCHED.join(', '));
}



