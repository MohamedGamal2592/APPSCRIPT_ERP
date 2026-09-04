/**
 * Company_TopLight_Registry.js
 * RESPONSIBILITY: Register Top Light with the control plane — ONE call, nothing
 * else. Action logic lives in Company_TopLight_Actions.js (IIFE namespace).
 * The company_unique_id '8df5c89a117fe9a5' must match an ERP_Companies row for
 * the dashboard double-gate.
 */

function registerTopLight_() {
  registerCompany_('8df5c89a117fe9a5', {
    dispatch: TopLight.dispatch_,
    pageForAction: TopLight.pageForAction_,
    tableForAction: TopLight.tableForAction_,
    // §2.1 Table Catalog — metadata only, no schema change, validated at runtime via getHeaders_
    tables: [
      { id: 'tl_products_tbl', sheetName: 'top_light_products', pkColumn: 'id', labelAr: 'المنتجات', pageId: 'tl_products' },
      { id: 'tl_customers_tbl', sheetName: 'top_light_customer_vendor', pkColumn: 'id', labelAr: 'العملاء والموردون', pageId: 'tl_customers' },
      { id: 'tl_purchasing_tbl', sheetName: 'top_light_purchasing_costing', pkColumn: 'unique_id', labelAr: 'المشتريات', pageId: 'tl_purchasing' },
      { id: 'tl_sales_tbl', sheetName: 'top_light_sales_invoices', pkColumn: 'invoice_unique_id', labelAr: 'المبيعات', pageId: 'tl_sales' },
      { id: 'tl_cash_tbl', sheetName: 'top_light_cash_bank_movement', pkColumn: 'unique_id', labelAr: 'حركة النقدية', pageId: 'tl_cash' }
    ],
    pages: [
      { action: 'tl_dashboard', template: 'Company_TopLight_Dashboard', title: 'Top Light — Dashboard', label: 'لوحة التحكم' },
      { action: 'tl_kpi', template: 'Company_TopLight_KPI', title: 'Top Light — المؤشرات', label: 'المؤشرات' },
      { action: 'tl_analysis_review', template: 'Company_TopLight_Dashboard', title: 'مراجعة تحليل المبيعات', nav: false },
      { action: 'tl_products', template: 'Company_TopLight_Products', title: 'Top Light — المنتجات', label: 'المنتجات' },
      { action: 'tl_customers', template: 'Company_TopLight_Customers', title: 'Top Light — العملاء والموردون', label: 'العملاء والموردون' },
      { action: 'tl_purchasing', template: 'Company_TopLight_Purchasing', title: 'Top Light — المشتريات', label: 'المشتريات' },
      { action: 'tl_purchase_print', template: 'Company_TopLight_Purchase_Print', title: 'أمر شراء', nav: false },
      { action: 'tl_sales', template: 'Company_TopLight_Sales', title: 'Top Light — المبيعات', label: 'المبيعات' },
      { action: 'tl_sales_offer', template: 'Company_TopLight_Sales_Offer', title: 'Top Light — عروض الأسعار', label: 'عروض الأسعار' },
      { action: 'tl_sales_print', template: 'Company_TopLight_Sales_Print', title: 'فاتورة بيع', nav: false },
      { action: 'tl_sales_release', template: 'Company_TopLight_Sales_Release', title: 'اذن صرف منتج', nav: false },
      { action: 'tl_sales_returns', template: 'Company_TopLight_Sales_Returns', title: 'مرتجعات المبيعات', nav: false },
      { action: 'tl_sales_offer_print', template: 'Company_TopLight_Sales_Offer_Print', title: 'عرض سعر', nav: false },
      { action: 'tl_sales_analysis', template: 'Company_TopLight_Sales_Analysis', title: 'Top Light — تحليل المبيعات', nav: false },
      { action: 'tl_cash', template: 'Company_TopLight_Cash', title: 'Top Light — حركة النقدية', label: 'حركة النقدية' },
      { action: 'tl_cash_report', template: 'Company_TopLight_Cash_Report', title: 'Top Light — تقرير النقدية', nav: false },
      { action: 'tl_customer_statement', template: 'Company_TopLight_Customer_Statement', title: 'كشف حساب عميل', nav: false },
      { action: 'tl_purchase_needs', template: 'Company_TopLight_Purchase_Needs', title: 'الاصناف المطلوب شرائها', nav: false },
      { action: 'tl_product_movement', template: 'Company_TopLight_Product_Movement', title: 'حركة المنتج', nav: false }
    ]
  });
}