// Intercept Bastion link/window.open requests in Azure Portal and ask the
// background script to open them as a popup window directly. This avoids
// loading the URL in a normal tab and then moving it, which races against
// Bastion's initial handshake and invalidates the session on macOS.
(function() {
  'use strict';

  const BASTION_REGEX = /^https:\/\/bst-[a-f0-9-]+\.bastion\.azure\.com\//i;

  console.log('Azure Bastion App Mode: content script loaded on', window.location.href);

  function isBastionUrl(url) {
    return url && (typeof url === 'string') && BASTION_REGEX.test(url);
  }

  // Stub Window-like object returned from intercepted window.open calls,
  // so callers that touch the return value (focus(), .closed, etc.) don't crash.
  function stubWindow() {
    return {
      closed: false,
      close() { this.closed = true; },
      focus() {},
      blur() {},
      postMessage() {}
    };
  }

  function requestPopup(url) {
    try {
      chrome.runtime.sendMessage({ action: 'openBastionPopup', url });
    } catch (e) {
      // Extension context invalidated (e.g. just reloaded). Fall back to
      // a plain window.open so the user isn't left without a connection.
      console.warn('sendMessage failed, falling back to window.open:', e);
      const w = screen.availWidth, h = screen.availHeight;
      originalOpen.call(
        window,
        url,
        '_blank',
        `popup=yes,width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`
      );
    }
  }

  const originalOpen = window.open;
  window.open = function(url, target, features) {
    if (isBastionUrl(url)) {
      console.log('Azure Bastion App Mode: intercepted window.open ->', url);
      requestPopup(url);
      return stubWindow();
    }
    return originalOpen.call(window, url, target, features);
  };

  // Also intercept direct link clicks where href is a Bastion URL.
  document.addEventListener('click', function(e) {
    let target = e.target;
    let depth = 0;
    while (target && target.tagName !== 'A' && depth < 10) {
      target = target.parentElement;
      depth++;
    }

    if (target && target.href && isBastionUrl(target.href)) {
      console.log('Azure Bastion App Mode: intercepted click ->', target.href);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      requestPopup(target.href);
    }
  }, true);

  console.log('Azure Bastion App Mode: setup complete');
})();
