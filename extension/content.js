// Source-side capture, MAIN world, document_start, on *.azure.com (except
// bastion subdomains themselves).
//
// We hook ONLY window.open — that's the path the Azure portal uses to spawn
// Bastion sessions. We do NOT preventDefault on link clicks: that was
// suppressing normal click navigation when the shell window failed to come
// to the foreground (Linux focus-stealing prevention), making it look like
// "the link did nothing". Bastion URLs reached via plain navigation are
// picked up by background's tabs.onUpdated handler instead — same outcome,
// no user-visible click suppression.
//
// What this hook does for spawned Bastion sessions:
//   1. captures the URL via window.open(URL) and asks background to add it
//      to the shell (the iframe is the sole consumer — no token race);
//   2. returns a permissive stub so the source page's surrounding code
//      survives the missing real popup;
//   3. captures any postMessage the source page sends to the "popup" and
//      forwards it as a bastion-handshake — the shell iframe replays it as
//      a synthetic MessageEvent so bastion gets the auth it was expecting.

(function () {
  "use strict";

  const BASTION_REGEX = /^https:\/\/[^/]+\.bastion\.azure\.com\//i;

  function isBastionUrl(url) {
    return !!url && typeof url === "string" && BASTION_REGEX.test(url);
  }

  function tryClone(v) {
    try { return structuredClone(v); } catch {
      try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
    }
  }

  // MAIN-world scripts can't reliably call chrome.runtime.sendMessage —
  // Chrome treats some call sites as page-side and demands an Extension ID.
  // Bridge via the ISOLATED-world content-bridge.js instead.
  function relay(msg) {
    window.postMessage(
      { __bastion_content_bridge__: true, msg },
      location.origin
    );
  }

  function sendOpen(url) {
    relay({ type: "addBastion", url });
    console.log("[bastion-ext] captured →", url);
  }

  function sendHandshake(host, data) {
    const cloned = tryClone(data);
    if (cloned === null) return;
    relay({
      type: "bastion-handshake",
      payload: { host, data: cloned, origin: location.origin }
    });
    console.log("[bastion-ext] stub.postMessage captured for", host);
  }

  // Time window during which we forward postMessages from this stub.
  // Anything later is treated as teardown/cleanup the source page sends to
  // its now-stale "popup" reference when a new bastion is opened — replaying
  // those into the existing iframe would disconnect a working session.
  const STUB_FORWARD_MS = 5000;

  function stubWindow(url) {
    const host = new URL(url).host;
    const created = Date.now();
    let closed = false;
    const loc = { href: url, origin: "https://" + host, replace() {}, assign() {} };
    const stub = {
      get closed() { return closed; },
      close() { closed = true; },
      focus() {},
      blur() {},
      postMessage(data, _targetOrigin, _transfer) {
        if (Date.now() - created > STUB_FORWARD_MS) {
          console.debug("[bastion-ext] stub stale, ignoring postMessage for", host);
          return;
        }
        sendHandshake(host, data);
      },
      location: loc,
      document: {},
      opener: window
    };
    return new Proxy(stub, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => {};
      },
      set(target, prop, val) {
        try { target[prop] = val; } catch {}
        return true;
      }
    });
  }

  const originalOpen = window.open;
  window.open = function (url, target, features) {
    if (isBastionUrl(url)) {
      console.log("[bastion-ext] window.open intercepted:", url);
      sendOpen(url);
      return stubWindow(url);
    }
    return originalOpen.call(window, url, target, features);
  };

  console.log("[bastion-ext] content hook installed at", location.href);
})();
