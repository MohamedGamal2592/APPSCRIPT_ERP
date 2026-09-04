/* eslint no-undef:0 no-unused-vars:0 */

function initializeUtilities() {
  $.fn.extend({
    /*--------------- MODALS ---------------*/
    modal: function (/*action*/) {
      return this.each(function () {
        const self = $(this);

        $('<div></div>')
          .addClass('modal-background')
          .fadeIn(200)
          .appendTo(document.body);

        self.fadeIn();
        self.find('[data-dismiss="modal"]').on('click', function () {
          self.modalclose();
        });
        self.focus().keyup(function (e) {
          if (e.keyCode === 27) self.find('.close').click();
        });
      });
    },
    modalclose: function () {
      return this.each(function () {
        $('.modal-background')
          .first()
          .fadeOut(200, function () {
            $(this).remove();
          });

        $(this).fadeOut(200);
      });
    },
  });

  /*--------------- TABS ---------------*/

  $('.nav-tabs [data-toggle=tab], .side-tabs [data-toggle=tab]').on(
    'click',
    function (e) {
      e.preventDefault();

      $(this)
        .parents('.nav-tabs, .side-tabs')
        .children('li')
        .removeClass('active');
      $(this).parents('li').addClass('active');

      const name = $(this).attr('href');
      const pane = $(name + '.tab-pane');
      pane.siblings('.tab-pane').hide();
      pane.show();
    }
  );
  $('.nav-tabs [data-toggle=tab], .side-tabs [data-toggle=tab]')
    .first()
    .click();

  /*--------------- App Card ---------------*/
  $('.more > .moreOpenButton').on('click', function (e) {
    const moreElement = $(this).parent();
    moreElement.children('.moreButtonList').show();
    e.stopPropagation();

    document.addEventListener(
      'click',
      function () {
        moreElement.children('.moreButtonList').hide();
      },
      { once: true }
    );
  });
}

initializeUtilities();

// Keep track of which tab was open last time
function enableAutoTabHistory(pageName) {
  setCurrentTab(pageName);

  $(window).on('hashchange', function () {
    setCurrentTab(pageName);
  });

  $('a.SectionTitle').on('click', function () {
    if (
      !$(this).hasClass('ActionEntry') &&
      $(this).closest('.MetaAction').length === 0
    ) {
      const $parentSubSection = $(this).closest('.SubSection');
      if ($parentSubSection.length === 0) {
        // it is a top-level section title click
        // mark the current tab in the url hash
        window.location.hash = $(this).attr('href').replace('#', '_tab_');
      } else {
        // it is a subsection title click --- just record it
        if (null != pageName && window.localStorage) {
          window.localStorage.setItem(
            pageName + '_subtabstate',
            $parentSubSection.attr('id')
          );
        }
      }
    }
  });
}

// Debouncer since we aren't using a later version of jquery
function debounce(func, wait, immediate) {
  let timeout;
  return function () {
    const context = this,
      args = arguments;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

// Open a specific tab
function setCurrentTab(pageName) {
  $('.RootSection,.SubSection').removeClass('active');
  let tabState = null;
  if (window.location.hash.indexOf('_tab_') >= 0) {
    tabState = window.location.hash.replace('#', '').replace('_tab_', '');
  } else {
    try {
      if (null != pageName && window.localStorage) {
        tabState = window.localStorage.getItem(pageName + '_tabstate');
      }
    } catch (ex) {
      // Do nothing
    }
  }
  if (null != tabState && tabState.length > 0) {
    const $thisTab = $('#' + tabState + ', #Section' + tabState);
    if ($thisTab.length > 0) {
      let subtabState = null;
      if (null != pageName && window.localStorage) {
        subtabState = window.localStorage.getItem(pageName + '_subtabstate');
      }
      $thisTab.addClass('active');

      if (null != subtabState && $thisTab.find('#' + subtabState).length > 0) {
        $thisTab
          .find('#' + subtabState)
          .find('.SectionTitle')
          .click();
      } else {
        const $sectionTitle = $thisTab.find(
          '.SubSection.DefaultActive .SectionTitle'
        );
        if ($sectionTitle.length > 0) {
          $sectionTitle.click();
        } else {
          $thisTab.find('.SectionTitle').click();
          $('.SubSection .SectionTitle').first().click(); // in case there are further nested tabs, click again...
        }
      }
      // save away in localstorage
      if (null != pageName && window.localStorage) {
        window.localStorage.setItem(pageName + '_tabstate', tabState);
        window.TrackTabClick(pageName, tabState);
      }
      return;
    }
  }
  // otherwise, fall through and choose the default active section
  $('.RootSection.DefaultActive .SectionTitle')
    .click()
    .find('.SubSection.DefaultActive .SectionTitle')
    .click();
}
