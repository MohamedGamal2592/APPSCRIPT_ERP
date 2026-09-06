/**
 * Shared source-reading helpers for the UI tooling.
 *
 * Both tools/ui_check.js and tools/build_preview.js read the SAME project files
 * through this module, so the static checker and the design preview can never
 * disagree about what the source actually says. Nothing here writes anything or
 * touches the network.
 *
 * Apps Script note: the .html files in this project are *templates*. They carry
 * `<?= x ?>` / `<?!= x ?>` / `<? ... ?>` scriptlets that are substituted on the
 * server before a browser ever sees them, so they are not valid JS or HTML until
 * that substitution has happened. Every reader here accounts for that.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/* The 14 MB legacy AppSheet export. Excluded from the deploy set by
 * .claspignore and excluded here for the same reason: it is an archive, not a
 * page. Reading it would dominate every run. */
const ARCHIVE = 'appsheet_old_project.html';

/** Every server-side .js file at the project root, in push order where known. */
function jsFiles() {
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.js'))
    .sort();
}

/** Every .html template at the project root, excluding the legacy archive. */
function htmlFiles() {
  return fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.html') && f !== ARCHIVE)
    .sort();
}

/** The shared layer — partials included by pages rather than routed to. */
const SHARED_PARTIALS = [
  'CSS_Tokens.html',
  'UI_Components.html',
  'Client_Helpers.html',
  'ERP_Flow.html',
  'ERP_Modal.html',
  'ERP_DataTable.html',
  'ERP_DataTable_JS.html',
  'Record_History_Panel.html'
];

/** Page templates: everything that is not a shared partial. */
function pageFiles() {
  return htmlFiles().filter(f => SHARED_PARTIALS.indexOf(f) === -1);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

/**
 * Bodies of every inline <script> block, with the 1-based line number each
 * block starts on so an error can point somewhere real.
 */
function scriptBlocks(src) {
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    /* Skip <script src="..."> with no body. */
    if (!m[1].trim()) continue;
    out.push({ body: m[1], line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** Bodies of every <style> block. */
function styleBlocks(src) {
  const re = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

/**
 * Replace Apps Script scriptlets with a harmless literal of the same shape so
 * the surrounding real JavaScript can still be parsed. `0` is used because it
 * is valid in every position a scriptlet appears in this project (rvalue,
 * argument, array element) and never introduces a statement.
 */
function stripScriptlets(js) {
  return js.replace(/<\?[\s\S]*?\?>/g, '0');
}

/**
 * CSS emitted from JavaScript. UI_Components.html builds most of its stylesheet
 * inside a template literal assigned to `const css = ` and injects it at
 * runtime, so a naive <style> scan misses ~450 lines of the real design system.
 */
function templateLiteralCss(src) {
  const out = [];
  const re = /(?:const|var|let)\s+\w*css\w*\s*=\s*`([\s\S]*?)`/gi;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  out.push.apply(out, concatenatedStringCss(src));
  return out;
}

/**
 * CSS assembled from quoted string literals joined with `+`.
 *
 * Both 03_Security.js's theme builders and UIC.HistorySide write their
 * stylesheets this way:
 *
 *     var css = '#history-side{position:fixed;…}' +
 *               '#history-side .hs-body{…}';
 *
 * A regex over the whole chain is unreliable once escapes are involved, so this
 * scans for quoted strings properly, groups runs of them that are joined only
 * by `+`, and keeps a group when the joined text actually looks like CSS. Used
 * by check C5, where missing these would report hundreds of styled classes as
 * undefined.
 */
function concatenatedStringCss(src) {
  const out = [];
  let i = 0;
  let group = null;

  const looksLikeCss = s => s.indexOf('{') !== -1 && s.indexOf('}') !== -1 && s.indexOf(':') !== -1;
  const flush = () => {
    if (group && looksLikeCss(group)) out.push(group);
    group = null;
  };

  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      /* Read the whole literal, honouring backslash escapes. */
      const quote = c;
      let j = i + 1;
      let text = '';
      while (j < src.length) {
        if (src[j] === '\\') {
          const next = src[j + 1];
          text += (next === 'n') ? '\n' : (next === 't') ? '\t' : next;
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        if (src[j] === '\n') { j = -1; break; }   /* unterminated — not a literal */
        text += src[j];
        j++;
      }
      if (j === -1 || j >= src.length) { i++; flush(); continue; }
      group = (group === null) ? text : group + text;
      i = j + 1;
      /* Continue the group only across whitespace then a single `+`. */
      let k = i;
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] === '+') {
        let n = k + 1;
        while (n < src.length && /\s/.test(src[n])) n++;
        if (src[n] === '"' || src[n] === "'") { i = n; continue; }
      }
      flush();
      continue;
    }
    /* Skip line comments and regex-ish noise cheaply: they cannot open a group. */
    i++;
  }
  flush();
  return out;
}

/** All CSS a file contributes, from <style> blocks and from JS string literals. */
function allCss(src) {
  return styleBlocks(src).concat(templateLiteralCss(src)).join('\n');
}

module.exports = {
  ROOT,
  ARCHIVE,
  SHARED_PARTIALS,
  jsFiles,
  htmlFiles,
  pageFiles,
  read,
  exists,
  scriptBlocks,
  styleBlocks,
  stripScriptlets,
  templateLiteralCss,
  allCss
};
