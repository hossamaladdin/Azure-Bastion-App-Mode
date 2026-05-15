// Single shell window. Bastion URLs are mounted in it as stacked iframes.
//
// State (chrome.storage.session):
//   bastions:        [{ url, label, group }]
//   shellWindowId:   number — id of the singleton shell popup window
//
// Spawned vs shareable
// --------------------
// Spawned sessions are created when an Azure page calls
//   popup = window.open(bastionUrl)
//   popup.postMessage(authConfig, "https://bst-XXX.bastion.azure.com")
// That postMessage is what carries the auth context that takes bastion
// straight to the VM — no login screen. If we just rip the popup tab and
// load the URL fresh in a shell iframe, the iframe has no opener and
// nothing ever delivers the postMessage. Blank page.
//
// So for every spawned Bastion popup that arrives as a tab, we:
//   - register the URL in the shell so the iframe mounts and starts loading;
//   - leave the source popup ALIVE long enough for bastion's own startup to
//     post "ready" to the opener and receive the auth config back;
//   - bastion-hook.js (running inside the popup) captures the inbound
//     message and forwards it here via bastion-bridge.js;
//   - we buffer the payload by host and, once the shell iframe has loaded
//     (filtered to parentFrameId === 0 so internal Bastion sub-frames don't
//     hijack the ref), replay it as a synthetic MessageEvent into the iframe
//     with the original sender origin so bastion's origin check still passes.
// Then we close the source popup.
//
// Shareable / permanent links carry their auth in the URL and land on a
// login screen. No postMessage ever arrives, so the buffer stays empty and
// the safety timeout closes the source tab on its own.

const STORAGE_KEY = "bastions";
const SHELL_KEY = "shellWindowId";

const BASTION_URL_PATTERNS = [
  /^https:\/\/[^/]+\.bastion\.azure\.com\//
];

// One unified path for every Bastion URL — same as v2.3, which never
// distinguished spawned vs shareable. We always give the source tab a few
// seconds to potentially deliver a postMessage handshake to itself; if
// nothing arrives (shareable link / no opener), the safety timeout fires
// and we yank the source.
const HANDSHAKE_WAIT_MS = 5000;

const handshakeBuffer = new Map();     // host -> Array<{ data, origin }>
const pendingSourceClose = new Map();  // host -> { tabId, windowId }
const iframeRefs = new Map();          // host -> { tabId, frameId } (shell-side direct child only)
const authReplayed = new Set();        // hosts where initial auth was replayed; later messages are dropped
const frameToEntryUrl = new Map();     // frameId -> the entry URL the iframe was originally created with
let shellTabId = null;

function hostOf(url) {
  try { return new URL(url).host; } catch { return null; }
}

function isBastionUrl(url) {
  return !!url && BASTION_URL_PATTERNS.some((re) => re.test(url));
}

async function getBastions() {
  const { [STORAGE_KEY]: list } = await chrome.storage.session.get(STORAGE_KEY);
  return Array.isArray(list) ? list : [];
}

async function setBastions(list) {
  await chrome.storage.session.set({ [STORAGE_KEY]: list });
}

async function ensureShellWindow() {
  const { [SHELL_KEY]: id } = await chrome.storage.session.get(SHELL_KEY);
  if (id) {
    try {
      const w = await chrome.windows.get(id, { populate: true });
      if (w) {
        if (w.tabs && w.tabs[0]) shellTabId = w.tabs[0].id;
        // Focus only — never touch size/position/state, otherwise the shell
        // window snaps back to default dimensions on each new bastion.
        await chrome.windows.update(id, { focused: true });
        return id;
      }
    } catch {}
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("shell.html"),
    type: "popup",
    focused: true,
    width: 1400,
    height: 900
  });
  await chrome.storage.session.set({ [SHELL_KEY]: win.id });
  if (win.tabs && win.tabs[0]) shellTabId = win.tabs[0].id;
  return win.id;
}

async function addBastion({ url, label, group }) {
  if (!isBastionUrl(url)) return;
  console.log("[bastion-ext] addBastion:", url);
  const list = await getBastions();
  if (!list.find((b) => b.url === url)) {
    list.push({
      url,
      label: label || hostOf(url) || url,
      group: group || "default"
    });
    await setBastions(list);
  }
  await ensureShellWindow();
  broadcast({ type: "bastions-changed" });
}

async function removeBastion(url) {
  const list = (await getBastions()).filter((b) => b.url !== url);
  await setBastions(list);
  broadcast({ type: "bastions-changed" });
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, msg).catch(() => {});
    }
  });
}

const handledTabs = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (handledTabs.has(tabId)) return;
  if (!tab.url || !isBastionUrl(tab.url)) return;
  if (tab.url.startsWith(chrome.runtime.getURL(""))) return;

  handledTabs.add(tabId);

  const host = hostOf(tab.url);
  if (host) handshakeBuffer.delete(host);

  await addBastion({
    url: tab.url,
    label: host || tab.url,
    group: "default"
  });

  // Same path for every bastion tab. Keep the source alive briefly so
  // bastion's startup can finish exchanging messages with its opener (if
  // any) and we can capture them via bastion-hook. If a handshake arrives
  // before the timeout, closeSource() runs immediately from the handler.
  if (host) {
    pendingSourceClose.set(host, { tabId, windowId: tab.windowId });
    setTimeout(() => closeSource(host), HANDSHAKE_WAIT_MS);
  }
});

async function closeSource(host) {
  const ref = pendingSourceClose.get(host);
  if (!ref) return;
  pendingSourceClose.delete(host);
  try {
    const win = await chrome.windows.get(ref.windowId, { populate: true });
    if (win && win.tabs && win.tabs.length === 1) {
      await chrome.windows.remove(ref.windowId);
    } else {
      await chrome.tabs.remove(ref.tabId);
    }
  } catch {}
}

chrome.tabs.onRemoved.addListener((tabId) => handledTabs.delete(tabId));

// Fired for every navigation completion under .bastion.azure.com. We want
// only the *outer* iframe — the one that's a direct child of the shell tab's
// top frame. Bastion mounts its own internal sub-frames at the same host
// inside our iframe; if we don't filter those, iframeRefs[host] gets
// overwritten to a nested frame and subsequent handshake replays land in
// the wrong place (consecutive sessions go blank).
chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (details.frameId === 0) return;
    if (details.parentFrameId !== 0) return; // only direct children of shell's top frame
    if (!isBastionUrl(details.url)) return;
    if (shellTabId === null || details.tabId !== shellTabId) return;

    const host = hostOf(details.url);
    if (host) {
      iframeRefs.set(host, { tabId: details.tabId, frameId: details.frameId });
      // First-seen URL for this frame is the closest thing we have to the
      // entry URL it was created with (a later in-bastion redirect would
      // change details.url, but onCompleted's first fire for a frame is the
      // initial navigation outcome).
      if (!frameToEntryUrl.has(details.frameId)) {
        frameToEntryUrl.set(details.frameId, details.url);
      }
      const buffered = handshakeBuffer.get(host);
      if (buffered && buffered.length && !authReplayed.has(host)) {
        replayHandshake(details.tabId, details.frameId, buffered);
        authReplayed.add(host);
      }
    }

    chrome.scripting
      .executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        func: () => {
          if (window.__bsTitleWatcher) return;
          window.__bsTitleWatcher = true;
          let last = "";
          const push = () => {
            if (document.title === last) return;
            last = document.title;
            chrome.runtime
              .sendMessage({
                type: "iframeTitle",
                url: location.href,
                title: last
              })
              .catch(() => {});
          };
          push();
          setInterval(push, 750);
        }
      })
      .catch(() => {});
  },
  { url: [{ hostSuffix: ".bastion.azure.com" }] }
);

function replayHandshake(tabId, frameId, entries) {
  if (!entries || !entries.length) return;
  console.log("[bastion-ext] replay → tab", tabId, "frame", frameId, "entries", entries.length);
  chrome.scripting
    .executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      func: (msgs) => {
        const dispatch = (sourceVariant) => {
          for (const m of msgs) {
            try {
              const evt = new MessageEvent("message", {
                data: m.data,
                origin: m.origin || "",
                source: sourceVariant,
                lastEventId: "",
                ports: []
              });
              window.dispatchEvent(evt);
            } catch (e) {
              console.warn("[bastion-ext] dispatch failed:", e);
            }
          }
        };
        console.log("[bastion-ext] replaying", msgs.length, "msg(s) into", location.href);
        // Single dispatch with two source variants — one with source=null
        // (matches `e.source !== window.opener` checks since opener is also
        // null in the iframe after spoofing) and one with source=window
        // (now that window.parent is spoofed to window itself). Retrying
        // would cause bastion to re-init and redirect-hop.
        dispatch(null);
        dispatch(window);
      },
      args: [entries]
    })
    .catch((e) => console.warn("[bastion-ext] replay failed:", e));
}

async function updateBastionLabel(frameUrl, title, sender) {
  if (!title) return;
  const looksLikeUrl =
    title === frameUrl || title.startsWith("http") || title.includes("bastion.azure.com");
  if (looksLikeUrl) return;

  const list = await getBastions();

  // Best: disambiguate by frame id. The first-seen URL for a frame is the
  // entry URL it was created with, even if bastion has since redirected.
  let entry = null;
  if (sender && typeof sender.frameId === "number") {
    const entryUrl = frameToEntryUrl.get(sender.frameId);
    if (entryUrl) entry = list.find((b) => b.url === entryUrl);
  }
  if (!entry) entry = list.find((b) => b.url === frameUrl);
  if (!entry) {
    try {
      const target = new URL(frameUrl);
      const sameHost = list.filter((b) => {
        try { return new URL(b.url).host === target.host; } catch { return false; }
      });
      if (sameHost.length === 1) entry = sameHost[0];
    } catch {}
  }
  if (!entry || entry.label === title) return;
  console.log("[bastion-ext] label", entry.url.slice(0, 60), "→", title);
  entry.label = title;
  await setBastions(list);
  broadcast({ type: "label-changed", url: entry.url, label: title });
}

chrome.action.onClicked.addListener(() => {
  ensureShellWindow();
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { [SHELL_KEY]: id } = await chrome.storage.session.get(SHELL_KEY);
  if (id === windowId) {
    await chrome.storage.session.remove([SHELL_KEY, STORAGE_KEY]);
    handshakeBuffer.clear();
    iframeRefs.clear();
    pendingSourceClose.clear();
    handledTabs.clear();
    authReplayed.clear();
    frameToEntryUrl.clear();
    shellTabId = null;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg) {
      sendResponse({ ok: false });
      return;
    }
    if (msg.type === "iframeTitle") {
      await updateBastionLabel(msg.url, msg.title, sender);
      sendResponse({ ok: true });
    } else if (msg.type === "list") {
      sendResponse(await getBastions());
    } else if (msg.type === "addBastion") {
      await addBastion(msg);
      sendResponse({ ok: true });
    } else if (msg.type === "removeBastion") {
      await removeBastion(msg.url);
      sendResponse({ ok: true });
    } else if (msg.type === "openShell") {
      const id = await ensureShellWindow();
      sendResponse({ ok: true, windowId: id });
    } else if (msg.type === "bastion-popup-detected") {
      // Informational ack — the deferred-close decision happens in
      // tabs.onUpdated based on whether the source is its own window.
      sendResponse({ ok: true });
    } else if (msg.type === "bastion-handshake") {
      const { host, data, origin } = msg.payload || {};
      if (host) {
        // Drop messages that arrive after we've already replayed the initial
        // auth — those are typically teardown/cleanup notifications the
        // source page sends to the old "popup" reference when a new one is
        // opened, and replaying them into the old iframe disconnects it.
        if (authReplayed.has(host)) {
          console.log("[bastion-ext] dropping post-auth message for", host);
          sendResponse({ ok: true });
          return;
        }
        const entry = { data, origin: origin || "" };
        if (!handshakeBuffer.has(host)) handshakeBuffer.set(host, []);
        handshakeBuffer.get(host).push(entry);
        const ref = iframeRefs.get(host);
        if (ref) {
          replayHandshake(ref.tabId, ref.frameId, [entry]);
          authReplayed.add(host);
        }
        // Opener has had its chance — close the source popup.
        closeSource(host);
      }
      sendResponse({ ok: true });
    }
  })();
  return true;
});
