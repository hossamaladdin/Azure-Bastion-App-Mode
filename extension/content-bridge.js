// ISOLATED-world bridge for content.js. MAIN-world content scripts can call
// chrome.runtime.sendMessage in some Chrome contexts but not others — when it
// fails it throws "Error in invocation of runtime.sendMessage … called from
// a webpage must specify an Extension ID". The robust pattern is the same
// as bastion-bridge.js: MAIN world posts a window message, ISOLATED world
// relays via chrome.runtime.

(function () {
  "use strict";
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data.__bastion_content_bridge__ !== true) return;
    const msg = e.data.msg;
    if (!msg) return;
    chrome.runtime.sendMessage(msg).catch(() => {});
  });
})();
