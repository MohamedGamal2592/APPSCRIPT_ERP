/**
 * Company_ErpTest_Registry.js
 * RESPONSIBILITY: Register Testing System with the control plane — ONE call, nothing
 * else. Action logic lives in Company_ErpTest_Actions.js (IIFE namespace).
 * The company_unique_id '37fc50edf1424abd' must match an ERP_Companies row for
 * the dashboard double-gate.
 */

function registerErpTest_() {
  registerCompany_('37fc50edf1424abd', {
    dispatch: ErpTest.dispatch_,
    pageForAction: ErpTest.pageForAction_,
    tableForAction: ErpTest.tableForAction_,
    themeCss: ErpTest.themeCss_,
    blockTheme: ErpTest.blockTheme_,
    approvalPolicy: ErpTest.approvalPolicy_,
    attachmentPolicy: ErpTest.attachmentPolicy_,
    artifactHandlers: ErpTest.artifactHandlers_,
    // §2.1 Table Catalog — metadata only, no schema change, validated at runtime via getHeaders_
    tables: [
      { id: 'et_products_tbl', sheetName: 'erp_test_products', pkColumn: 'id', labelAr: 'المنتجات', pageId: 'et_products' },
      { id: 'et_customers_tbl', sheetName: 'erp_test_customer_vendor', pkColumn: 'id', labelAr: 'العملاء والموردون', pageId: 'et_customers' },
      { id: 'et_purchasing_tbl', sheetName: 'erp_test_purchasing_costing', pkColumn: 'unique_id', labelAr: 'المشتريات', pageId: 'et_purchasing' },
      { id: 'et_sales_tbl', sheetName: 'erp_test_sales_invoices', pkColumn: 'invoice_unique_id', labelAr: 'المبيعات', pageId: 'et_sales' },
      { id: 'et_cash_tbl', sheetName: 'erp_test_cash_bank_movement', pkColumn: 'unique_id', labelAr: 'حركة النقدية', pageId: 'et_cash' },
      { id: 'et_manufacture_tbl', sheetName: 'erp_test_manufacture_orders', pkColumn: 'unique_id', labelAr: 'التصنيع', pageId: 'et_manufacture' }
    ],
    pages: [
      { action: 'et_dashboard', template: 'Company_ErpTest_Dashboard', title: 'Testing System — Dashboard', label: 'لوحة التحكم' },
      { action: 'et_kpi', template: 'Company_ErpTest_KPI', title: 'Testing System — المؤشرات', label: 'المؤشرات' },
      { action: 'et_analysis_review', template: 'Company_ErpTest_Dashboard', title: 'مراجعة تحليل المبيعات', nav: false },
      { action: 'et_products', template: 'Company_ErpTest_Products', title: 'Testing System — المنتجات', label: 'المنتجات' },
      { action: 'et_customers', template: 'Company_ErpTest_Customers', title: 'Testing System — العملاء والموردون', label: 'العملاء والموردون' },
      { action: 'et_purchasing', template: 'Company_ErpTest_Purchasing', title: 'Testing System — المشتريات', label: 'المشتريات' },
      { action: 'et_purchase_print', template: 'Company_ErpTest_Purchase_Print', title: 'أمر شراء', nav: false },
      { action: 'et_sales', template: 'Company_ErpTest_Sales', title: 'Testing System — المبيعات', label: 'المبيعات' },
      { action: 'et_sales_offer', template: 'Company_ErpTest_Sales_Offer', title: 'Testing System — عروض الأسعار', label: 'عروض الأسعار' },
      { action: 'et_sales_print', template: 'Company_ErpTest_Sales_Print', title: 'فاتورة بيع', nav: false },
      { action: 'et_sales_costing_print', template: 'Company_ErpTest_Sales_Costing_Print', title: 'تحليل تكلفة الفاتورة', nav: false },
      { action: 'et_sales_release', template: 'Company_ErpTest_Sales_Release', title: 'اذن صرف منتج', nav: false },
      { action: 'et_sales_returns', template: 'Company_ErpTest_Sales_Returns', title: 'مرتجعات المبيعات', nav: false },
      { action: 'et_sales_offer_print', template: 'Company_ErpTest_Sales_Offer_Print', title: 'عرض سعر', nav: false },
      { action: 'et_sales_analysis', template: 'Company_ErpTest_Sales_Analysis', title: 'Testing System — تحليل المبيعات', nav: false },
      { action: 'et_sales_costing_analysis', template: 'Company_ErpTest_Sales_Costing_Analysis', title: 'تحليل تكلفة المبيعات الاجمالية', nav: false },
      { action: 'et_income_statement', template: 'Company_ErpTest_Income_Statement', title: 'قائمة الدخل', nav: false },
      { action: 'et_financial_position', template: 'Company_ErpTest_Financial_Position', title: 'قائمة المركز المالي', nav: false },
      { action: 'et_cash', template: 'Company_ErpTest_Cash', title: 'Testing System — حركة النقدية', label: 'حركة النقدية' },
      { action: 'et_cash_report', template: 'Company_ErpTest_Cash_Report', title: 'Testing System — تقرير النقدية', nav: false },
      { action: 'et_customer_statement', template: 'Company_ErpTest_Customer_Statement', title: 'كشف حساب عميل', nav: false },
      { action: 'et_purchase_needs', template: 'Company_ErpTest_Purchase_Needs', title: 'الاصناف المطلوب شرائها', nav: false },
      { action: 'et_product_movement', template: 'Company_ErpTest_Product_Movement', title: 'حركة المنتج', nav: false },
      { action: 'et_manufacture', template: 'Company_ErpTest_Manufacture', title: 'Testing System — التصنيع', label: 'التصنيع' },
      { action: 'et_manufacture_print', template: 'Company_ErpTest_Manufacture_Print', title: 'أمر تصنيع', nav: false }
    ]
  });
}