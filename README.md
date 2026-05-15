# Azure Bastion App Mode — Chrome Extension

**Single-window Azure Bastion workspace.** Every Bastion connection — shareable link *or* portal-spawned — lives as a tab-less view inside one app-mode window, with an auto-hiding sidebar to switch between them.

## Version: 3.1.0 (Handshake)

No more juggling Chrome windows. No more taskbar pollution. Click a Bastion link → it lands as an iframe inside the shell, side-by-side with everything else. Spawned sessions (the kind the Azure portal opens via `window.open` and finishes authenticating via `postMessage`) now work in the shell iframe too — their auth handshake is captured at the source page and replayed inside the iframe.

---

## 📁 Folder Structure

```
Azure-Bastion-App-Mode/
└── extension/                  ← Source — load this folder in Chrome (Load unpacked)
    ├── manifest.json           (MV3)
    ├── background.js           (service worker — routes bastions into the shell + handshake replay)
    ├── content.js              (MAIN-world on *.azure.com — hooks window.open, captures spawned URL + auth postMessages)
    ├── content-bridge.js       (ISOLATED-world bridge — relays content.js's window messages to the service worker)
    ├── bastion-hook.js         (MAIN-world on *.bastion.azure.com — iframe-side framing spoofs + popup-side capture fallback)
    ├── bastion-bridge.js       (ISOLATED-world bridge for bastion-hook)
    ├── shell.html              (the single window's UI)
    ├── shell.css               (sidebar + iframe stack styling)
    ├── shell.js                (sidebar logic, iframe management)
    ├── rules.json              (DNR rules — strip X-Frame-Options / CSP / COOP / COEP)
    └── icons/                  (Azure Bastion icon, multiple sizes)
```

---

## 🚀 Install

1. Clone or download this repo.
2. Open Chrome (or any Chromium browser — Edge, Brave, etc.): `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `extension/` folder.
5. Open a Bastion shareable URL or click "Bastion" from a VM page in the Azure portal — the shell window opens and the session lands inside.

---

## ✨ Features

- ✅ **One window total.** Every bastion is an iframe inside a single app-mode popup.
- ✅ **Works for both Bastion flavors:**
  - **Shareable links** load straight into the shell iframe (URL has the full auth).
  - **Spawned sessions** (Azure portal → "Bastion" → "Connect") have their `postMessage` auth handshake intercepted at the source page and replayed into the shell iframe so bastion can complete its login without a real popup.
- ✅ **Auto-hiding sidebar.** Hover the left edge to slide it in; pinnable.
- ✅ **Auto-switch on open.** New bastion → brought to front.
- ✅ **Title self-heals.** Each iframe's `<title>` polls back to the sidebar label as soon as Azure sets the real resource name post-redirect / post-login.
- ✅ **Independent same-host sessions.** Multiple VMs through the same bastion gateway don't clobber each other's labels (frame-id-based disambiguation).
- ✅ **Window title tracks the active bastion** — the OS title bar shows whatever you're currently looking at.
- ✅ **Official Azure Bastion icon.**

---

## 🔧 How It Works

### Two source paths, one destination

| Source | What the extension catches | Flow |
|---|---|---|
| **Shareable link** (URL bar paste, bookmark, link click from outside Azure) | The resulting tab via `chrome.tabs.onUpdated` | URL → `addBastion` → shell iframe loads it. Bastion shows its login page; user signs in there. |
| **Spawned session** (Azure portal `window.open(bastionUrl)` + follow-up `popup.postMessage(authConfig, ...)`) | `content.js` hooks `window.open` on `*.azure.com`; returns a stub whose `postMessage` is captured for 5 s. | URL → `addBastion` → shell iframe loads. Captured `postMessage` payloads are buffered and replayed as synthetic `MessageEvent`s inside the iframe so bastion's listener fires with the original sender origin intact. |

### Background plumbing

- `background.js` is the service worker. It tracks the shell window, the iframe-frame mapping (`frameId → entry URL`), and the per-host handshake buffer.
- `webNavigation.onCompleted` fires when a Bastion iframe finishes loading. The handler is scoped to `tabId === shellTabId && parentFrameId === 0` so it only sees iframes that are direct children of the shell — bastion's own internal sub-frames don't pollute the iframe reference.
- On iframe load, any buffered handshake for that host is replayed as a synthetic `MessageEvent` (twice: with `source: null` and with `source: window`, to satisfy listeners checking either against `window.opener` or for a postable Window reference).
- `authReplayed` set prevents post-initial-auth handshake messages from being replayed into an existing session (which would otherwise disconnect old sessions when a new one is opened — the portal sends teardown postMessages to the old "popup" reference).

### Iframe-side spoofs

`bastion-hook.js` runs in MAIN world at `document_start` inside every Bastion frame. In the iframe context it spoofs `window.parent` and `window.opener` (and tries `window.top` — non-configurable in Chrome but harmless if it fails) so bastion's own framebust check (`window.top !== window.self`-style) passes and `window.opener.postMessage("ready", …)` calls land in a no-op stub instead of throwing on `null`.

### DNR rules

`rules.json` strips `X-Frame-Options`, `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, and `Cross-Origin-Embedder-Policy` from `*.bastion.azure.com` responses so iframe embedding is allowed.

### Keyboard handling

When the **shell** has focus:

- **F5 / Ctrl+R** — reload the active bastion only
- **Ctrl+W** — close the active bastion (not the whole window)
- **Ctrl+Tab / Ctrl+Shift+Tab** — cycle bastions

Once the bastion iframe takes focus, the browser owns the shortcuts again. Use the sidebar's `↻` / `×` controls in that case.

---

## 🧪 Testing

1. Reload the extension at `chrome://extensions/` (and hard-refresh any `*.azure.com` tabs so they pick up the new content scripts).
2. Try both flows:
   - Paste a Bastion shareable URL into your address bar → shell opens, iframe shows the login screen.
   - Open the Azure portal, navigate to a VM → Bastion → Connect → shell opens, iframe lands directly on the VM.
3. Open a second/third bastion — previous sessions should keep their state, sidebar should track them all.
4. Hover the left edge for the sidebar; click rows to switch.

---

## 🛠️ Development

Modify files in `extension/`, click the reload button in `chrome://extensions/`, **then hard-refresh any open `*.azure.com` or `*.bastion.azure.com` tabs** so the new content scripts inject (content scripts injected into a tab persist until that tab reloads).

### Regenerate icons

The icon source is `extension/icons/bastion.svg` (Microsoft's official Azure Bastion glyph). To regenerate PNGs:

```bash
cd extension/icons
for sz in 16 32 48 128; do
  google-chrome --headless --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --screenshot=icon-$sz.png --window-size=$sz,$sz \
    "file://$PWD/bastion.svg"
done
```

---

## 📋 Version History

- **v3.1.0** — Handshake replay for portal-spawned Bastion sessions. `content.js` captures `window.open` + follow-up `postMessage` on `*.azure.com`; `bastion-hook.js` spoofs `window.parent`/`opener` inside the shell iframe so bastion doesn't framebust; background buffers and replays the auth as a synthetic `MessageEvent`. Adds frame-id-based label disambiguation and `authReplayed` guard against teardown disconnects.
- **v3.0** — Single-window shell. Stacked iframes, auto-hiding sidebar, live title sync, Azure Bastion icon, MV3.
- **v2.3** — Universal regex for any Bastion instance (last multi-window release).
- **v2.x** — Hybrid tab-mover + content-script.
- **v1.x** — Initial versions (deprecated).

---

## 🐛 Troubleshooting

**Spawned session opens in a new tab in the main browser window instead of in the shell**
- Hard-refresh the Azure portal tab so the latest `content.js` is active. Content scripts loaded into a tab before the extension was updated keep running until that tab reloads.

**Bastion iframe shows blank**
- Open the shell window's DevTools (right-click inside the shell → Inspect), switch the top-bar context dropdown to the Bastion iframe, check Console + Network.
- Common causes: bastion couldn't reach its opener (the spoof didn't take), CSP/XFO not stripped (check `rules.json`), or the auth token in the URL was consumed twice (the source-page intercept didn't fire and the tab loaded the URL before the iframe did).

**Sidebar stays stuck open**
- Move the cursor off the panel; the slide-out has a 400 ms delay.
- If pinned (`📍`), click the pin button to unpin.

**Wrong / generic label in the sidebar**
- The label is the iframe's `document.title`. Initial title is often `Azure Bastion`; once the connection establishes, Azure updates it to the resource name. If your bastion page never sets a real title, the hostname (`bst-…`) is used as a fallback.

---

## 🤝 Contributing

To contribute:
1. Fork the repo
2. Make changes under `extension/`
3. Reload the unpacked extension in Chrome and test
4. Submit a pull request

---

**Made with ❤️ for Azure admins who want cleaner Bastion connections.**
