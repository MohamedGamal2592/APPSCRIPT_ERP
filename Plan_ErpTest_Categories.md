# Plan — التصنيفات (categories) page + nav regrouping for النظام التجريبي

Target executor: **MuseSpark 1.3 Free**. Follow the steps in order, do **not** improvise, do **not** run `clasp push` or touch Google Sheets / Firestore, and do **not** rename anything not named here. Exact-string replacements only.

Repository root: `D:\Work\Script`. All paths are relative to that root.

---

## Scope (what the user asked for)

1. In the Testing System header, replace the top-level nav item **"المنتجات"** with a dropdown group **"الاصناف وتحركاتها"** containing:
   - **"الاصناف"** → current page `et_products`
   - **"التصنيفات"** → new page `et_categories`
2. Build a new page `et_categories` backed by sheet **`erp_test_categories`** (columns already exist: `id | name_ar | name_eng | user | created_at`). `id` is auto-increment via `max(id)+1` on the target table (never from a counter sheet — this repo has no `ID_Counter` table). `name_ar` and `name_eng` are required text. `user` and `created_at` are stamped by the create helper (do not send them from the client).
3. On page `et_products`, in the **add/edit product** modal:
   - Change the field label from **"الفئة"** to **"التصنيف"**.
   - Change the control from `UIC.enumSelect` (allow-new inline) to a searchable read-only dropdown `UIC.combo` whose **value = `id`** and **label = `name_ar`** from `erp_test_categories`. Users can no longer add categories inline — they use the new التصنيفات page.
   - Change the table column header from **"الفئة"** to **"التصنيف"** as well.

---

## Files you will touch

Existing (edit only):
- `Company_ErpTest_Nav.html`
- `Company_ErpTest_Registry.js`
- `Company_ErpTest_Products.html`
- `Company_ErpTest_Actions.js`
- `tools/liveviews/inventory.json` (add et_categories view so live change-notice includes it)

New (create):
- `Company_ErpTest_Categories.html`

Do **not** edit anything else. Do **not** modify `Company_ErpTest_Schema.js` (the `erp_test_categories` R/W column inventory is already correct — see [Company_ErpTest_Schema.js:76-86](Company_ErpTest_Schema.js#L76-L86)).

---

## Step 1 — nav group

File: `Company_ErpTest_Nav.html`. Current body ([Company_ErpTest_Nav.html:8-13](Company_ErpTest_Nav.html#L8-L13)):

```javascript
window.ERPTEST_MENU = [
  { label: 'الميزانية', items: [
    { label: 'قائمة الدخل', action: 'et_income_statement' },
    { label: 'قائمة المركز المالي', action: 'et_financial_position' }
  ] }
];
```

Replace it verbatim with:

```javascript
window.ERPTEST_MENU = [
  { label: 'الاصناف وتحركاتها', items: [
    { label: 'الاصناف', action: 'et_products' },
    { label: 'التصنيفات', action: 'et_categories' }
  ] },
  { label: 'الميزانية', items: [
    { label: 'قائمة الدخل', action: 'et_income_statement' },
    { label: 'قائمة المركز المالي', action: 'et_financial_position' }
  ] }
];
```

Ordering rationale: the new group goes **first** so it sits at the right (RTL start) of the header, matching the user's phrasing "الاصناف وتحركاتها … below it الاصناف … below it التصنيفات".

---

## Step 2 — registry: drop et_products from top-level, add et_categories

File: `Company_ErpTest_Registry.js`.

### 2a. Remove `المنتجات` from the top-level nav

Top-level nav is built from any `pages[]` entry that has a `label:` property (see `buildCompanyNav_` in [UI_Components.html:4649](UI_Components.html#L4649)). Menu-group items in `ERPTEST_MENU` are separate — one page appearing in both a group and the top strip would show twice, so we drop the top-strip copy.

Find this exact line ([Company_ErpTest_Registry.js:32](Company_ErpTest_Registry.js#L32)):

```javascript
      { action: 'et_products', template: 'Company_ErpTest_Products', title: 'Testing System — المنتجات', label: 'المنتجات' },
```

Replace with:

```javascript
      { action: 'et_products', template: 'Company_ErpTest_Products', title: 'Testing System — الاصناف', nav: false },
      { action: 'et_categories', template: 'Company_ErpTest_Categories', title: 'Testing System — التصنيفات', nav: false },
```

(`nav: false` is the existing convention for pages that are reachable but should not appear in the top-strip; the group menu still surfaces them.)

### 2b. Register the new table in the tables catalog

Find this exact block ([Company_ErpTest_Registry.js:20-27](Company_ErpTest_Registry.js#L20-L27)):

```javascript
    tables: [
      { id: 'et_products_tbl', sheetName: 'erp_test_products', pkColumn: 'id', labelAr: 'المنتجات', pageId: 'et_products' },
```

Immediately after the `et_products_tbl` line insert:

```javascript
      { id: 'et_categories_tbl', sheetName: 'erp_test_categories', pkColumn: 'id', labelAr: 'التصنيفات', pageId: 'et_categories' },
```

Do not reorder or edit any other table row.

---

## Step 3 — backend actions (Company_ErpTest_Actions.js)

Add three actions: `get_et_categories`, `add_et_category`, `edit_et_category`.

### 3a. Register in `ACTION_DEFINITIONS`

Locate this line ([Company_ErpTest_Actions.js:210](Company_ErpTest_Actions.js#L210)):

```javascript
    'edit_et_product': { handler: editProduct_, page: 'et_products', access: 'full', primaryLogTable: PRODUCTS_SHEET },
```

Immediately after it, insert:

```javascript
    'get_et_categories': { handler: getCategories_, page: 'et_categories', access: 'read', primaryLogTable: CATEGORIES_SHEET },
    'add_et_category': { handler: addCategory_, page: 'et_categories', access: 'write', primaryLogTable: CATEGORIES_SHEET },
    'edit_et_category': { handler: editCategory_, page: 'et_categories', access: 'full', primaryLogTable: CATEGORIES_SHEET },
```

`CATEGORIES_SHEET` is already declared at [Company_ErpTest_Actions.js:19](Company_ErpTest_Actions.js#L19).

### 3b. Add the three handler functions

Find the existing function `editProduct_` (ends around [Company_ErpTest_Actions.js:1186](Company_ErpTest_Actions.js#L1186), just before `// Customers / Vendors — list / add / edit`). Insert this whole block **immediately after** `editProduct_`'s closing brace and **before** the `// =========================================\n  // Customers / Vendors — list / add / edit` divider:

```javascript
  // =========================================
  // Categories — list / add / edit  (backs page et_categories)
  // =========================================
  function getCategories_(data, user, dbId) {
    const rows = tlDbList_(dbId, CATEGORIES_SHEET);
    const categories = rows.map(function (c) {
      return {
        id: c.id,
        name_ar: c.name_ar,
        name_eng: c.name_eng,
        user: c.user,
        created_at: c.created_at
      };
    });
    return { status: 'success', categories: categories };
  }

  function addCategory_(data, user, dbId) {
    const nameAr = String((data && data.name_ar) || '').trim();
    const nameEng = String((data && data.name_eng) || '').trim();
    if (!nameAr) throw new Error('الاسم العربي مطلوب');
    if (!nameEng) throw new Error('الاسم الإنجليزي مطلوب');
    var _newVals = { name_ar: nameAr, name_eng: nameEng, user: user.email };
    const created = tlDbCreate_(dbId, CATEGORIES_SHEET, _newVals, { user: user });
    const id = created.assignedId;
    const record = created.record;
    try { var _uid = 'create_erp_test_categories_' + id; logHistory_(dbId, CATEGORIES_SHEET, _uid, String(id), (user && user.email) || '', 'create', _newVals, null); } catch (e) {}
    bumpTlRefsVersion_(dbId);
    invalidateRefsCache_(dbId, 'categories');
    var savedRecord = {
      id: id,
      name_ar: nameAr,
      name_eng: nameEng,
      user: user.email,
      created_at: new Date()
    };
    return { status: 'success', message: 'تمت إضافة التصنيف', data: record, record: savedRecord, assignedId: id, unique_id: String(id) };
  }

  function editCategory_(data, user, dbId) {
    const id = Number((data && data.id));
    if (!id) throw new Error('معرف التصنيف مطلوب');
    const nameAr = String((data && data.name_ar) || '').trim();
    const nameEng = String((data && data.name_eng) || '').trim();
    if (!nameAr) throw new Error('الاسم العربي مطلوب');
    if (!nameEng) throw new Error('الاسم الإنجليزي مطلوب');
    var _newVals = { name_ar: nameAr, name_eng: nameEng };
    const patched = tlDbPatch_(dbId, CATEGORIES_SHEET, id, _newVals, { keyField: 'id', user: user, version: data && data.version });
    if (!patched) throw new Error('التصنيف غير موجود');
    var _old = patched.oldRecord;
    try { var _uid = (_old && _old.record_uid) ? String(_old.record_uid) : 'update_erp_test_categories_' + id; logHistory_(dbId, CATEGORIES_SHEET, _uid, String(id), (user && user.email) || '', 'update', _newVals, _old); } catch (e) {}
    bumpTlRefsVersion_(dbId);
    invalidateRefsCache_(dbId, 'categories');
    var savedRecord = {
      id: id,
      name_ar: nameAr,
      name_eng: nameEng,
      user: (_old && _old.user) || (user && user.email) || '',
      created_at: (_old && _old.created_at) || ''
    };
    return { status: 'success', message: 'تم تحديث التصنيف', record: savedRecord, unique_id: String(id), assignedId: id };
  }
```

Notes on why the shape matches existing patterns:

- `tlDbCreate_` / `tlDbPatch_` are the same helpers `addProduct_` / `editProduct_` use ([Company_ErpTest_Actions.js:1120](Company_ErpTest_Actions.js#L1120), [Company_ErpTest_Actions.js:1159](Company_ErpTest_Actions.js#L1159)). They assign `id` via `max(id)+1` on the target sheet and stamp `user` + `created_at` themselves.
- `bumpTlRefsVersion_` + `invalidateRefsCache_` follow the pattern in `createCategory_` at [Company_ErpTest_Actions.js:958-962](Company_ErpTest_Actions.js#L958-L962) so the cached `categoryOptions_` dropdown refreshes for other pages.

### 3c. Register the handlers with the dispatcher

Locate this block near the bottom of the file ([Company_ErpTest_Actions.js:4364-4366](Company_ErpTest_Actions.js#L4364-L4366)):

```javascript
  register('get_et_products', getProducts_);
  register('add_et_product', addProduct_);
  register('edit_et_product', editProduct_);
```

Immediately after those three lines insert:

```javascript
  register('get_et_categories', getCategories_);
  register('add_et_category', addCategory_);
  register('edit_et_category', editCategory_);
```

### 3d. Wire the page into the live change-notice map

Find the `PAGE_VIEWS = { … }` object ([Company_ErpTest_Actions.js:342-368](Company_ErpTest_Actions.js#L342-L368)). This block is generated by `tools/liveviews/gen_page_views.js` but for one small addition we edit it in place. Locate this exact entry:

```javascript
    'et_products': {
      'list': [PRODUCTS_SHEET, CURRENT_PRODUCTS_SHEET, PURCHASING_LINES_SHEET, SALES_LINES_SHEET, SALES_RETURNS_SHEET, CATEGORIES_SHEET, CHART_SHEET]
    },
```

Immediately **after** that entry (add a trailing comma to it) insert:

```javascript
    'et_categories': {
      'list': [CATEGORIES_SHEET]
    },
```

Do not touch any other view. The `TABLE_LABELS` map already contains `CATEGORIES_SHEET → 'التصنيفات'` at [Company_ErpTest_Actions.js:326](Company_ErpTest_Actions.js#L326), so no label change is needed.

### 3e. Mirror the change in the generator input (so a regen preserves it)

File: `tools/liveviews/inventory.json`. Locate the `"et_products"` entry inside `companies.ErpTest.pageViews`. Immediately after the closing brace of `"et_products"` (add a trailing comma to it), insert:

```json
    "et_categories": {
     "list": [
      "erp_test_categories"
     ]
    },
```

(Match the two-space indentation used by neighboring entries.)

Do **not** run the generator. This is a plain JSON edit only so the next regen does not silently remove the new view.

---

## Step 4 — new page `Company_ErpTest_Categories.html`

Create this new file at the repository root (same folder as the other `Company_ErpTest_*.html` files). Full contents:

```html
<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Testing System — التصنيفات</title>
  <?!= include('CSS_Tokens'); ?>
  <?!= include('UI_Components'); ?>
  <?!= include('Client_Helpers'); ?>
  <?!= include('Company_ErpTest_Nav'); ?>
  <?!= include('ERP_Flow'); ?>
  <?!= include('ERP_Modal'); ?>
  <?!= getCompanyThemeCSS_('37fc50edf1424abd') ?>
</head>
<body>
<div id="tl-root" dir="rtl"></div>
<script>
  var params = new URLSearchParams(window.location.search);
  var SESSION_TOKEN = params.get('sessionToken') || (API.getSession() || {}).token || '';
  var scriptUrl = window.scriptUrl || '/';
  var IS_SUPER_ADMIN = <?!= user && user.isSuperAdmin ? 'true' : 'false' ?>;
  var COMPANY_LOGO_URL = '<?!= getCompanyLogoUrl_('37fc50edf1424abd') ?>';
  var COMPANY_PAGES = <?!= companyPages ?>;
  var CURRENT_ACTION = '<?!= currentAction ?>';
  var USER_PAGES = <?!= user && user.isSuperAdmin ? 'null' : JSON.stringify((user && user.authorizedPages) || {}) ?>;
  var CAN_WRITE = UIC.canAdd_(); var CAN_FULL = UIC.canFull_();

  if (window.UIC && UIC.Live && UIC.Live.viewCache) companyCall = UIC.Live.viewCache(companyCall, { company: '37fc50edf1424abd', page: 'et_categories', view: 'list', lists: ['get_et_categories'] });
  function companyCall(moduleAction, data) {
    return API.call('company_action', {
      target_system: '37fc50edf1424abd',
      module_action: moduleAction,
      data: data || {}
    }, SESSION_TOKEN);
  }

  function load() {
    var contentId = 'categories-content';
    UIC.appShell('tl-root', {
      menuGroups: window.ERPTEST_MENU || [],
      companyLogoUrl: COMPANY_LOGO_URL,
      companyLogoHref: scriptUrl + '?action=et_dashboard&sessionToken=' + SESSION_TOKEN,
      companyLogoTitle: 'النظام التجريبي',
      breadcrumb: 'النظام التجريبي / التصنيفات',
      contentId: contentId
    });
    fetchCategories();
  }

  function fetchCategories() {
    UIC.readSkeleton('categories-content', { message: [
      'جاري تحميل التصنيفات...',
      'لحظة، جاري عرض الجدول...'
    ] });
    companyCall('get_et_categories')
      .then(function (r) { renderCategories(r.categories || []); })
      .catch(function (e) { showError(e); })
      .finally(function () { UI.hideSpinner(); });
  }

  function renderCategories(list) {
    window.__categories = list;
    var rows = list.map(function (c) {
      return {
        id: c.id,
        name_ar: c.name_ar || '-',
        name_eng: c.name_eng || '-',
        actions: UIC.actionBtns(UIC.canFull_() ? [{ label: 'تعديل', onclick: "openCategoryModal('" + FMT.escape(c.id) + "')" }] : [])
      };
    });
    var headers = [
      { key: 'id', label: 'المعرف' },
      { key: 'name_ar', label: 'الاسم العربي' },
      { key: 'name_eng', label: 'الاسم الإنجليزي' },
      { key: 'actions', label: 'إجراءات' }
    ];
    var body = document.getElementById('categories-content');
    body.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px;">' +
      (CAN_WRITE ? '<button class="btn btn-primary" onclick="openCategoryModal(\'\')">+ إضافة تصنيف</button>' : '') +
      '</div>' +
      UIC.dataTable('categories-table', {
        title: 'التصنيفات',
        headers: headers,
        rows: rows,
        emptyText: 'لا توجد تصنيفات'
      });
    UIC.initTableSort('categories-table');
  }

  function openCategoryModal(id) {
    var c = (window.__categories || []).find(function (x) { return String(x.id) === String(id); });
    var body =
      '<form id="category-form">' +
      UIC.field({ key: 'name_ar', label: 'الاسم العربي', value: c ? c.name_ar : '', required: true }) +
      UIC.field({ key: 'name_eng', label: 'الاسم الإنجليزي', value: c ? c.name_eng : '', required: true }) +
      '</form>';
    UIC.openModal('category-modal', {
      title: c ? 'تعديل تصنيف' : 'إضافة تصنيف',
      body: body,
      onSave: 'saveCategory(\'' + (c ? c.id : '') + '\')'
    });
  }

  function saveCategory(id) {
    var btn = document.querySelector('#category-modal .btn-primary');
    UI.submitOnce(btn, function () {
      var data = UIC.collectForm('category-form');
      if (!UIC.validateForm('category-form')) return Promise.reject();
      if (id) data.id = id;
      if (!window.__categories) window.__categories = [];
      return UIC.Live.save({
        call: companyCall,
        action: id ? 'edit_et_category' : 'add_et_category',
        data: data,
        list: window.__categories,
        key: 'id',
        draft: Object.assign({}, data),
        render: function () { renderCategories(window.__categories); },
        modal: 'category-modal',
        message: 'تم الحفظ',
        recordOf: function (r) {
          var rec = (r && r.record) || null;
          if (rec && !rec.id) rec.id = r.assignedId || r.unique_id;
          return rec;
        },
        reload: fetchCategories
      }).catch(function () { /* Live.save already toasted and rolled back */ });
    });
  }

  function showError(e) {
    var body = document.getElementById('categories-content');
    if (body) body.innerHTML = '<div class="empty-state"><span>' + FMT.escape(e.message || 'خطأ') + '</span></div>';
  }

  load();

  UIC.Live.watchPage({
    call: companyCall,
    page: 'et_categories',
    onChange: function () { UIC.Live.arrive(function () { fetchCategories(); }); }
  });
  if (UIC.Live.setView) UIC.Live.setView('list', { refresh: function () { fetchCategories(); } });
</script>
</body>
</html>
```

The structure mirrors `Company_ErpTest_Products.html` on purpose — same shell, same live-notice hooks (`UIC.Live.viewCache`, `watchPage`, `setView`) — so the new page inherits the same behavior guarantees as the rest of the system.

---

## Step 5 — Products form: relabel + searchable read-only category dropdown

File: `Company_ErpTest_Products.html`.

### 5a. Table column header

Find this line ([Company_ErpTest_Products.html:91](Company_ErpTest_Products.html#L91)):

```javascript
      { key: 'category', label: 'الفئة' },
```

Replace with:

```javascript
      { key: 'category', label: 'التصنيف' },
```

### 5b. Modal field: relabel + switch to searchable read-only combo

Find this exact line ([Company_ErpTest_Products.html:141](Company_ErpTest_Products.html#L141)):

```javascript
      UIC.enumSelect({ key: 'category', label: 'الفئة', value: p ? p.category : '', options: categoryOptions, required: true, placeholder: 'اختر الفئة...' }) +
```

Replace with:

```javascript
      UIC.combo({ key: 'category', label: 'التصنيف', value: p ? p.category : '', options: categoryOptions, required: true, placeholder: 'اختر التصنيف...' }) +
```

`UIC.combo` is the same searchable combobox `UIC.enumSelect` uses under the hood ([UI_Components.html:3713-3715](UI_Components.html#L3713-L3715)); the difference is that `combo` alone does **not** allow a new value to be typed inline, which is what we want now that التصنيفات has its own page.

### 5c. Remove the inline "add new" branch in `saveProduct`

Find this exact block ([Company_ErpTest_Products.html:162-168](Company_ErpTest_Products.html#L162-L168)):

```javascript
      if (data.category === '__new__') {
        data.category_new = data.category_custom || '';
        delete data.category;
        delete data.category_custom;
      } else {
        delete data.category_custom;
      }
```

Replace with:

```javascript
      delete data.category_custom;
```

Rationale: `UIC.combo` without `allowNew` never yields `__new__`, so the inline-create path is unreachable; keeping it would confuse a future reader. The single `delete` line stays defensively in case a stale draft carries the field.

Do not touch anything else in this file.

---

## Step 6 — verification (no `clasp push`)

Run these local checks. Show me the exact matching lines for each.

### 6a. Grep sanity

```bash
grep -n "et_categories" Company_ErpTest_Registry.js Company_ErpTest_Actions.js Company_ErpTest_Nav.html tools/liveviews/inventory.json
```

Expected hits (count is a floor, not a ceiling):
- `Company_ErpTest_Registry.js`: 2 (page entry + table entry)
- `Company_ErpTest_Actions.js`: at least 5 (3 in ACTION_DEFINITIONS + 1 in PAGE_VIEWS + 3 register calls)
- `Company_ErpTest_Nav.html`: 1
- `tools/liveviews/inventory.json`: 1

### 6b. New file present

```bash
ls -la Company_ErpTest_Categories.html
```

### 6c. Old label gone from Products form (must return **zero** matches)

```bash
grep -n "'الفئة'" Company_ErpTest_Products.html
grep -n "enumSelect.*category" Company_ErpTest_Products.html
```

Both must be empty. If either has hits you missed step 5.

### 6d. Handlers defined

```bash
grep -n "^  function getCategories_\|^  function addCategory_\|^  function editCategory_" Company_ErpTest_Actions.js
```

Must return three lines.

### 6e. Nav still boots (JS syntax)

Open `Company_ErpTest_Nav.html` in any text editor and confirm the outer `[ … ]` still has matching brackets and every object closes with `}` — a stray comma inside `window.ERPTEST_MENU` breaks the entire header on every ErpTest page.

If any check fails: stop, report the file:line and the diff, and wait. Do not "fix" the plan.

---

## Not in scope (do not do these)

- Do **not** touch `Company_ErpTest_Schema.js`. The `erp_test_categories` R/W field lists already exist there.
- Do **not** rename `categoryOptions_`, `categoryRefs_`, or `resolveCategoryId_` — they are used by other pages (purchasing, sales) that still may add categories inline as before. Only the Products modal loses the inline-create affordance.
- Do **not** add page-access rows to any ERP admin sheet — page access is enforced at runtime via `PAGE_ACCESS` (built from `ACTION_DEFINITIONS`) plus the app-level `authorizedPages` grant per user. Granting the التصنيفات page to a user is done later by an owner in the ERP admin UI, not in this plan.
- Do **not** run `clasp push`, `clasp deploy`, `node tools/liveviews/gen_page_views.js`, or `node tools/erptest/gen_actions.js`. All edits are local-file only.
- Do **not** create any documentation, README, or progress files.

---

## Commit

When all of Step 6 passes, stage the six files and commit with:

```
et_categories: new page + regroup الاصناف وتحركاتها in nav

- Nav: new dropdown group الاصناف وتحركاتها → الاصناف (et_products) + التصنيفات (et_categories); المنتجات removed from the top strip.
- Registry: register et_categories page + erp_test_categories table.
- Actions: get/add/edit_et_category handlers, ACTION_DEFINITIONS + register, PAGE_VIEWS entry, inventory.json mirror.
- New page Company_ErpTest_Categories.html (id, name_ar, name_eng list + add/edit modal).
- Products form: الفئة → التصنيف, UIC.enumSelect → UIC.combo (searchable, no inline-create); table header relabeled.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Do not push. Wait for the owner to review.
