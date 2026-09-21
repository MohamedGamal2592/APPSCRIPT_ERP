/**
 * Small pure algorithms shared by audited read-only workflows.
 * Keep this file dependency-free so Apps Script can load it before company code
 * and local benchmarks can execute the same functions over deterministic data.
 */
var ERPReadAlgorithms_ = (function () {
  function invitedBatchMembership(assignments) {
    var ids = new Set();
    (assignments || []).forEach(function (assignment) {
      if (assignment && assignment.Status === 'Invited') ids.add(assignment.BatchID);
    });
    return ids;
  }

  /* First match wins, including duplicate and undefined keys. */
  function firstScoreIndex(items) {
    var byQuestion = new Map();
    (items || []).forEach(function (item) {
      var key = item && item.QuestionID;
      if (!byQuestion.has(key)) byQuestion.set(key, item);
    });
    return byQuestion;
  }

  return {
    invitedBatchMembership: invitedBatchMembership,
    firstScoreIndex: firstScoreIndex
  };
})();
