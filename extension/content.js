// Intercept Bastion link clicks and open in app-style window
(function() {
  'use strict';

  // Universal pattern - matches ALL Azure Bastion instances
  const BASTION_REGEX = /^https:\/\/bst-[a-f0-9-]+\.bastion\.azure\.com\//i;

  console.log('🔵 Azure Bastion App Mode: Content script loaded on', window.location.href);

  // Helper function to check if URL is a Bastion URL
  function isBastionUrl(url) {
    return url && (typeof url === 'string') && BASTION_REGEX.test(url);
  }

  // Override window.open IMMEDIATELY before any other scripts run
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    console.log('🔵 window.open called with URL:', url);

    if (isBastionUrl(url)) {
      console.log('🟢 INTERCEPTED! Opening Bastion URL in popup:', url);

      const width = screen.availWidth;
      const height = screen.availHeight;

      const popup = originalOpen.call(
        window,
        url,
        '_blank',
        `popup=yes,width=${width},height=${height},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`
      );

      console.log('🟢 Popup opened successfully');
      return popup;
    }

    return originalOpen.call(window, url, target, features);
  };

  // Also intercept link clicks
  document.addEventListener('click', function(e) {
    let target = e.target;

    // Walk up the DOM to find a link
    let depth = 0;
    while (target && target.tagName !== 'A' && depth < 10) {
      target = target.parentElement;
      depth++;
    }

    // Check if it's a Bastion link
    if (target && target.href && isBastionUrl(target.href)) {
      console.log('🟢 INTERCEPTED CLICK! Bastion link:', target.href);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const width = screen.availWidth;
      const height = screen.availHeight;

      window.open(
        target.href,
        '_blank',
        `popup=yes,width=${width},height=${height},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`
      );
    }
  }, true);

  console.log('🔵 Azure Bastion App Mode: Setup complete');
})();
