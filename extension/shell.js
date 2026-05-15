// Single-window shell. Holds one iframe per bastion, swaps visibility on sidebar click.
// All iframes stay mounted so WebSocket sessions survive switching.

const STORAGE_KEY = "bastions";

const shellEl = document.getElementById("bastion-shell");
const viewsEl = shellEl.querySelector(".bs-views");
const groupsEl = shellEl.querySelector(".bs-groups");
const pinBtn = shellEl.querySelector(".bs-pin");
const addBtn = shellEl.querySelector(".bs-add");
const reloadBtn = shellEl.querySelector(".bs-reload");

const iframes = new Map(); // url -> iframe element
let activeUrl = null;
let pinned = false;
let currentBastions = [];

pinBtn.addEventListener("click", () => {
  pinned = !pinned;
  shellEl.classList.toggle("bs-pinned", pinned);
  pinBtn.textContent = pinned ? "📍" : "📌";
});

addBtn.addEventListener("click", async () => {
  const url = prompt("Bastion URL:");
  if (!url) return;
  const label = prompt("Label (optional):") || new URL(url).hostname;
  const group = prompt("Group (optional):") || "default";
  chrome.runtime.sendMessage({ type: "addBastion", url, label, group });
});

reloadBtn.addEventListener("click", reloadActive);

function reloadActive() {
  if (!activeUrl) return;
  const f = iframes.get(activeUrl);
  if (f) f.src = f.src;
}

// Intercept F5 / Ctrl+R / Ctrl+W when the shell page itself has focus.
// (Won't fire when the bastion iframe has focus — cross-origin iframes
// swallow these events at the browser level. Use the sidebar reload button
// or the bastion's own UI in that case.)
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "f5" || (e.ctrlKey && k === "r")) {
    e.preventDefault();
    reloadActive();
  } else if (e.ctrlKey && k === "w") {
    e.preventDefault();
    if (activeUrl) {
      chrome.runtime.sendMessage({ type: "removeBastion", url: activeUrl });
    }
  } else if (e.ctrlKey && k === "tab") {
    e.preventDefault();
    cycleActive(e.shiftKey ? -1 : 1);
  }
});

function cycleActive(dir) {
  const urls = [...iframes.keys()];
  if (urls.length === 0) return;
  const i = urls.indexOf(activeUrl);
  const next = urls[(i + dir + urls.length) % urls.length];
  setActive(next);
}

async function getBastions() {
  const { [STORAGE_KEY]: list } = await chrome.storage.session.get(STORAGE_KEY);
  return Array.isArray(list) ? list : [];
}

function setActive(url) {
  activeUrl = url;
  for (const [u, f] of iframes) {
    f.classList.toggle("bs-active", u === url);
  }
  // give focus to active iframe so keyboard input flows to the bastion
  const f = iframes.get(url);
  if (f) f.focus();
  const active = currentBastions.find((b) => b.url === url);
  document.title = active ? `${active.label} — Bastions` : "Bastions";
  renderSidebar();
}

async function sync() {
  const list = await getBastions();
  currentBastions = list;

  // Add iframes for new bastions
  for (const b of list) {
    if (!iframes.has(b.url)) {
      console.log("[bastion-ext shell] mounting iframe for", b.url);
      const f = document.createElement("iframe");
      f.src = b.url;
      f.className = "bs-view";
      f.dataset.url = b.url;
      // sandbox left off so bastion can do everything it normally would
      f.allow = "clipboard-read; clipboard-write; fullscreen";
      f.addEventListener("load", () => console.log("[bastion-ext shell] iframe loaded:", b.url));
      f.addEventListener("error", (e) => console.warn("[bastion-ext shell] iframe error:", b.url, e));
      viewsEl.appendChild(f);
      iframes.set(b.url, f);
      setActive(b.url); // auto-switch to the newly added bastion
    }
  }

  // Remove iframes for closed bastions
  for (const [url, f] of iframes) {
    if (!list.find((b) => b.url === url)) {
      f.remove();
      iframes.delete(url);
      if (activeUrl === url) {
        const next = [...iframes.keys()][0] || null;
        if (next) setActive(next);
        else activeUrl = null;
      }
    }
  }

  renderSidebar(list);
  // refresh title in case active bastion's label was renamed
  if (activeUrl) {
    const active = list.find((b) => b.url === activeUrl);
    document.title = active ? `${active.label} — Bastions` : "Bastions";
  }
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

async function renderSidebar(list) {
  if (!list) list = await getBastions();
  groupsEl.innerHTML = "";
  const byGroup = new Map();
  for (const b of list) {
    if (!byGroup.has(b.group)) byGroup.set(b.group, []);
    byGroup.get(b.group).push(b);
  }
  if (byGroup.size === 0) {
    groupsEl.appendChild(el("div", { class: "bs-empty" }, "No bastions. Click + to add."));
    return;
  }
  for (const [group, items] of byGroup) {
    const groupEl = el("div", { class: "bs-group" });
    groupEl.appendChild(el("div", { class: "bs-group-label" }, group));
    for (const b of items) {
      const row = el("div", {
        class: "bs-row" + (b.url === activeUrl ? " bs-active" : ""),
        title: b.url
      });
      row.appendChild(el("img", { class: "bs-dot", src: "icons/icon-16.png", alt: "" }));
      row.appendChild(el("span", { class: "bs-label" }, b.label));
      row.appendChild(el("button", {
        class: "bs-x",
        title: "Close",
        onclick: (ev) => {
          ev.stopPropagation();
          chrome.runtime.sendMessage({ type: "removeBastion", url: b.url });
        }
      }, "×"));
      row.addEventListener("click", () => setActive(b.url));
      groupEl.appendChild(row);
    }
    groupsEl.appendChild(groupEl);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "bastions-changed") sync();
  else if (msg.type === "label-changed") patchLabel(msg.url, msg.label);
});

function patchLabel(url, label) {
  const entry = currentBastions.find((b) => b.url === url);
  if (entry) entry.label = label;
  for (const row of groupsEl.querySelectorAll(".bs-row")) {
    if (row.title === url) {
      const labelEl = row.querySelector(".bs-label");
      if (labelEl && labelEl.textContent !== label) labelEl.textContent = label;
    }
  }
  if (activeUrl === url) document.title = `${label} — Bastions`;
}

sync();
