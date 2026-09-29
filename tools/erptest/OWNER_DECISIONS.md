# Owner decisions / plan amendments (erp_test)

These override the fixed plan `Plan_ErpTest_Clone_JSON_Fast_Data.md`. Recorded so future sessions know the plan was changed on the owner's instruction.

## OD-A (2026-09-29) — Stock is computed live; no current_products sheet
- **Do NOT create `erp_test_current_products`.** (Overrides B3 stock row, OD3, and P7 step 7.1–7.4 "stock becomes a code-owned sheet".)
- Current quantity per product is computed live from three tabs, matching the Top Light `current_qty` formula:
  - `+ Σ erp_test_product_purchasing.qty` (by product)
  - `− Σ erp_test_sales_products.product_qty` (by product)
  - `+ Σ erp_test_sales_returns.<return_qty>` (by product, per OD1 "returns matched by product id")
- `unitCostOf_` / `currentQtyMap_` / stock reads are computed from these tabs instead of reading a `current_products` sheet.
- Impact: P0 check 1 no longer requires `erp_test_current_products`; P7's `etRefreshStockSheet_` / stock-refresh trigger are dropped or replaced by live computation. To be detailed when we reach P3/P7.

## OD-B (2026-09-29) — Leave the `*_islamic_*` tabs alone
- Do NOT create, touch, or map `erp_test_islamic_sales_invoices`, `erp_test_islamic_sales_products`, `erp_test_islamic_sales_returns`, `erp_test_islamic_current_products_`. They are irrelevant to this clone.

## OD-C (2026-09-29) — Remove tax_system from the clone
- `tax_system` does not exist on `erp_test_sales_invoices` / `erp_test_sales_offer`. **Remove tax_system from the ErpTest script functions** (do not read or write it; drop it from ET_FIELD_INVENTORY). The clone does not support table-tax (سلع جدول).
- Impact (P3): strip `tax_system` from the cloned `Company_ErpTest_Actions.js` row-builders/response objects; related W tax-classification fields (ميزان حسابي, نوع الضريبة, نوع البيان, نوع السلعة, نوع سلع الجدول) are not written either.

## OD-D (2026-09-29) — Remove address/mobile; derive vendor name in code
- `العنوان` (address) and `رقم الموبيل` (mobile) don't exist on the erp_test sales/offer sheets. **Remove them from the ErpTest script functions** (treat as non-existent; not stored, not read).
- `name_vendor` doesn't exist on `erp_test_cash_bank_movement`. **Derive the party name in code** from the party id (`name` column) via the existing party lookup, instead of reading a `name_vendor` column.
- Impact (P3): drop العنوان/رقم الموبيل keys from sales/offer row-builders and print/response objects; in the cash report, replace `r.name_vendor` with a party-name lookup by id.

## OD-E (2026-09-29) — Keep offer key column; change the code
- Keep the sheet column `offer_unique_id` on `erp_test_sales_offer`. **Amend Appendix 1**: the `et_sales_offer` chain `keyColumn` becomes `'offer_unique_id'` (not `invoice_unique_id`). Any other physical reference to the offer key in the clone uses `offer_unique_id`.
- Impact (P0): the required-exact check for `erp_test_sales_offer` expects `offer_unique_id`.

## OD-A addendum (2026-09-29) — checks retired/adjusted under live stock
- P0 check 3 (positional column indices in `top_light_product_purchasing`) is **retired/reformulated**: under OD-A stock is computed by logical-name lookup, not by position. The check now verifies `product`, `qty`, `total_cost` exist by name in `erp_test_product_purchasing` (they do). Recorded actual top_light indices: product=6(G), qty=9(J), total_cost=12(M); the plan's stated 7/10/13 were off by the `movement_code` column.
- The 2 FORMULA-CONFLICTs on `erp_test_chart_of_accounts` (`كود المستوى`, `اسم الحساب الرئيسي`) are false positives: chart is a **read-only reference table** the code never writes (Top Light reads the same formula columns). `erp_test_chart_of_accounts` is added to the formula-guard exception alongside `erp_test_current_products`.
- `movement_code` reclassified R→W (the code's write is guarded by column existence; nothing reads it as a source).
