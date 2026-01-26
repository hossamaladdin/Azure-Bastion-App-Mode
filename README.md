# Azure Bastion App Mode - Chrome Extension

**Universal Chrome extension that automatically opens ALL Azure Bastion connections in app mode with minimal borders.**

## Version: 2.3 (Universal)

Works with **ANY Azure subscription** and **ANY Bastion instance**!

Pattern: `https://bst-{any-guid}.bastion.azure.com/`

---

## 📁 Folder Structure

```
Azure-Bastion-App-Mode/
├── extension/              ← Install this folder in Chrome
│   ├── manifest.json      (v2.3 - Universal support)
│   ├── background.js      (Tab mover with regex pattern)
│   ├── content.js         (window.open interceptor)
│   ├── icon*.png          (Extension icons)
│   └── README.txt         (User documentation)
│
└── helpers/               ← Development tools
    ├── create-icons.ps1   (Generate extension icons)
    ├── generate-icons.html (Icon generator UI)
    ├── package-extension.ps1 (Create .zip for distribution)
    └── PACKAGING-INSTRUCTIONS.txt
```

---

## 🚀 Quick Install

1. Open Chrome: `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Done!

---

## ✨ Features

- ✅ Works with **ALL Azure Bastion instances** (any subscription, any account)
- ✅ Automatic popup window with minimal borders
- ✅ Preserves authentication and session
- ✅ No infinite loops
- ✅ Zero configuration needed

---

## 🔧 How It Works

The extension uses a **universal regex pattern** to match any Azure Bastion URL:

```javascript
/^https:\/\/bst-[a-f0-9-]+\.bastion\.azure\.com\//i
```

This matches URLs like:
- `https://bst-e021affb-8ee4-460a-be3f-f153e775d3cd.bastion.azure.com/`
- `https://bst-12345678-abcd-efgh-ijkl-mnopqrstuvwx.bastion.azure.com/`
- Any other Bastion instance URL

When detected:
1. Background script waits for page to fully load
2. Moves the tab to a new popup window (preserves session)
3. Content script also intercepts `window.open()` calls as fallback

---

## 🧪 Testing

1. Reload the extension in Chrome
2. Go to Azure Portal
3. Connect to any VM via Bastion
4. Click "Open in new browser tab"
5. Watch it open in app mode automatically! 🎉

Test with different subscriptions to verify universal support.

---

## 📦 Distribution

### Option 1: Share Extension Folder
- Share the `extension/` folder with your team
- They load it as unpacked extension

### Option 2: Package as ZIP
- Use `helpers/package-extension.ps1` to create .zip
- Share the .zip file

### Option 3: Chrome Web Store
- Package as .zip
- Upload to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
- Publish (requires $5 one-time fee)

---

## 🛠️ Development

To modify the extension:

1. Edit files in `extension/` folder
2. Go to `chrome://extensions/`
3. Click reload button on the extension
4. Test your changes

### Regenerate Icons
```powershell
cd helpers
.\create-icons.ps1
```

### Package Extension
```powershell
cd helpers
.\package-extension.ps1
```

---

## 📋 Version History

- **v2.3** - Universal support for ALL Azure Bastion instances (regex pattern)
- **v2.2** - Stable version with session preservation
- **v2.1** - Fixed: Moves tab instead of recreating
- **v2.0** - Hybrid approach: background + content script
- **v1.x** - Initial versions (deprecated)

---

## 📄 License

Free to use and modify for personal or commercial use.

---

## 🐛 Troubleshooting

**Extension not working?**
- Check `chrome://extensions/` - ensure enabled
- Click refresh button to reload extension
- Refresh Azure Portal page

**Session errors?**
- Should be fixed in v2.3
- If still broken, file an issue

**Wrong Bastion URL pattern?**
- Edit `extension/background.js` line 3 (BASTION_REGEX)
- Edit `extension/content.js` line 6 (BASTION_REGEX)
- Reload extension

---

## 🤝 Contributing

This extension is maintained in the [SQL-Toolkit](https://github.com/hossamaladdin/SQL-ToolKit) repository.

To contribute:
1. Fork the repo
2. Make changes in `Azure-Bastion-App-Mode/extension/`
3. Test thoroughly
4. Submit a pull request

---

**Made with ❤️ for Azure admins who want cleaner Bastion connections**
