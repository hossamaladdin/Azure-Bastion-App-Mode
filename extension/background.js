// Open Bastion URLs directly in a popup window from the moment they're requested.
// We avoid moving an already-loading tab — that race lets Bastion's initial
// handshake (token consumption / WebSocket setup) start in a normal tab and
// then get torn down by the move, which invalidates the session on macOS.
const BASTION_REGEX = /^https:\/\/bst-[a-f0-9-]+\.bastion\.azure\.com\//i;

async function getPrimaryWorkArea() {
  try {
    const displays = await chrome.system.display.getInfo();
    const primary = displays.find(d => d.isPrimary) || displays[0];
    if (primary && primary.workArea) {
      return primary.workArea;
    }
  } catch (e) {
    console.warn('system.display unavailable, falling back to defaults:', e);
  }
  return { left: 0, top: 0, width: 1280, height: 800 };
}

async function openBastionPopup(url, sourceTabId) {
  const workArea = await getPrimaryWorkArea();
  await chrome.windows.create({
    url,
    type: 'popup',
    focused: true,
    left: workArea.left,
    top: workArea.top,
    width: workArea.width,
    height: workArea.height
  });

  // If Azure Portal also opened a placeholder tab for the same navigation
  // (e.g. via target=_blank), close it so the user isn't left with a stub.
  if (typeof sourceTabId === 'number') {
    try {
      const t = await chrome.tabs.get(sourceTabId);
      if (t && t.url && BASTION_REGEX.test(t.url)) {
        chrome.tabs.remove(sourceTabId).catch(() => {});
      }
    } catch (_) { /* tab gone */ }
  }
}

// Primary path: content script tells us a Bastion URL is being requested.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== 'openBastionPopup' || !msg.url) return;
  if (!BASTION_REGEX.test(msg.url)) return;

  const sourceTabId = sender && sender.tab ? sender.tab.id : undefined;
  openBastionPopup(msg.url, sourceTabId).catch(err =>
    console.error('Failed to open Bastion popup:', err)
  );
  sendResponse({ ok: true });
  return false;
});

// Fallback: if a Bastion URL still ends up in a normal tab somehow
// (e.g. opened by a flow our content script couldn't intercept), redirect
// it into a fresh popup before the page progresses too far. We act on the
// 'loading' state so we get there before the handshake finishes.
const handledTabs = new Set();
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab || !tab.url || !BASTION_REGEX.test(tab.url)) return;
  if (handledTabs.has(tabId)) return;

  try {
    const win = await chrome.windows.get(tab.windowId);
    if (win.type === 'popup') {
      handledTabs.add(tabId);
      return;
    }
  } catch (_) { return; }

  handledTabs.add(tabId);
  const url = tab.url;
  // Close the stray tab and open a fresh popup at the same URL.
  // The token in the URL hasn't been consumed yet because we're catching
  // the very first navigation event.
  try {
    await chrome.tabs.remove(tabId);
  } catch (_) { /* ignore */ }
  openBastionPopup(url).catch(err =>
    console.error('Fallback popup open failed:', err)
  );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handledTabs.delete(tabId);
});

console.log('Azure Bastion App Mode v2.5 (Universal): Background script loaded');
