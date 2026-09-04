(function () {
  // Responsive navigation bar that transforms to dropdown menu on small screens
  // Note: not compiled so do not use ES5 features otherwise it will break in older browsers!

  // We want this load as soon as possible, this is why 'DOMContentLoaded' is used instead of 'load'
  window.addEventListener('DOMContentLoaded', function () {
    function toggleNav() {
      const primaryNav = document.querySelector('.primaryNav');
      if (!primaryNav) {
        return;
      } // for cases like the in-app login screen where the navbar is not shown

      if (primaryNav.className.indexOf('dropdown') !== -1) {
        return;
      }

      const nav = primaryNav.querySelector('nav');
      if (nav.className.indexOf('open') !== -1) {
        hideNav();
      } else {
        showNav();
      }
    }

    function showNav() {
      const nav = document.querySelector('.primaryNav nav');
      if (!nav) {
        return;
      } // for cases like the in-app login screen where the navbar is not shown

      if (nav.className.indexOf('open') < 0) nav.className += ' open';

      const main = document.querySelector('main');
      main.addEventListener('mousedown', hideNav);
    }

    function hideNav() {
      const nav = document.querySelector('.primaryNav nav');
      if (!nav) {
        return;
      } // for cases like the in-app login screen where the navbar is not shown

      nav.className = nav.className.replace(' open', '');

      const main = document.querySelector('main');
      main.removeEventListener('mousedown', hideNav);
    }

    function showSubNav() {
      hideSubNavs();
      const icon = this.querySelector('.chevron');
      if (icon) icon.style.transform = 'rotate(-180deg)';

      const parentName = this.getAttribute('data-label');
      const primaryNav = document.querySelector('.primaryNav');
      if (!primaryNav) {
        return;
      } // for cases like the in-app login screen where the navbar is not shown

      const subNav = primaryNav.querySelector(
        '.subNav[data-parent="' + parentName + '"]'
      );
      if (subNav.className.indexOf('open') < 0) subNav.className += ' open';

      const main = document.querySelector('main');
      main.addEventListener('mousemove', hideSubNavs, {once: true});
    }

    function hideSubNavs() {
      const primaryNav = document.querySelector('.primaryNav');
      if (!primaryNav) {
        return;
      } // for cases like the in-app login screen where the navbar is not shown

      const icon = primaryNav.querySelector('.dropdown .chevron');
      if (icon) icon.style.transform = 'rotate(0)';

      const subNavs = primaryNav.querySelectorAll('.subNav');
      let i;
      for (i = 0; i < subNavs.length; i++) {
        const subNav = subNavs[i];
        subNav.className = subNav.className.replace(' open', '');
      }
    }

    function setupNavEvents() {
      const primaryNav = document.querySelector('.primaryNav');
      if (!primaryNav) {
        return;
      } // for cases like the in-app login screen where the navbar is not shown

      primaryNav.addEventListener('click', toggleNav);

      const dropdownButtons = primaryNav.querySelectorAll('nav .dropdown');
      if (dropdownButtons) {
        for (let i = 0; i < dropdownButtons.length; i++) {
          dropdownButtons[i].addEventListener('click', showSubNav);
          dropdownButtons[i].addEventListener('mouseenter', showSubNav);
        }
      }
    }

    function adjustMenuType() {
      const primaryNav = document.querySelector('.primaryNav');
      if (!primaryNav) {
        return;
      } // for cases like the in-app login screen where the navbar is not shown

      const navList = primaryNav.querySelector('nav > ul');

      if (navList.style.position === 'absolute') {
        primaryNav.className += ' dropdown';
      } else {
        primaryNav.className = primaryNav.className.replace(' dropdown', '');
      }

      hideNav();
    }

    adjustMenuType();
    window.addEventListener('resize', adjustMenuType);

    setupNavEvents();
  });
})();
