# Azure Bastion App Mode — Chrome Extension

**Single-window Azure Bastion workspace.** Every shareable-link Bastion connection lives as a tab-less view inside one app-mode window, with an auto-hiding sidebar to switch between them.

## Version: 3.0 (Single-Window Shell)

No more juggling Chrome windows. No more taskbar pollution. Click a bastion link → it lands as an iframe inside the shell, side-by-side with everything else you have open. Keyboard shortcuts go to the bastion content, not the wrapper.

---

## 📁 Folder Structure

```
Azure-Bastion-App-Mode/
├── extension/                  ← Load this folder in Chrome
│   ├── manifest.json           (MV3)
│   ├── background.js           (service worker — routes bastions into the shell)
│   ├── shell.html              (the single window's UI)
│   ├── shell.css               (sidebar + iframe stack styling)
│   ├── shell.js                (sidebar logic, iframe management)
│   ├── rules.json              (DNR rules — strip X-Frame-Options / CSP / COOP / COEP)
│   └── icons/                  (Azure Bastion icon, multiple sizes)
│
└── helpers/                    ← Development tools
    └── …
```

---

## 🚀 Quick Install

1. Open Chrome (or any Chromium browser — Edge, Comet, etc.): `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Click a Bastion shareable-URL — the shell window opens with it inside

---

## ✨ Features

- ✅ **One window total.** Every bastion is an iframe inside a single app-mode popup. No new Chrome window per connection, no taskbar entry per bastion.
- ✅ **Auto-hiding sidebar.** Hover the left edge to slide it in; leave for 400 ms and it slides back out. Pinnable.
- ✅ **Auto-switch on open.** Clicking a `.desktop` launcher / bookmark routes the new bastion in and brings it to the front.
- ✅ **Title self-heals.** A `MutationObserver` watches each iframe's `<title>` and updates the sidebar label as soon as Azure sets the real resource name (post-redirect / post-login).
- ✅ **Window title tracks the active bastion** — the OS title bar and your taskbar entry show whatever you're currently looking at.
- ✅ **Official Azure Bastion icon.**

---

## 🔧 How It Works

### Architecture

1. **Background service worker** (`background.js`) listens for any tab loading a `*.bastion.azure.com` URL.
2. Adds it to a session-scoped bastion list, then closes the source tab — or the whole window if it was launched just for that URL.
3. Opens (or focuses) the single shell window: a popup-type Chrome window with no tab strip and no address bar, loading `shell.html`.
4. The shell creates an `<iframe>` per bastion, stacked in the same container; only the active one is visible (z-index swap, others stay mounted so WebSocket sessions survive switching).
5. `declarativeNetRequest` strips `X-Frame-Options`, `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, and `Cross-Origin-Embedder-Policy` from `bastion.azure.com` responses so the iframe is allowed to load.
6. `webNavigation.onCompleted` fires for each iframe load → a `chrome.scripting.executeScript` injection installs a `setInterval` polling `document.title` inside the iframe and reports every change back to the background, which updates the sidebar label live.

### URL pattern

```
https://*.bastion.azure.com/*
```

Specifically the shareable-link form: `https://bst-{guid}.bastion.azure.com/api/shareable-url/{guid}`.

### Keyboard handling

When the **shell** has focus, the following are intercepted and routed to the active iframe:

- **F5 / Ctrl+R** — reload the active bastion only (via `iframe.src = iframe.src`)
- **Ctrl+W** — close the active bastion only (not the whole window)
- **Ctrl+Tab / Ctrl+Shift+Tab** — cycle bastions

Once the bastion iframe takes focus, the browser owns the shortcuts again. Use the sidebar's `↻` / `×` controls in that case.

---

## 🧪 Testing

1. Reload the extension at `chrome://extensions/`.
2. Open any Bastion shareable-link (a `.desktop` launcher with `URL=https://bst-…bastion.azure.com/…`, a bookmark, a click from Outlook — anything).
3. The shell window opens; the bastion loads inside.
4. Click a second bastion link — it auto-switches to the new one. Hover the left edge for the sidebar.

---

## 📦 Distribution

### Load unpacked (recommended for personal use)
- Share the `extension/` folder; users load it via `chrome://extensions/` → **Load unpacked**.

### Packaged ZIP
- Zip the `extension/` folder. Recipients unzip and load unpacked. (Chrome won't install a `.zip` directly; `.crx` sideload is blocked since Chrome 67.)

### Chrome Web Store
- Zip the `extension/` folder and upload to the [Developer Console](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).

---

## 🛠️ Development

Modify files in `extension/`, then click the reload button in `chrome://extensions/`.

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

- **v3.0** — Single-window shell. Stacked iframes, auto-hiding sidebar, live title sync, Azure Bastion icon, MV3.
- **v2.3** — Universal regex for any Bastion instance (last multi-window release).
- **v2.x** — Hybrid tab-mover + content-script.
- **v1.x** — Initial versions (deprecated).

---

## 🐛 Troubleshooting

**Bastion iframe shows blank / refuses to load**
- Open the shell window's DevTools (right-click → Inspect inside the shell), check the Console for iframe load errors.
- If Azure has added new framing protections, the DNR ruleset in `rules.json` may need updating.

**Sidebar stays stuck open**
- Move the cursor off the panel; the slide-out has a 400 ms delay before it starts.
- If pinned (`📍` icon), click the pin button to unpin.

**Wrong / generic label in the sidebar**
- The label is the iframe's `document.title`. Initial title is often `Azure Bastion`; once the connection establishes, Azure updates it to the resource name. If your bastion page never sets a real title, the hostname (`bst-…`) is used as a fallback.

**Source tab doesn't auto-close**
- The window-close logic only closes the source window if it has exactly one tab. If Chrome was already running and the URL opened in a tab alongside others, only that tab is closed (your other tabs stay).

---

## 🤝 Contributing

To contribute:
1. Fork the repo
2. Make changes under `extension/`
3. Reload the unpacked extension in Chrome and test
4. Submit a pull request

---

**Made with ❤️ for Azure admins who want cleaner Bastion connections.**
