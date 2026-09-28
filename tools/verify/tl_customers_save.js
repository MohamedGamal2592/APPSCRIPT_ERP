'use strict';

/* Regression check for the nested submit guard that previously swallowed saves. */
const { bootPage, flush } = require('./pageharness');

async function main() {
  const s = bootPage({
    page: 'Company_TopLight_Customers.html',
    containers: ['tl-root', 'parties-content'],
    scriptlets: { CURRENT_ACTION: "'tl_customers'" },
    expose: ['openPartyModal', 'saveParty'],
    call: action => action === 'get_parties'
      ? { parties: [], type_options: [], country_options: [], region_options: [] }
      : { status: 'success' }
  });
  for (let i = 0; i < 5; i++) await flush();

  let resolveSave;
  let saveOptions = null;
  s.UIC.collectForm = () => ({
    name: 'عميل اختبار', customer_direction: 'customer', type: '__new__', type_custom: 'تجزئة',
    country: 'مصر', region: 'القاهرة', telephone: '01000000000', address: 'عنوان اختبار'
  });
  s.UIC.validateForm = () => true;
  s.UIC.Live.save = options => {
    saveOptions = options;
    return new Promise(resolve => { resolveSave = resolve; });
  };

  /* Match UI.submitOnce's actual in-flight lock from Client_Helpers. */
  s.UI.submitOnce = (button, callback) => {
    if (button.dataset.vfSubmitting === '1') return;
    button.dataset.vfSubmitting = '1';
    button.disabled = true;
    const finish = () => { button.disabled = false; button.dataset.vfSubmitting = ''; };
    const result = callback();
    if (result && typeof result.then === 'function') result.then(finish, finish);
    else finish();
    return result;
  };

  s.exported('openPartyModal')('');
  const modal = s.html('party-modal');
  const button = { disabled: false, dataset: {} };
  const pending = s.UI.submitOnce(button, () => s.exported('saveParty')(''));

  const checks = [];
  function check(ok, label) {
    checks.push(ok);
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label);
  }
  check(/UI\.submitOnce\(this, function\(\)\{return saveParty\(''\)\}\)/.test(modal),
    'the modal returns the save promise to its single submit guard');
  check(!!saveOptions && saveOptions.action === 'add_party' && saveOptions.data.name === 'عميل اختبار',
    'clicking Save reaches UIC.Live.save with the customer form values');
  check(saveOptions && saveOptions.data.type === 'تجزئة' && !('type_custom' in saveOptions.data),
    'new enum values are normalized before the save request');
  check(button.disabled && button.dataset.vfSubmitting === '1',
    'the button stays protected while the request is pending');

  resolveSave({ status: 'success', record: { id: 7 } });
  await pending;
  await flush();
  check(!button.disabled && button.dataset.vfSubmitting === '',
    'the submit guard releases after the save promise settles');

  s.UIC.validateForm = () => false;
  let secondSave = false;
  s.UIC.Live.save = () => { secondSave = true; return Promise.resolve(); };
  s.exported('saveParty')('');
  check(!secondSave, 'invalid forms still stop before calling the save action');

  if (checks.some(ok => !ok)) process.exitCode = 1;
  else console.log('tl_customers_save: all assertions pass');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
