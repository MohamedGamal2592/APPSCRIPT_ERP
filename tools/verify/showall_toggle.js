'use strict';
/* Show-all unification: functional check on one Group-3 page (CartonSizes)
 * plus showAllBar unit checks. */
const { bootPage, flush } = require('./pageharness');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('  ' + extra); }
}

(async function () {
  console.log('\n1 — UIC.showAllBar renders both states\n');
  {
    const s = bootPage({
      page: 'Company_TopChemical_CartonSizes.html',
      isSuperAdmin: true,
      containers: ['carton-content'],
      scriptlets: { CURRENT_ACTION: "'tc_carton_sizes'" },
      call: () => ({ status: 'success', sizes: [], product_options: [] })
    });
    const UIC = s.UIC;
    const capped = UIC.showAllBar({ loadedAll: false, total: 137, showAll: 'toggleLoadAll()', showLatest: 'toggleLoadAll()' });
    check(capped.indexOf('آخر 20 سجل') !== -1, 'capped bar names the 20-row window');
    check(capped.indexOf('📊 عرض الكل') !== -1, 'capped bar offers عرض الكل');
    check(capped.indexOf('(137 سجل)') !== -1, 'capped bar shows the total');
    check(capped.indexOf('toggleLoadAll()') !== -1, 'capped bar wires the toggle');
    const full = UIC.showAllBar({ loadedAll: true, showAll: 'toggleLoadAll()', showLatest: 'toggleLoadAll()' });
    check(full.indexOf('الوضع: <b>عرض الكل</b>') !== -1, 'full bar badges عرض الكل');
    check(full.indexOf('📄 عرض آخر 20 سجل فقط') !== -1, 'full bar offers the way back');
    check(UIC.LATEST_N === 20, 'UIC.LATEST_N is 20');
  }

  console.log('\n2 — CartonSizes toggle drives loadAll + scope notice\n');
  {
    const seen = [];
    const sizes = (n) => Array.from({ length: n }, (_, i) => ({
      id: i + 1, product: 1, product_name: 'صنف ' + i, common_vendor: 2,
      vendor_name: 'مورد', type: 'كرتون', length: 10, width: 10, height: 10, other_details: ''
    }));
    const s = bootPage({
      page: 'Company_TopChemical_CartonSizes.html',
      isSuperAdmin: true,
      containers: ['carton-content'],
      scriptlets: { CURRENT_ACTION: "'tc_carton_sizes'" },
      call: (action, data) => {
        seen.push({ action, data });
        if (action === 'get_carton_sizes') {
          return { status: 'success', sizes: sizes(data && data.loadAll ? 37 : 20), product_options: [], vendor_options: [], type_options: [] };
        }
        return { status: 'success' };
      }
    });
    /* NOTE: bootPage boots the page, which auto-loads once (seen[0]).
       Every explicit action below therefore asserts on the DELTA. */
    s.fetchSizes();
    await flush(); await flush(); await flush();
    const h1 = s.html('carton-content');
    const first = seen[seen.length - 1];
    check(!first.data.loadAll, 'windowed fetch asks for the newest rows only');
    check(h1.indexOf('آخر 20 سجل') !== -1, 'capped view badges آخر 20 سجل');
    check(h1.indexOf('📊 عرض الكل') !== -1, 'capped view offers عرض الكل');
    check(h1.indexOf('dt-search-scope') !== -1, 'capped search box declares its scope');

    s.toggleLoadAll();
    await flush(); await flush(); await flush();
    const h2 = s.html('carton-content');
    check(seen[seen.length - 1].data.loadAll === true, 'toggle refetches with loadAll:true');
    check(h2.indexOf('الوضع: <b>عرض الكل</b>') !== -1, 'full view badges عرض الكل');
    check(h2.indexOf('📄 عرض آخر 20 سجل فقط') !== -1, 'full view offers the way back');
    check(h2.indexOf('dt-search-scope') === -1, 'full view draws no scope notice');

    s.toggleLoadAll();
    await flush(); await flush(); await flush();
    check(seen[seen.length - 1].data.loadAll !== true, 'toggling back returns to the window');
    check(s.html('carton-content').indexOf('آخر 20 سجل') !== -1, 'and the badge follows');
  }

  console.log('\n' + (failed === 0 ? 'OK — show-all toggle works end to end.' : 'FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})();
