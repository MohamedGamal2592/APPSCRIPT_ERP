/* Paste this whole file into the Console of the logged-in ERP application frame.
 * Then: await RegistrationAttachmentRepair.preview()
 * Review the result, then: await RegistrationAttachmentRepair.apply()
 * Loading the helper alone performs no requests or writes.
 */
(function () {
  'use strict';
  var reference = 'registration_papers_Files_/تسجيل توب وانTop One.document_file.103330.pdf';
  var ready = false, busy = false;
  async function run(dryRun) {
    if (busy) throw new Error('A repair operation is already running.');
    if (!window.API || !window.API.call || !window.SESSION || !window.SESSION.token) {
      throw new Error('Select the ERP application iframe in the Console context selector. Open the ERP page, not the attachment error page.');
    }
    if (!dryRun && !ready) throw new Error('Run preview() and review it first.');
    ready = false; busy = true;
    var offset = 0, batches = [], proposed = 0, repaired = 0, missing = 0, conflicts = 0;
    try {
      do {
        var result = await window.API.call('backfill_attachment_ids', {
          page: 'tc_registration_papers', reference: reference,
          dryRun: dryRun, offset: offset, limit: 25
        }, window.SESSION.token());
        if (!result || result.status !== 'success') throw new Error(result && result.message || 'Repair request failed.');
        if (!result.summary || result.summary.reference !== reference) {
          throw new Error('This deployment lacks the targeted repair. Update the Apps Script web-app deployment to the corrected version first.');
        }
        var stat = result.summary.pages['tc_registration_papers/registration_papers'];
        if (!stat) throw new Error('Registration migration result missing.');
        batches.push(stat);
        if (stat.errors && stat.errors.length) throw new Error(stat.errors.join('\n'));
        proposed += stat.wouldUpdate || 0; repaired += stat.updated || 0;
        missing += stat.missing || 0; conflicts += stat.conflicts || 0;
        var next = stat.nextOffset;
        if (next != null && (!Number.isInteger(next) || next <= offset)) throw new Error('Invalid continuation offset.');
        offset = next;
      } while (offset != null);
      var report = { proposed: proposed, repaired: repaired, missing: missing, conflicts: conflicts, batches: batches };
      console.log(report);
      if (dryRun) ready = proposed > 0 && missing === 0 && conflicts === 0;
      if (dryRun && !ready) console.info('No applicable repair or unresolved file. Inspect batches for details; apply is disabled.');
      return report;
    } finally {
      window.RegistrationAttachmentRepair.lastBatches = batches;
      busy = false;
    }
  }
  window.RegistrationAttachmentRepair = {
    preview: function () { return run(true); },
    apply: function () { return run(false); },
    lastBatches: []
  };
  console.info('Ready: await RegistrationAttachmentRepair.preview()');
})();
