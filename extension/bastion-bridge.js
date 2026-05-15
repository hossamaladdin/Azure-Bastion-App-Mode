// ISOLATED-world bridge for bastion-hook.js. MAIN-world content scripts can't
// call chrome.runtime.* directly; bastion-hook posts a window-targeted message
// that we pick up here and relay to the service worker.

(function () {
  "use strict";
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.__bastion_bridge__ !== true) return;
    const { kind, payload } = e.data;
    chrome.runtime
      .sendMessage({ type: "bastion-" + kind, payload })
      .catch(() => {});
  });
})();
