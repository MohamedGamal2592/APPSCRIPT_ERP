const checkAccountStatus = function (callback) {
  // todo: retrieve from localStorage if available

  // ping the server and get the account status:
  $.ajax({
    url: '/api/account/status',
    data: null,
    success: function (accountStatus) {
      const $accountAlert = $('.primaryNav .account .alertFlag');
      $accountAlert.toggle(accountStatus.requiresUpgrade);

      const $accountType = $('.primaryNav .subscriptionType');
      $accountType.text(accountStatus.accountPlanDisplayName?.toUpperCase());
      if (accountStatus.isCorporate) {
        if (!$('.primaryNav').hasClass('CorporateCustomer')) {
          $('.primaryNav').addClass('CorporateCustomer');
        }
      }
    },
    complete: function () {
      if ('function' === typeof callback) {
        callback();
      }
    },
  });
};

// eslint-disable-next-line no-unused-vars
const initCheckAccountStatus = function (interval) {
  const invokeCheck = function () {
    setTimeout(function () {
      checkAccountStatus(invokeCheck);
    }, interval);
  };
  checkAccountStatus(invokeCheck);
};
