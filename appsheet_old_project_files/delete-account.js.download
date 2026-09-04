window.initializeDeleteAccountModal = function () {
  // Bring in some names from the global namespace to make the linter happy.
  // This file is currently not bundled
  const TrackLinks = window.TrackLinks;

  // Track the clicks on the top menu bar
  TrackLinks('.primaryNav a', 'Navigation', function (elt) {
    const $elt = $(elt);
    // Event properties
    return {
      linkLabel: $elt.attr('data-label'),
      linkText: $elt.text().trim(),
      linkUrl: $elt.attr('href'),
    };
  });

  // When user clicks 'delete my account,' open dialog
  $('.deleteAccount').on('click', function (e) {
    e.preventDefault();
    $('#deleteAccountModal').modal();
    $('#deleteAccountModal [name=deleteAccountComment]').val('');
    $('#deleteAccountModal [type=submit]')
      .val('')
      .removeClass('primary button')
      .text('Delete my account')
      .show();
  });

  // Manually validate the form
  const $radioButtons = $('#deleteAccountModal [type=radio]');
  const $commentBox = $('#deleteAccountModal textarea');
  const $submitButton = $('#deleteAccountModal button[type=submit]');
  const validate = function () {
    const pickedRadio = $radioButtons.filter(':checked').length === 1;
    const enteredComment = !!$commentBox.val().length;
    const isValid = pickedRadio && enteredComment;
    $submitButton.prop('disabled', !isValid);
  };
  $radioButtons.on('click', validate);
  $commentBox.bind('input propertychange', validate);
  $submitButton.prop('disabled', true);

  // When user clicks 'ok' in delete my account dialog, confirm and delete account
  $submitButton.on('click', function (e) {
    if ($(this).val() === '') {
      e.preventDefault();
      $(this)
        .val('confirmed')
        .addClass('primary button')
        .text('Are you really sure?');
    } else {
      // Track feedback on Concord (note: comment is lost, unfortuately)
      if (
        window.Concord &&
        typeof window.Concord.TrackSimpleEvent === 'function'
      ) {
        window.Concord.TrackSimpleEvent('Delete Account', {
          reason: $(
            '#deleteAccountModal [name=deleteAccountReason]:checked'
          ).val(),
        });
      }
    }
  });
};
