// Runs in the page's MAIN world on every *.bastion.azure.com frame. Two
// branches depending on whether we're top-level or in the shell iframe.

(function () {
  "use strict";

  const isIframe = window.top !== window;

  if (isIframe) {
    // Inside the shell iframe. Two reasons bastion might refuse to render here:
    //   (a) framebusting: top !== self → app refuses to run when framed.
    //   (b) opener === null → app crashes calling opener.postMessage("ready").
    // Spoof what we can — `top` happens to be non-configurable in Chrome so
    // we can't redefine it; `parent` and `opener` usually take, which is
    // enough for bastion in practice. Errors are swallowed silently because
    // bastion still works without `top` being spoofed.
    const spoofs = [];
    const trySpoof = (name, value) => {
      try {
        Object.defineProperty(window, name, { get: () => value, configurable: true });
        spoofs.push(name);
      } catch {}
    };

    trySpoof("top", window);
    trySpoof("parent", window);

    const fakeOpener = {
      postMessage(data) {
        console.debug("[bastion-ext] iframe→opener swallowed:", typeof data === "string" ? data : "(object)");
      },
      closed: false,
      focus() {},
      blur() {},
      close() {}
    };
    trySpoof("opener", fakeOpener);

    console.log("[bastion-ext] iframe spoofs applied:", spoofs.join(", "), "@", location.href);
    return;
  }

  // Top-level path: this is a real popup (window.open landed a tab here
  // because content.js didn't get a chance to intercept on the source side,
  // or because the source page wasn't *.azure.com). Capture inbound
  // postMessages so the service worker can replay them into the shell iframe.

  let hasOpener = false;
  try {
    hasOpener = !!window.opener;
  } catch {
    hasOpener = true;
  }
  if (!hasOpener) return;

  function send(kind, payload) {
    window.postMessage(
      { __bastion_bridge__: true, kind, payload },
      location.origin
    );
  }

  function tryClone(v) {
    try { return structuredClone(v); } catch {
      try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
    }
  }

  send("popup-detected", { host: location.host, url: location.href });

  window.addEventListener(
    "message",
    (e) => {
      if (e.source === window) return;
      if (e.origin === location.origin) return;
      const cloned = tryClone(e.data);
      if (cloned === null) return;
      send("handshake", {
        host: location.host,
        data: cloned,
        origin: e.origin || ""
      });
    },
    true
  );

  console.log("[bastion-ext] popup hook installed at", location.href);
})();
