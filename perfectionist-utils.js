const READY_EVENT = "perfectionist:utils-ready";
const STATE_KEY = "perfectionist-plugins:state";
const CACHE_KEY = "perfectionist-plugins:cache";
const NAV_ID = "perfectionist-plugins-nav";
const PANEL_ID = "perfectionist-plugins-panel";
const STYLE_ID = "perfectionist-plugins-style";
const TAB_TITLE = "Perfectionism";

export const version = "1.0.1";

const PKG = "perfectionist-plugins";
const CDN = "https://cdn.jsdelivr.net/npm";
const REGISTRY_URL = `https://registry.npmjs.org/${PKG}/latest`;
const CORE_FILE = "perfectionist-utils.js";

const BUNDLED_MODULES = [
  {
    id: "perfectionist-utils",
    file: CORE_FILE,
    name: "Perfectionism Core",
    version,
    description: "Shared core for the Perfectionism plugins.",
    core: true,
  },
  {
    id: "ban-blocker",
    file: "ban-blocker.js",
    name: "Ban Blocker",
    version: "3.4.0",
    description: "During bans, blocking a teammate instantly claims the champion they hover to ban.",
  },
  {
    id: "hide-unowned-skins",
    file: "hide-unowned-skins.js",
    name: "Hide Unowned Skins",
    version: "2.1.0",
    description: "In champion select, only shows the skins you own for the picked champion.",
  },
];

const STYLE_CSS = `
#${PANEL_ID} { padding: 12px 24px 24px 8px; box-sizing: border-box; color: #f0e6d2; font-family: "LoL Body", Arial, "Helvetica Neue", Helvetica, sans-serif; }
#${PANEL_ID} .perf-card { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
  padding: 16px 18px; margin-bottom: 12px; box-sizing: border-box;
  background: #010a13; border: 1px solid #785a28; }
#${PANEL_ID} .perf-card:hover { border-color: #c89b3c; }
#${PANEL_ID} .perf-card--missing { opacity: 0.75; }
#${PANEL_ID} .perf-info { min-width: 0; }
#${PANEL_ID} .perf-name { font-family: "LoL Display", "Times New Roman", Times, Baskerville, Georgia, serif;
  font-size: 15px; font-weight: 700; letter-spacing: 1.05px; text-transform: uppercase; color: #f0e6d2; }
#${PANEL_ID} .perf-version { font-family: "LoL Body", Arial, sans-serif; font-size: 10px; font-weight: 700;
  letter-spacing: 0.25px; text-transform: none; color: #c89b3c; margin-left: 8px; }
#${PANEL_ID} .perf-desc { font-size: 12px; letter-spacing: 0.3px; color: #a09b8c; margin-top: 7px; line-height: 1.5; max-width: 560px; }
#${PANEL_ID} .perf-actions { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
#${PANEL_ID} .perf-toggle { position: relative; display: flex; align-items: center; flex: 0 0 auto; cursor: pointer; }
#${PANEL_ID} .perf-toggle input { position: absolute; opacity: 0; width: 0; height: 0; margin: 0; }
#${PANEL_ID} .perf-box { position: relative; width: 18px; height: 18px; box-sizing: border-box;
  border: 1px solid #785a28; background: #0a1428; }
#${PANEL_ID} .perf-box::after { content: ""; position: absolute; inset: 1px; display: none;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.2 6.4L4.9 9.1L9.8 3.3' fill='none' stroke='%23c89b3c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 12px 12px no-repeat; }
#${PANEL_ID} .perf-toggle input:checked + .perf-box::after { display: block; }
#${PANEL_ID} .perf-toggle:hover .perf-box { border-color: #c89b3c; }
#${PANEL_ID} .perf-toggle input:focus-visible + .perf-box { outline: 1px solid #c89b3c; outline-offset: 2px; }
.perf-btn { font-family: "LoL Body", Arial, sans-serif; font-size: 11px; font-weight: 700; line-height: 12px;
  letter-spacing: 1px; text-transform: uppercase; color: #c89b3c; background: #0a1428;
  border: 1px solid #785a28; padding: 8px 16px; cursor: pointer; }
.perf-btn:hover { color: #f0e6d2; border-color: #c89b3c; background: #1e2328; }
.perf-btn:disabled { opacity: 0.5; cursor: default; }
#${PANEL_ID} .perf-uninstall { width: 30px; height: 30px; padding: 0; display: flex; align-items: center; justify-content: center; }
#${PANEL_ID} .perf-uninstall::after { content: ""; width: 11px; height: 11px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5' fill='none' stroke='%23c89b3c' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") center / 11px 11px no-repeat; }
#${PANEL_ID} .perf-empty { font-size: 12px; color: #a09b8c; }

.perf-update { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center;
  justify-content: center; background: rgba(1, 10, 19, 0.72); }
.perf-update-box { width: 430px; box-sizing: border-box; padding: 22px 26px;
  background: #010a13; border: 1px solid #785a28; box-shadow: 0 0 32px rgba(0, 0, 0, 0.8); }
.perf-update-title { font-family: "LoL Display", "Times New Roman", Times, Baskerville, Georgia, serif;
  font-size: 15px; font-weight: 700; letter-spacing: 1.05px; text-transform: uppercase; color: #f0e6d2; }
.perf-update-status { font-family: "LoL Body", Arial, sans-serif; font-size: 12px; letter-spacing: 0.3px;
  color: #a09b8c; margin-top: 12px; line-height: 1.5; }
.perf-update-track { height: 6px; margin-top: 16px; background: #0a1428; border: 1px solid #785a28; }
.perf-update-fill { height: 100%; width: 0; background: #c89b3c; transition: width 0.25s; }
.perf-update-close { margin-top: 18px; }
`;

const registry = new Map();
const watchers = new Map();
const requestCache = new Map();
let socket = null;
let observer = null;
let scanScheduled = false;

let coords = null;
const resolved = new Map();
let availableModules = BUNDLED_MODULES;
let pendingReload = false;
let runningVersion = version;

let state = { installed: {}, enabled: {} };

async function loadState() {
  let saved = null;
  try {
    saved =
      typeof DataStore !== "undefined"
        ? await DataStore.get(STATE_KEY)
        : JSON.parse(localStorage.getItem(STATE_KEY) || "null");
  } catch {
    saved = null;
  }
  if (saved?.installed && typeof saved.installed === "object") {
    state = { installed: saved.installed, enabled: saved.enabled ?? {} };
    return;
  }
  for (const mod of BUNDLED_MODULES) {
    if (mod.core) continue;
    state.installed[mod.id] = true;
    state.enabled[mod.id] = mod.defaultEnabled ?? true;
  }
  saveState();
}

function saveState() {
  const record = {
    version: /^\d/.test(runningVersion) ? runningVersion : undefined,
    installed: state.installed,
    enabled: state.enabled,
  };
  try {
    if (typeof DataStore !== "undefined") DataStore.set(STATE_KEY, record);
    localStorage.setItem(STATE_KEY, JSON.stringify(record));
  } catch (error) {
    console.error("[Perfectionism] Could not save plugin state.", error);
  }
}

function logError(scope, error) {
  console.error(`[Perfectionism] ${scope}`, error);
}

function isPluginEnabled(id) {
  const entry = registry.get(id);
  if (!entry) return false;
  return typeof state.enabled[id] === "boolean" ? state.enabled[id] : entry.defaultEnabled;
}

function applyLifecycle(entry, enabled) {
  if (enabled && !entry.active) {
    entry.active = true;
    try {
      entry.onEnable?.(utils);
    } catch (error) {
      entry.active = false;
      logError(`${entry.name} failed to enable.`, error);
    }
  } else if (!enabled && entry.active) {
    entry.active = false;
    try {
      entry.onDisable?.(utils);
    } catch (error) {
      logError(`${entry.name} failed to disable cleanly.`, error);
    }
  }
}

function registerPlugin(definition) {
  const { id, name, description = "", version = "1.0.0", defaultEnabled = true, onEnable, onDisable } = definition ?? {};
  if (!id || !name) {
    throw new Error("[Perfectionism] registerPlugin needs an id and a name.");
  }
  if (registry.has(id)) {
    console.warn(`[Perfectionism] ${name} is already registered.`);
    return;
  }
  const entry = { id, name, description, version, defaultEnabled, onEnable, onDisable, active: false };
  registry.set(id, entry);
  applyLifecycle(entry, isPluginEnabled(id));
  refreshPanel();
}

function unregisterPlugin(id) {
  const entry = registry.get(id);
  if (!entry) return;
  applyLifecycle(entry, false);
  registry.delete(id);
  refreshPanel();
}

function setPluginEnabled(id, enabled) {
  const entry = registry.get(id);
  state.enabled[id] = Boolean(enabled);
  saveState();
  if (!entry) return false;
  applyLifecycle(entry, Boolean(enabled));
  refreshPanel();
  return true;
}

function getPlugins() {
  return [...registry.values()]
    .map(({ id, name, description, version }) => ({ id, name, description, version, enabled: isPluginEnabled(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getAvailableModules() {
  return availableModules.filter((m) => !m.core);
}

function isInstalled(mod) {
  const installed = state.installed[mod.id];
  return installed === undefined ? registry.has(mod.id) : Boolean(installed);
}

function newerVersion(a, b) {
  const pa = String(a ?? "0")
    .split(".")
    .map(Number);
  const pb = String(b ?? "0")
    .split(".")
    .map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function moduleUrl(file) {
  return `${CDN}/${PKG}@${runningVersion}/${file}`;
}

function importModule(url) {
  return coords?.importModule ? coords.importModule(url) : import(url);
}

async function installModule(mod) {
  state.installed[mod.id] = true;
  delete state.enabled[mod.id];
  saveState();
  pendingReload = true;
  refreshPanel();
}

async function uninstallModule(mod) {
  unregisterPlugin(mod.id);
  state.enabled[mod.id] = false;
  state.installed[mod.id] = false;
  saveState();
  refreshPanel();
}

const SAFE_PHASES = new Set(["None", "Lobby", "EndOfGame"]);

function reloadClientNow() {
  if (typeof window.reloadClient === "function") window.reloadClient();
  else window.location.reload();
}

async function reloadWhenSafe() {
  for (;;) {
    let phase = null;
    try {
      phase = await apiGet("/lol-gameflow/v1/gameflow-phase");
    } catch {
      phase = null;
    }
    if (phase == null || SAFE_PHASES.has(phase)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  reloadClientNow();
}

function apiGet(path) {
  return fetch(path, { headers: { Accept: "application/json" } }).then((response) => {
    if (!response.ok) throw new Error(`${path} responded ${response.status}`);
    return response.status === 204 ? null : response.json();
  });
}

function buildUpdateWindow() {
  const root = el("div", "perf-update");
  const box = el("div", "perf-update-box");
  box.append(el("div", "perf-update-title", "Installing Update"));
  const status = el("div", "perf-update-status", "Downloading...");
  const track = el("div", "perf-update-track");
  const fill = el("div", "perf-update-fill");
  track.append(fill);
  box.append(status, track);
  root.append(box);
  return {
    root,
    setStatus: (text) => {
      status.textContent = text;
    },
    setProgress: (fraction) => {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    },
    fail: (text) => {
      status.textContent = text;
      const close = el("button", "perf-btn perf-update-close", "Close");
      close.addEventListener("click", () => root.remove());
      box.append(close);
    },
  };
}

async function runUpdate(target) {
  const win = buildUpdateWindow();
  (document.body ?? document.documentElement).append(win.root);
  const files = [{ name: "Perfectionism Core", file: CORE_FILE }, ...BUNDLED_MODULES.filter((m) => !m.core)];
  const sources = {};
  for (let i = 0; i < files.length; i++) {
    win.setStatus(`Downloading ${files[i].name}...`);
    win.setProgress(i / files.length);
    try {
      const response = await fetch(`${CDN}/${PKG}@${target}/${files[i].file}`);
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const text = await response.text();
      if (!text || !/export/.test(text)) throw new Error("the downloaded file looks invalid");
      if (files[i].id) sources[files[i].id] = text;
    } catch (error) {
      logError(`could not update to ${target}.`, error);
      win.fail(`Could not update to ${target}. It will be retried on the next client start.`);
      return;
    }
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: target, files: sources }));
  } catch {}
  win.setProgress(1);
  runningVersion = target;
  saveState();
  win.setStatus("Update installed. Restarting the client...");
  reloadWhenSafe();
}

async function checkForUpdates() {
  if (!/^\d+\.\d+\.\d+$/.test(runningVersion)) return;
  let target = null;
  try {
    const response = await fetch(REGISTRY_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (response.ok) target = (await response.json())?.version ?? null;
  } catch {
    return;
  }
  if (target && newerVersion(target, runningVersion)) runUpdate(target);
}

async function loadModules() {
  for (const mod of BUNDLED_MODULES) {
    if (mod.core || resolved.has(mod.id) || registry.has(mod.id) || !isInstalled(mod)) continue;
    try {
      const plugin = await importModule(moduleUrl(mod.file));
      resolved.set(mod.id, plugin);
      plugin.init?.();
    } catch (error) {
      logError(`could not load ${mod.name}.`, error);
    }
  }
}

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    runScan();
  });
}

function runScan() {
  for (const [selector, entries] of watchers) {
    let nodes;
    try {
      nodes = document.querySelectorAll(selector);
    } catch (error) {
      logError(`Invalid selector "${selector}".`, error);
      continue;
    }
    for (const node of nodes) {
      for (const entry of entries) {
        if (entry.seen.has(node)) continue;
        entry.seen.add(node);
        try {
          entry.callback(node);
        } catch (error) {
          logError(`Watcher for "${selector}" failed.`, error);
        }
      }
    }
  }
}

function ensureObserver() {
  if (observer) return;
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function watch(selector, callback) {
  const entry = { callback, seen: new WeakSet() };
  let entries = watchers.get(selector);
  if (!entries) {
    entries = new Set();
    watchers.set(selector, entries);
  }
  entries.add(entry);
  ensureObserver();
  scheduleScan();
  return () => {
    entries.delete(entry);
    if (entries.size === 0 && watchers.get(selector) === entries) watchers.delete(selector);
  };
}

function waitFor(selector, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let unwatch = null;
    const timer = setTimeout(() => {
      unwatch?.();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);
    unwatch = watch(selector, (element) => {
      clearTimeout(timer);
      unwatch();
      resolve(element);
    });
  });
}

function addStyle(name, css) {
  let element = document.getElementById(name);
  if (!element) {
    element = document.createElement("style");
    element.id = name;
    (document.head ?? document.documentElement).appendChild(element);
  }
  element.textContent = css;
  return () => element.remove();
}

function lcuGet(path, { ttl = 0 } = {}) {
  const now = Date.now();
  const cached = requestCache.get(path);
  if (cached && (cached.pending || cached.expires > now)) return cached.promise;

  const entry = { pending: true, expires: 0, promise: null };
  entry.promise = fetch(path, { headers: { Accept: "application/json" } }).then(async (response) => {
    if (!response.ok) throw new Error(`LCU ${path} responded ${response.status}`);
    return response.status === 204 ? null : response.json();
  });
  requestCache.set(path, entry);
  entry.promise.then(
    () => {
      entry.pending = false;
      entry.expires = Date.now() + ttl;
    },
    () => {
      requestCache.delete(path);
    },
  );
  return entry.promise;
}

async function lcuSend(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`LCU ${method} ${path} responded ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function subscribe(uri, listener) {
  if (!socket?.observe) return null;
  const handle = socket.observe(uri, listener);
  return () => handle?.disconnect?.();
}

function whenRcpReady(name, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeout);
    const attempt = () => {
      if (window.rcp?.whenReady) {
        window.rcp.whenReady(name).then((api) => {
          clearTimeout(timer);
          resolve(api);
        });
      } else {
        setTimeout(attempt, 250);
      }
    };
    attempt();
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildToggle(mod) {
  const label = el("label", "perf-toggle");
  label.title = `Enable ${mod.name}`;
  const input = el("input");
  input.type = "checkbox";
  input.checked = isPluginEnabled(mod.id);
  input.setAttribute("aria-label", `Enable ${mod.name}`);
  input.addEventListener("change", () => setPluginEnabled(mod.id, input.checked));
  label.append(input, el("span", "perf-box"));
  return label;
}

function buildInstallButton(mod) {
  const button = el("button", "perf-btn perf-install", "Install");
  button.title = `Install ${mod.name}`;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Installing";
    try {
      await installModule(mod);
    } catch (error) {
      logError(`could not install ${mod.name}.`, error);
      button.disabled = false;
      button.textContent = "Install";
    }
  });
  return button;
}

function buildUninstallButton(mod) {
  const button = el("button", "perf-btn perf-uninstall");
  button.title = `Uninstall ${mod.name}`;
  button.setAttribute("aria-label", `Uninstall ${mod.name}`);
  button.addEventListener("click", () => uninstallModule(mod).catch((error) => logError(`could not uninstall ${mod.name}.`, error)));
  return button;
}

function buildCard(mod) {
  const installed = isInstalled(mod);
  const card = el("div", installed ? "perf-card" : "perf-card perf-card--missing");

  const info = el("div", "perf-info");
  const name = el("div", "perf-name", mod.name);
  name.append(el("span", "perf-version", `v${registry.get(mod.id)?.version ?? mod.version}`));
  info.append(name);
  if (mod.description) info.append(el("div", "perf-desc", mod.description));

  const actions = el("div", "perf-actions");
  if (installed) actions.append(buildToggle(mod));
  actions.append(installed ? buildUninstallButton(mod) : buildInstallButton(mod));

  card.append(info, actions);
  return card;
}

function buildPanel() {
  const panel = el("div");
  panel.id = PANEL_ID;

  const modules = getAvailableModules();
  if (modules.length === 0) {
    panel.append(el("div", "perf-empty", "No plugins are available."));
    return panel;
  }
  for (const mod of modules) panel.append(buildCard(mod));
  return panel;
}

function refreshPanel() {
  const current = document.getElementById(PANEL_ID);
  if (current) current.replaceWith(buildPanel());
}

function setNavActive(activeNav) {
  for (const nav of document.querySelectorAll(".lol-settings-nav")) {
    if (nav === activeNav) {
      nav.setAttribute("active", "true");
    } else if (nav.hasAttribute("active")) {
      nav.removeAttribute("active");
    }
  }
}

let panelRequested = false;

function openPanel() {
  panelRequested = true;
  const content = document.querySelector(".lol-settings-content");
  if (!content) return;

  const options = content.querySelector(".lol-settings-options");
  if (options) options.style.display = "none";

  const existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();
  content.append(buildPanel());

  setNavActive(document.getElementById(NAV_ID));
  const currentTitle = document.querySelector(".lol-settings-title-current");
  if (currentTitle) currentTitle.textContent = TAB_TITLE.toUpperCase();
}

function closePanel() {
  panelRequested = false;
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.remove();
  const options = document.querySelector(".lol-settings-content .lol-settings-options");
  if (options) options.style.display = "";
  setNavActive(null);
}

function keepPanelInSync() {
  const content = document.querySelector(".lol-settings-content");
  if (!content) {
    panelRequested = false;
    return;
  }
  if (!panelRequested) {
    const staleNav = document.getElementById(NAV_ID);
    if (staleNav && staleNav.hasAttribute("active")) staleNav.removeAttribute("active");
    return;
  }

  const panel = document.getElementById(PANEL_ID);
  if (!panel || panel.parentElement !== content) {
    openPanel();
    return;
  }

  const options = content.querySelector(".lol-settings-options");
  if (options && options.style.display !== "none") options.style.display = "none";

  const nav = document.getElementById(NAV_ID);
  if (nav) {
    for (const other of document.querySelectorAll(".lol-settings-nav")) {
      if (other !== nav && other.hasAttribute("active")) other.removeAttribute("active");
    }
    if (nav.getAttribute("active") !== "true") nav.setAttribute("active", "true");
  }

  const title = document.querySelector(".lol-settings-title-current");
  if (title && title.textContent !== TAB_TITLE.toUpperCase()) title.textContent = TAB_TITLE.toUpperCase();
}

function ensureSettingsTab(titleNode) {
  if (document.getElementById(NAV_ID)) return;

  const scope = titleNode.closest("lol-uikit-scrollable") ?? titleNode.parentElement;
  const firstTitle = scope?.querySelector(".lol-settings-nav-title");
  if (!firstTitle) return;

  const groupTitle = el("div", "lol-settings-nav-title", "Plugins");
  groupTitle.dataset.perfectionist = "title";

  const item = document.createElement("lol-uikit-navigation-item");
  item.id = NAV_ID;
  item.className = "lol-settings-nav";
  item.setAttribute("name", "perfectionist-plugins");
  item.append(el("div", null, TAB_TITLE.toUpperCase()));

  const bar = document.createElement("lol-uikit-navigation-bar");
  bar.setAttribute("direction", "down");
  bar.setAttribute("type", "tabbed");
  bar.dataset.perfectionist = "bar";
  bar.append(item);

  firstTitle.before(groupTitle, bar);
}

function isDoneButton(target) {
  const button = target.closest("button, lol-uikit-flat-button, [role=button]");
  return !!button && /^\s*done\s*$/i.test(button.textContent ?? "");
}

function installSettingsTab() {
  addStyle(STYLE_ID, STYLE_CSS);

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (pendingReload && isDoneButton(target)) {
        pendingReload = false;
        reloadClientNow();
        return;
      }
      if (target.closest(`#${NAV_ID}`)) {
        event.stopPropagation();
        openPanel();
        return;
      }
      const nativeNav = target.closest(".lol-settings-nav");
      if (nativeNav && document.getElementById(PANEL_ID)) {
        closePanel();
        const label = nativeNav.textContent.trim();
        setTimeout(() => {
          const title = document.querySelector(".lol-settings-title-current");
          if (title && label && !document.getElementById(PANEL_ID)) title.textContent = label;
        }, 0);
      }
    },
    true,
  );

  watch(".lol-settings-nav-title", ensureSettingsTab);
  setInterval(keepPanelInSync, 300);
}

const utils = {
  version,
  registerPlugin,
  unregisterPlugin,
  setPluginEnabled,
  isPluginEnabled,
  getPlugins,
  getAvailableModules,
  installModule,
  uninstallModule,
  checkForUpdates,
  watch,
  waitFor,
  addStyle,
  lcu: { get: lcuGet, send: lcuSend },
  subscribe,
  whenRcpReady,
};

export async function init(context, coordsProvided) {
  if (window.PerfectionistUtils) return;
  coords = coordsProvided ?? null;
  runningVersion = coords?.version || version;

  await loadState();
  saveState();

  socket = context?.socket ?? null;
  window.PerfectionistUtils = utils;
  installSettingsTab();
  window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: utils }));

  try {
    await loadModules();
    checkForUpdates();
  } catch (error) {
    logError("startup failed.", error);
  }
}
