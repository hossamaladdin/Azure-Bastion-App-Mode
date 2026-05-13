// Single shell window. Bastion URLs that land in any tab are pulled into the shell as iframes.
//
// State (chrome.storage.session):
//   bastions:        [{ url, label, group }]
//   shellWindowId:   number — id of the singleton shell popup window

const STORAGE_KEY = "bastions";
const SHELL_KEY = "shellWindowId";

const BASTION_URL_PATTERNS = [
  /^https:\/\/[^/]+\.bastion\.azure\.com\//
];

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
      const w = await chrome.windows.get(id);
      if (w) {
        await chrome.windows.update(id, { focused: true, state: "normal" });
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
  return win.id;
}

async function addBastion({ url, label, group }) {
  const list = await getBastions();
  if (!list.find((b) => b.url === url)) {
    list.push({
      url,
      label: label || new URL(url).hostname,
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

// Catch bastion URLs the user opens in any tab and route them into the shell as fast as
// possible. We don't try to extract a meaningful title from the source tab — Azure sets
// the real <title> only after the page settles post-login. Instead we inject a
// MutationObserver into the iframe that lives in the shell window (same page, same lifecycle)
// and let it stream title updates back to us as they happen.
const handledTabs = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (handledTabs.has(tabId)) return;
  if (!tab.url || !isBastionUrl(tab.url)) return;
  if (tab.url.startsWith(chrome.runtime.getURL(""))) return;

  handledTabs.add(tabId);

  await addBastion({
    url: tab.url,
    label: new URL(tab.url).hostname, // placeholder; iframe observer will update
    group: "default"
  });

  try {
    const win = await chrome.windows.get(tab.windowId, { populate: true });
    if (win && win.tabs && win.tabs.length === 1) {
      await chrome.windows.remove(tab.windowId);
    } else {
      await chrome.tabs.remove(tabId);
    }
  } catch {}
});

chrome.tabs.onRemoved.addListener((tabId) => handledTabs.delete(tabId));

// When a bastion iframe inside the shell finishes loading, inject a title observer
// that pushes every title update back via runtime messaging.
chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (details.frameId === 0) return; // top frame, not our iframe
    if (!isBastionUrl(details.url)) return;
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
          setInterval(push, 750); // poll — robust against title-element replacement
        }
      })
      .catch(() => {});
  },
  { url: [{ hostSuffix: ".bastion.azure.com" }] }
);

async function updateBastionLabel(frameUrl, title) {
  if (!title) return;
  const looksLikeUrl =
    title === frameUrl || title.startsWith("http") || title.includes("bastion.azure.com");
  if (looksLikeUrl) return;

  // The iframe may have redirected since we registered the bastion, so the
  // frame's location.href no longer equals the stored URL. Fall back to host
  // matching (bst-{guid}.bastion.azure.com is the stable identifier).
  const list = await getBastions();
  let entry = list.find((b) => b.url === frameUrl);
  if (!entry) {
    try {
      const target = new URL(frameUrl);
      entry = list.find((b) => {
        try { return new URL(b.url).host === target.host; } catch { return false; }
      });
    } catch {}
  }
  if (!entry || entry.label === title) return;
  entry.label = title;
  await setBastions(list);
  broadcast({ type: "label-changed", url: entry.url, label: title });
}

// Open the shell when the user clicks the action icon.
chrome.action.onClicked.addListener(() => {
  ensureShellWindow();
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { [SHELL_KEY]: id } = await chrome.storage.session.get(SHELL_KEY);
  if (id === windowId) {
    // Closing the shell window ends the session — drop the bastion list so
    // the next launch starts fresh and doesn't resurrect old iframes.
    await chrome.storage.session.remove([SHELL_KEY, STORAGE_KEY]);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "iframeTitle") {
      await updateBastionLabel(msg.url, msg.title);
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
    }
  })();
  return true;
});
