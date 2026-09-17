/**
 * Theme_Builders.js
 * RESPONSIBILITY: company theme markup and CSS builders extracted from the
 * security/authentication module. Function names and output remain global
 * because Code.js and the preview/runtime callers use those contracts.
 * Dependencies are the existing CONFIG, CacheService, getSheet_ and helpers.
 */
// ==========================================
// Per-company theme CSS (versioned cache)
// ==========================================
function themeSystemRowsCompat_(tableName) {
  if (typeof systemGetAllRecords_ === 'function') return systemGetAllRecords_(tableName);
  if (typeof getAllRecords_ === 'function') return getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, tableName);
  return [];
}
function themeSystemFindCompat_(tableName, fieldName, value) {
  if (typeof systemFindByBusinessKey_ === 'function') return systemFindByBusinessKey_(tableName, fieldName, value);
  const wanted = String(value == null ? '' : value).trim().toLowerCase();
  return themeSystemRowsCompat_(tableName).find(function (row) {
    return String(row[fieldName] == null ? '' : row[fieldName]).trim().toLowerCase() === wanted;
  }) || null;
}
/** Brand gradient for standalone block pages (access-denied etc.). */
function getCompanyBlockTheme_(companyUid) {
  const uid = String(companyUid || '').trim().toLowerCase();
  if (uid === '8df5c89a117fe9a5') return { from: '#b45309', to: '#f59e0b' };   // Top Light amber
  if (uid === '3fe1b5cb67b7223e') return { from: '#15803d', to: '#22c55e' };   // Top Chemical green
  let theme = { from: '#054719', to: '#16a34a' };                              // Valley Foods / default green
  try {
    if (uid) {
      const row = themeSystemFindCompat_('ERP_Companies', 'company_unique_id', uid);
      const gradMap = { red: ['#7f1d1d', '#dc2626'], green: ['#054719', '#16a34a'], yellow: ['#b45309', '#f59e0b'], black: ['#111827', '#374151'] };
      const first = String(row && row.company_colors || '').toLowerCase().split(',').map(c => c.trim())[0];
      if (gradMap[first]) theme = { from: gradMap[first][0], to: gradMap[first][1] };
    }
  } catch (e) { /* keep default */ }
  return theme;
}

function getCompanyThemeCSS_(companyName) {
  if (String(companyName || '').trim().toLowerCase() === '8df5c89a117fe9a5') {
    return topLightThemeCss_();
  }
  if (String(companyName || '').trim().toLowerCase() === '3fe1b5cb67b7223e') {
    return topChemicalThemeCss_();
  }

  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'theme_v_' + compVersion + '_' + (companyName || '__default__');
  try {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  } catch (cacheErr) {}

  // ValleyFoods' generic theme has always been the green default. Keep that
  // default available to the offline preview and to an empty company lookup;
  // configured company_colors still overrides it below.
  let primaryColor = 'green'; let bgColor = 'white';
  try {
    if (companyName) {
      const wanted = String(companyName).trim().toLowerCase();
      const companyRow = themeSystemRowsCompat_('ERP_Companies').find(function (r) { return [r.company_unique_id, r.company_name_ar, r.company_name_en].some(function (v) { return String(v || '').trim().toLowerCase() === wanted; }); });
      if (companyRow) {
        const colorsArr = String(companyRow.company_colors || '').toLowerCase().split(',').map(c => c.trim());
        if (colorsArr.length > 0 && ['red', 'green', 'yellow', 'black', 'white'].includes(colorsArr[0])) primaryColor = colorsArr[0];
        if (colorsArr.length > 1 && ['red', 'green', 'yellow', 'black', 'white'].includes(colorsArr[1])) bgColor = colorsArr[1];
      }
    }
  } catch (e) { console.error('Theme Error: ' + e.message); }

  const primaryMap = {
    red: { p: '#D62828', h: '#B91C1C', sb: '#FEF2F2', b: '#FECACA', t: '#FFFFFF' },
    green: { p: '#16A34A', h: '#15803D', sb: '#F0FDF4', b: '#BBF7D0', t: '#FFFFFF' },
    yellow: { p: '#D97706', h: '#B45309', sb: '#FFFBEB', b: '#FDE68A', t: '#111827' },
    black: { p: '#111827', h: '#1F2937', sb: '#F3F4F6', b: '#E5E7EB', t: '#FFFFFF' },
    white: { p: '#FFFFFF', h: '#F9FAFB', sb: '#F9FAFB', b: '#E5E7EB', t: '#111827' }
  };
  const pc = primaryMap[primaryColor];
  let css = "<style>\n:root {\n";
  css += '  --brand-primary: ' + pc.p + ';\n';
  css += '  --brand-primary-hover: ' + pc.h + ';\n';
  css += '  --brand-subtle-bg: ' + pc.sb + ';\n';
  css += '  --brand-border: ' + pc.b + ';\n';
  css += '  --btn-text-color: ' + pc.t + ';\n';
  /* [UI-2.6 / D-1 / D-2 / U-10] The light branch no longer overrides the canvas,
     surfaces, borders or ink. It used to re-state the OLD values of those tokens
     (#F9FAFB / #F3F4F6 / #6B7280 / #E5E7EB), which would have silently undone
     the whole of Phase 2.1 for every company on this generic path — including
     ValleyFoods. They now come from CSS_Tokens.html like everyone else.

     The dark branch is left intact. It is a data-driven option a company can
     select through `company_colors`, it is not the coloured-canvas problem D-2
     is about, and a proper dark mode is Phase 8. Since no data may be read or
     written by this programme there is no way to know whether a company is
     configured this way, so it is not touched. */
  if (bgColor === 'black') {
    css += '  --bg-primary: #0F172A;\n  --bg-canvas: #0F172A;\n  --bg-surface: #1E293B;\n  --bg-subtle: #334155;\n  --text-main: #F8FAFC;\n  --text-muted: #94A3B8;\n  --border-color: #334155;\n';
  }
  css += '}\n';

  /* [UI-2.6] The brand topbar, which this path never had.
     ValleyFoods takes this path, so its topbar rendered in --bg-surface: a
     white bar with grey links, indistinguishable from the page. The two bespoke
     companies each hand-wrote a topbar; this gives every other company the same
     treatment, expressed in TOKENS so it adapts to whichever colour the company
     is configured with rather than hardcoding green. A company on 'white' or
     'yellow' gets dark ink automatically, because --btn-text-color already
     carries the readable ink for its primary colour. */
  if (bgColor !== 'black') {
    css += '.topbar { background: var(--brand-primary); border-bottom: 1px solid var(--brand-primary); }\n';
    css += '.topbar .nav-item, .topbar .nav-dropdown-toggle { color: var(--btn-text-color); }\n';
    css += '.topbar .nav-item:hover, .topbar .nav-item.active,\n';
    css += '.topbar .nav-dropdown-toggle:hover, .topbar .nav-dropdown-toggle.open { color: var(--brand-primary); background: var(--btn-text-color); }\n';
    /* The shared .user-name rule is --text-main, which is near-invisible on a
       saturated topbar. Same reason TopLight and TopChemical carry this. */
    css += '.topbar .user-profile-toggle { border: 1px solid var(--btn-text-color); border-radius: 999px; padding: 4px 12px; }\n';
    css += '.topbar .user-profile-toggle .user-name, .topbar .user-profile-toggle .nav-dropdown-caret { color: var(--btn-text-color); }\n';
    css += '.topbar .user-profile-toggle:hover, .topbar .user-profile-toggle.open { background: var(--btn-text-color); }\n';
    css += '.topbar .user-profile-toggle:hover .user-name, .topbar .user-profile-toggle.open .user-name,\n';
    css += '.topbar .user-profile-toggle:hover .nav-dropdown-caret, .topbar .user-profile-toggle.open .nav-dropdown-caret { color: var(--brand-primary); }\n';
    css += '.topbar .user-avatar { background: var(--btn-text-color); color: var(--brand-primary); }\n';
    /* Hamburger bars default to --text-main and would vanish on the topbar. */
    css += '.topbar-hamburger { border: 1px solid var(--btn-text-color); }\n';
    css += '.topbar-hamburger .hamburger-bar { background: var(--btn-text-color); }\n';
    css += '.invoice { background: #ffffff; border: 1px solid var(--border-color); }\n';
  }
  css += '</style>\n';
  try { cache.put(cacheKey, css, CONFIG.CACHE_THEME_SECONDS); } catch (putErr) {}
  return css;
}

// Bespoke Top Light theme (company uid 8df5c89a117fe9a5). Uncached so edits apply
// immediately. Overrides tokens + adds structural + print rules.
function topLightThemeCss_() {
  return '' +
    '<style>\n' +
    ':root {\n' +
    /* [UI-2.4 / D-1 / U-10] Canvas, surfaces, borders and ink are NO LONGER
       overridden here. They come from CSS_Tokens.html, so all three companies
       share one neutral canvas and one hairline border, and TopLight is
       identified by its topbar and its buttons rather than by painting the
       whole page amber. What stays below is brand and semantics only. */
    '  --font-sans: \'Cairo\', sans-serif;\n' +
    '  --font-mono: \'Consolas\', \'Courier New\', monospace;\n' +
    '  --success: #16a34a;\n' +
    '  --success-bg: #f0fdf4;\n' +
    '  --success-text: #16a34a;\n' +
    '  --success-border: #bbf7d0;\n' +
    '  --warning: #c2410c;\n' +
    '  --warning-bg: #fff7ed;\n' +
    '  --warning-text: #c2410c;\n' +
    '  --warning-border: #fed7aa;\n' +
    '  --danger: #b91c1c;\n' +
    '  --danger-bg: #fef2f2;\n' +
    '  --danger-text: #b91c1c;\n' +
    '  --danger-border: #fecaca;\n' +
    '  --info: #0369a1;\n' +
    '  --amber: #b45309;\n' +
    '  --brand-primary: #111111;\n' +
    '  --brand-primary-hover: #000000;\n' +
    '  --brand-subtle-bg: #fef08a;\n' +
    '  --brand-border: #111111;\n' +
    '  --btn-text-color: #fbbf24;\n' +
    '  --shadow-brand: 0 4px 14px rgba(17, 17, 17, 0.25);\n' +
    '}\n' +
    /* The brand topbar: black with amber ink. This, the primary button and the
       row-hover tint are where the brand lives now. */
    '.topbar { background: #111111; border-bottom: 1px solid #111111; }\n' +
    '.topbar .nav-item { color: #fbbf24; }\n' +
    '.topbar .nav-item:hover, .topbar .nav-item.active { color: #111111; background: #fbbf24; }\n' +
    '/* TopLight dropdowns: curved black fill, yellow ink + black-on-yellow hover — always apparent.\n' +
    '   Scoped to .topbar so a dropdown rendered in page content keeps the neutral surface. */\n' +
    '.topbar .nav-dropdown-menu {\n' +
    '  background: #111111;\n' +
    '  border: 1px solid #fbbf24;\n' +
    '  border-radius: 16px;\n' +
    '  box-shadow: 0 12px 28px rgba(0,0,0,.45);\n' +
    '}\n' +
    '.topbar .nav-dropdown-toggle { color: #fbbf24; }\n' +
    '.topbar .nav-dropdown-toggle:hover, .topbar .nav-dropdown-toggle.open { color: #111111; background: #fbbf24; }\n' +
    '/* Profile toggle must read without hovering: pill button + yellow name (the .user-name\n' +
    '   rule would otherwise paint it near-black on the black topbar) */\n' +
    '.topbar .user-profile-toggle { border: 1px solid #fbbf24; border-radius: 999px; padding: 4px 12px; background: #111111; }\n' +
    '.topbar .user-profile-toggle .user-name { color: #fbbf24; }\n' +
    '.topbar .user-profile-toggle .nav-dropdown-caret { color: #fbbf24; }\n' +
    '.topbar .user-profile-toggle:hover, .topbar .user-profile-toggle.open { background: #fbbf24; }\n' +
    '.topbar .user-profile-toggle:hover .user-name, .topbar .user-profile-toggle.open .user-name,\n' +
    '.topbar .user-profile-toggle:hover .nav-dropdown-caret, .topbar .user-profile-toggle.open .nav-dropdown-caret { color: #111111; }\n' +
    '.topbar .nav-dropdown-item { color: #fbbf24; font-weight: 700; border-radius: 10px; }\n' +
    '.topbar .nav-dropdown-item:hover { background: #fbbf24; color: #111111; }\n' +
    '.topbar .nav-dropdown-item-active { background: #fbbf24; color: #111111; font-weight: 800; }\n' +
    '.topbar .user-avatar { background: #fbbf24; color: #111111; }\n' +
    '.topbar .user-profile-name { color: #fbbf24; }\n' +
    '.topbar .user-profile-email { color: #fde68a; }\n' +
    '.topbar .user-profile-divider { background: #fbbf24; opacity: .4; }\n' +
    '.topbar .user-profile-logout { color: #fbbf24; }\n' +
    '.topbar .user-profile-logout:hover { background: #fbbf24; color: #111111; }\n' +
    '/* Mobile hamburger: black bars are invisible on the black topbar — yellow instead */\n' +
    '.topbar-hamburger { border: 1px solid #fbbf24; }\n' +
    '.topbar-hamburger .hamburger-bar { background: #fbbf24; }\n' +
    /* Documents keep a visible frame, but a hairline one rather than 2px black. */
    '.invoice { background: #ffffff; border: 1px solid var(--border-color); }\n' +
    /* [UI-7.2 / U-34] The blanket universal print-color-adjust:exact rule is
       gone. It forced the browser to render EVERY background, so this
       company's table header printed as a solid bar and a multi-page report
       cost a cartridge of toner. UI_Components.html now applies print colour
       deliberately, to the document header rule and the totals row only. */
    '</style>\n';
}


// Bespoke Top Chemical theme (company uid 3fe1b5cb67b7223e) — green/white.
// Uncached so edits apply immediately. Overrides tokens + adds structural +
// print rules.
function topChemicalThemeCss_() {
  return '' +
    '<style>\n' +
    ':root {\n' +
    /* [UI-2.5 / D-1 / U-10] Same treatment as TopLight: canvas, surfaces,
       borders and ink now come from CSS_Tokens.html. The page stops being
       painted green; the brand lives in the topbar and the buttons. */
    '  --font-sans: \'Cairo\', sans-serif;\n' +
    '  --font-mono: \'Consolas\', \'Courier New\', monospace;\n' +
    '  --success: #16a34a;\n' +
    '  --success-bg: #f0fdf4;\n' +
    '  --success-text: #16a34a;\n' +
    '  --success-border: #bbf7d0;\n' +
    '  --warning: #b45309;\n' +
    '  --warning-bg: #fffbeb;\n' +
    '  --warning-text: #b45309;\n' +
    '  --warning-border: #fde68a;\n' +
    '  --danger: #b91c1c;\n' +
    '  --danger-bg: #fef2f2;\n' +
    '  --danger-text: #b91c1c;\n' +
    '  --danger-border: #fecaca;\n' +
    '  --info: #0369a1;\n' +
    '  --amber: #b45309;\n' +
    '  --brand-primary: #16a34a;\n' +
    '  --brand-primary-hover: #15803d;\n' +
    '  --brand-subtle-bg: #dcfce7;\n' +
    '  --brand-border: #16a34a;\n' +
    '  --btn-text-color: #ffffff;\n' +
    '  --shadow-brand: 0 4px 14px rgba(22, 163, 74, 0.25);\n' +
    '}\n' +
    /* The brand topbar: green with white ink. */
    '.topbar { background: #15803d; border-bottom: 1px solid #14532d; }\n' +
    '.topbar .nav-item { color: #ffffff; }\n' +
    '.topbar .nav-item:hover, .topbar .nav-item.active { color: #15803d; background: #ffffff; }\n' +
    '.topbar .nav-dropdown-toggle { color: #ffffff; }\n' +
    '.topbar .nav-dropdown-toggle:hover, .topbar .nav-dropdown-toggle.open { color: #15803d; background: #ffffff; }\n' +
    '.topbar .nav-dropdown-menu { background: #ffffff; border: 1px solid var(--border-color); }\n' +
    '.topbar .nav-dropdown-item:hover { background: #dcfce7; color: #15803d; }\n' +
    '/* Profile toggle must read without hovering: the shared .user-name rule\n' +
    '   would otherwise paint it near-black on the green topbar. */\n' +
    '.topbar .user-profile-toggle { border: 1px solid #ffffff; border-radius: 999px; padding: 4px 12px; }\n' +
    '.topbar .user-profile-toggle .user-name { color: #ffffff; }\n' +
    '.topbar .user-profile-toggle .nav-dropdown-caret { color: #ffffff; }\n' +
    '.topbar .user-profile-toggle:hover, .topbar .user-profile-toggle.open { background: #ffffff; }\n' +
    '.topbar .user-profile-toggle:hover .user-name, .topbar .user-profile-toggle.open .user-name,\n' +
    '.topbar .user-profile-toggle:hover .nav-dropdown-caret, .topbar .user-profile-toggle.open .nav-dropdown-caret { color: #15803d; }\n' +
    '.topbar .user-avatar { background: #ffffff; color: #15803d; }\n' +
    '/* Mobile hamburger: dark bars are invisible on the green topbar. */\n' +
    '.topbar-hamburger { border: 1px solid #ffffff; }\n' +
    '.topbar-hamburger .hamburger-bar { background: #ffffff; }\n' +
    /* Buttons keep the darker green they already used. */
    '.btn-primary { background: #15803d; box-shadow: 0 4px 14px rgba(20, 83, 45, 0.3); }\n' +
    '.btn-primary:hover { background: #14532d; box-shadow: 0 6px 16px rgba(20, 83, 45, 0.35); }\n' +
    '.btn-outline:hover { background: #dcfce7; border-color: #15803d; color: #14532d; }\n' +
    /* Documents keep a visible frame, but a hairline one rather than 2px green. */
    '.invoice { background: #ffffff; border: 1px solid var(--border-color); }\n' +
    /* [UI-7.2 / U-34] The blanket universal print-color-adjust:exact rule is
       gone. It forced the browser to render EVERY background, so this
       company's table header printed as a solid bar and a multi-page report
       cost a cartridge of toner. UI_Components.html now applies print colour
       deliberately, to the document header rule and the totals row only. */
    '</style>\n';
}


