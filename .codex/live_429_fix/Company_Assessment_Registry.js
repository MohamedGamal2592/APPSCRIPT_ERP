/**
 * Company_Assessment_Registry.js
 * RESPONSIBILITY: Register the assessment center (مركز التقييم) with the
 * control plane — ONE call, nothing else. Action logic lives in
 * Company_Assessment_Actions.js (IIFE namespace `AssessmentCenter`).
 * The company_unique_id '32fafd256ccb7a1c' must match an ERP_Companies row
 * for the dashboard double-gate (owner step, plan §9.1/D-1).
 */

// NOTE: The real `AssessmentCenter` namespace is defined in
// Company_Assessment_Actions.js (loaded later). We must NOT redeclare it here —
// doing so would collide at project scope. registerAssessmentCenter_() runs at
// doGet time (after all files are loaded), so it can safely reference it.

function registerAssessmentCenter_() {
  registerCompany_('32fafd256ccb7a1c', {
    dispatch: AssessmentCenter.dispatch_,
    // NEW key — read only by executeCompanyPublicAction_ (Code.js), never by
    // executeCompanyAction_. The three existing companies register no
    // publicDispatch, so the public route stays inert for them (ac1_wiring.js).
    publicDispatch: AssessmentCenter.publicDispatch_,
    pageForAction: AssessmentCenter.pageForAction_,
    tableForAction: AssessmentCenter.tableForAction_,
    // §2.2 table catalog — metadata only, no schema change.
    tables: [
      { id: 'ac_assessments_tbl', sheetName: 'Assessments', pkColumn: 'AssessmentID', labelAr: 'التقييمات', pageId: 'ac_assessments' },
      { id: 'ac_batches_tbl', sheetName: 'AssessmentBatches', pkColumn: 'BatchID', labelAr: 'الدفعات', pageId: 'ac_batches' },
      { id: 'ac_assignments_tbl', sheetName: 'Assignments', pkColumn: 'AssignmentID', labelAr: 'المحاولات', pageId: 'ac_results' }
    ],
    pages: [
      // First page = main dashboard (navigable; default nav:true) — the tile target.
      { action: 'ac_dashboard', template: 'Company_Assessment_Dashboard', title: 'مركز التقييم — لوحة التحكم', label: 'لوحة التحكم' },
      { action: 'ac_assessments', template: 'Company_Assessment_Assessments', title: 'التقييمات', label: 'التقييمات', nav: false },
      { action: 'ac_assessment_form', template: 'Company_Assessment_AssessmentForm', title: 'تقييم', label: 'تقييم', nav: false },
      { action: 'ac_batches', template: 'Company_Assessment_Batches', title: 'دفعات التقييم', label: 'دفعات التقييم', nav: false },
      { action: 'ac_results', template: 'Company_Assessment_Results', title: 'النتائج', label: 'النتائج', nav: false },
      { action: 'ac_result_view', template: 'Company_Assessment_ResultView', title: 'نتيجة مرشح', label: 'نتيجة مرشح', nav: false },
      // PUBLIC: no session, no appShell (T-1). Still listed in صفحات النظام
      // (R-21) — granting or denying it does nothing, it is public by design.
      { action: 'ac_take', template: 'Company_Assessment_Take', title: 'التقييم', label: 'التقييم', nav: false, public: true }
    ]
  });
}
