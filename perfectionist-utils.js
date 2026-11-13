const READY_EVENT = "perfectionist:utils-ready";
const STATE_KEY = "perfectionist-plugins:state";
const NAV_ID = "perfectionist-plugins-nav";
const PANEL_ID = "perfectionist-plugins-panel";
const STYLE_ID = "perfectionist-plugins-style";
const TAB_TITLE = "Perfectionism";
const GROUP_TITLE = "Plugins";
const OPEN_CLASS = "perf-plugins-open";

export const version = "2.5.0";

const PKG = "perfectionist-plugins";
const CDN = "https://cdn.jsdelivr.net/npm";

const BUNDLED_MODULES = [
  {
    id: "perfectionist-utils",
    file: "perfectionist-utils.js",
    name: "Perfectionism Core",
    version,
    description: "The base the other plugins run on. Adds this Perfectionism page to the client settings.",
    core: true,
  },
  {
    id: "better-client",
    file: "better-client.js",
    name: "BetterClient",
    version: "2.0.0",
    description:
      "Makes the client lighter without changing how it looks: stops videos and animations nobody can see, blocks tracking, and pauses the client while you play. Performance mode helps weaker PCs.",
  },
  {
    id: "ban-blocker",
    file: "ban-blocker.js",
    name: "Ban Blocker",
    version: "4.0.0",
    description:
      "Adds a BLOCK button to your teammates in champ select. While a teammate is blocked, the champion they hover to ban is instantly declared as your pick, so their ban can never land on it.",
  },
  {
    id: "unlock-profile-skins",
    file: "unlock-profile-skins.js",
    name: "Unlock Profile Skins",
    version: "2.0.0",
    description:
      "Shows every skin as unlocked in the Set profile background window, event skins included, so you can pick any skin as your profile background.",
  },
  {
    id: "hide-unowned-skins",
    file: "hide-unowned-skins.js",
    name: "Hide Unowned Skins",
    version: "3.0.0",
    description: "In champ select, the skin carousel only shows the skins you own for the champion you picked.",
  },
  {
    id: "auto-accept",
    file: "auto-accept.js",
    name: "Auto Accept",
    version: "1.2.0",
    description: "Accepts the match for you when the ready check pops up.",
  },
  {
    id: "dodge-helper",
    file: "dodge-helper.js",
    name: "Dodge Helper",
    version: "2.0.0",
    description:
      "Adds a DODGE button to champ select (QUIT outside ranked) that leaves cleanly, showing the LP and queue lockout your next dodge will cost.",
  },
  {
    id: "auto-claimer",
    file: "auto-claimer.js",
    name: "Auto Claimer",
    version: "1.3.0",
    description:
      "Claims rewards for you as soon as they are ready: event tracks, missions and the TFT Battle Pass. Optional extras can also buy 1 BE shop items and open mystery loot and chests.",
  },
  {
    id: "auto-read",
    file: "auto-read.js",
    name: "Auto Read",
    version: "1.3.0",
    description: "Marks quests, loot, Clash, TFT and client notices as read for you, so no badge or dot stays lit.",
  },
];

// One box per plugin with its Enabled box and Install/Uninstall button, option groups with a caret, and chips.
// Colours come from the client's own palette and the inputs are the client's own elements.
const STYLE_CSS = `
#${PANEL_ID} { display: flex; flex-direction: column; overflow-x: hidden; padding: 15px 20px; position: relative;
  width: calc(100% - 40px); box-sizing: content-box; color: #a09b8c; font-family: var(--font-body, "LoL Body", Arial, sans-serif); }
#${PANEL_ID} > lol-uikit-scrollable { display: block; flex: 1 1 auto; min-height: 0; }
#${PANEL_ID} .perf-tools { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; margin-bottom: 14px; }
#${PANEL_ID} .perf-tools lol-uikit-flat-input { flex: 1 1 auto; min-width: 0; }
#${PANEL_ID} .perf-tools lol-uikit-flat-button-secondary { flex: 0 0 auto; min-width: 112px; }
#${PANEL_ID} .perf-notice { flex: 0 0 auto; margin: -6px 0 12px; }
#${PANEL_ID} .perf-card { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
  padding: 16px 18px; margin-bottom: 12px; box-sizing: border-box; background: #010a13; border: 1px solid #463714; }
#${PANEL_ID} .perf-card:hover { border-color: #785a28; }
#${PANEL_ID} .perf-card--missing .perf-info { opacity: 0.7; }
#${PANEL_ID} .perf-info { min-width: 0; }
#${PANEL_ID} .perf-name { font-family: var(--font-display, "LoL Display", serif); font-size: 14px; font-weight: 700;
  line-height: 18px; letter-spacing: 1.05px; text-transform: uppercase; color: #f0e6d2; }
#${PANEL_ID} .perf-version { font-family: var(--font-body, "LoL Body", Arial, sans-serif); font-size: 10px; font-weight: 700;
  letter-spacing: 0.25px; text-transform: none; color: #c89b3c; margin-left: 8px; }
#${PANEL_ID} .perf-desc { font-size: 12px; letter-spacing: 0.3px; color: #a09b8c; margin-top: 7px; line-height: 1.5; max-width: 560px; }
#${PANEL_ID} .perf-actions { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
#${PANEL_ID} .perf-actions lol-uikit-flat-checkbox { margin: 0; }
#${PANEL_ID} .perf-actions lol-uikit-flat-button-secondary,
#${PANEL_ID} .perf-actions lol-uikit-flat-button { min-width: 96px; }
#${PANEL_ID} .perf-uninstall { width: 30px; height: 30px; box-sizing: border-box; padding: 0; display: flex; align-items: center;
  justify-content: center; cursor: pointer; background: #1e2328; border: 1px solid #785a28; }
#${PANEL_ID} .perf-uninstall:hover { border-color: #c8aa6e; background: #1e2328; }
#${PANEL_ID} .perf-uninstall::after { content: ""; width: 11px; height: 11px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5' fill='none' stroke='%23cdbe91' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") center / 11px 11px no-repeat; }
#${PANEL_ID} .perf-uninstall:hover::after { filter: brightness(1.3); }
#${PANEL_ID} .perf-empty { font-size: 12px; color: #a09b8c; }
#${PANEL_ID} .perf-opts { margin-top: 11px; display: flex; flex-direction: column; gap: 8px; }
#${PANEL_ID} .perf-opt-head { display: flex; align-items: center; gap: 9px; }
#${PANEL_ID} .perf-caret { flex: 0 0 auto; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; background: transparent; }
#${PANEL_ID} .perf-caret:hover { border-color: #463714; background: #1e2328; }
#${PANEL_ID} .perf-caret::after { content: ""; width: 12px; height: 12px; transform-origin: center; transition: transform 0.15s;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath d='M2 1l4 3-4 3z' fill='%23c8aa6e'/%3E%3C/svg%3E") center / 12px 12px no-repeat; }
#${PANEL_ID} .perf-caret:hover::after { filter: brightness(1.3); }
#${PANEL_ID} .perf-caret--open::after { transform: rotate(90deg); }
#${PANEL_ID} .perf-opt-children { margin: 8px 0 2px 25px; padding-left: 12px; display: flex; flex-direction: column; gap: 8px;
  border-left: 1px solid #463714; }
#${PANEL_ID} lol-uikit-flat-checkbox.perf-disabled { opacity: 0.45; pointer-events: none; }
#${PANEL_ID} .perf-card--locked .perf-caret { opacity: 0.45; }
#${PANEL_ID} .perf-chip-block { margin-top: 11px; }
#${PANEL_ID} .perf-chips-label { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #c89b3c; margin-bottom: 7px; }
#${PANEL_ID} .perf-chips { display: flex; flex-wrap: wrap; gap: 6px; }
#${PANEL_ID} .perf-chip { font-family: var(--font-body, "LoL Body", Arial, sans-serif); font-size: 10px; font-weight: 700;
  letter-spacing: 0.5px; text-transform: uppercase; color: #5b5a56; background: #010a13; border: 1px solid #1e2328;
  padding: 6px 11px; cursor: pointer; }
#${PANEL_ID} .perf-chip:hover { color: #a09b8c; border-color: #463714; }
#${PANEL_ID} .perf-chip--on { color: #c8aa6e; background: #0f1418; border-color: #463714; }
#${PANEL_ID} .perf-chip--on:hover { color: #c8aa6e; border-color: #785a28; }
#${PANEL_ID} .perf-chip:disabled { opacity: 0.45; cursor: default; }
#${PANEL_ID} .perf-chip:disabled:hover { color: #5b5a56; border-color: #1e2328; }
#${PANEL_ID} .perf-chip--on:disabled:hover { color: #c8aa6e; border-color: #463714; }

/* While the page is open: hide the client's own options pane and tab highlight, and show our breadcrumb.
   Pure CSS, so nothing the client renders (attributes, text nodes, inline styles) is ever modified. */
.lol-settings-container.${OPEN_CLASS} .lol-settings-options { display: none !important; }
.lol-settings-container.${OPEN_CLASS} lol-uikit-navigation-item.lol-settings-nav:not(#${NAV_ID})[active] { color: #c8aa6e !important; cursor: pointer !important; padding-left: var(--perf-nav-pad, 14px) !important; }
.lol-settings-container.${OPEN_CLASS} lol-uikit-navigation-item.lol-settings-nav:not(#${NAV_ID})[active]:hover { color: #f0e6d2 !important; }
.lol-settings-container.${OPEN_CLASS} lol-uikit-navigation-item.lol-settings-nav:not(#${NAV_ID})[active]::before { opacity: 0 !important; }
.lol-settings-container.${OPEN_CLASS} .lol-settings-header-group-name,
.lol-settings-container.${OPEN_CLASS} .lol-settings-title-current { font-size: 0 !important; letter-spacing: 0 !important; }
.lol-settings-container.${OPEN_CLASS} .lol-settings-header-group-name::after { content: "${GROUP_TITLE.toUpperCase()}"; font-size: var(--perf-crumb-group-size, 20px); letter-spacing: var(--perf-crumb-group-spacing, normal); }
.lol-settings-container.${OPEN_CLASS} .lol-settings-title-current::after { content: "${TAB_TITLE.toUpperCase()}"; font-size: var(--perf-crumb-size, 20px); letter-spacing: var(--perf-crumb-spacing, normal); }
`;

const registry = new Map();
const watchers = new Map();
const requestCache = new Map();
const frameHooks = new Set();
let socket = null;
let observer = null;
let scanScheduled = false;
let pendingNodes = [];
let fullScan = true;

let coords = null;
const resolved = new Map();
let pendingReload = false;
let modulesLoaded = false;
let searchQuery = "";
let runningVersion = version;
let coreStarted = false;

let state = { installed: {}, enabled: {}, options: {}, masterLocked: false };
const unloadPending = new Set();

let saveBlocked = false;

const SAVED_STATE_TRIES = 3;
const SAVED_STATE_RETRY_MS = 250;
const FULL_SCAN_THRESHOLD = 300;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function looksLikeState(saved) {
  return isObject(saved) && (isObject(saved.installed) || isObject(saved.enabled) || isObject(saved.options));
}

async function readSavedState() {
  let saved = null;
  let failed = false;
  for (let attempt = 0; attempt < SAVED_STATE_TRIES; attempt += 1) {
    failed = false;
    try {
      if (typeof DataStore !== "undefined") saved = await DataStore.get(STATE_KEY);
    } catch {
      failed = true;
    }
    if (looksLikeState(saved) || !failed) break;
    await new Promise((resolve) => setTimeout(resolve, SAVED_STATE_RETRY_MS));
  }
  if (!looksLikeState(saved)) {
    try {
      saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    } catch {
      saved = null;
    }
  }
  return { saved: looksLikeState(saved) ? saved : null, failed };
}

function normalizeState(saved) {
  const next = {
    installed: isObject(saved?.installed) ? { ...saved.installed } : {},
    enabled: isObject(saved?.enabled) ? { ...saved.enabled } : {},
    options: isObject(saved?.options) ? { ...saved.options } : {},
    masterLocked: saved?.masterLocked === true,
  };
  delete next.enabled.undefined;
  for (const mod of BUNDLED_MODULES) {
    if (mod.core) continue;
    if (next.installed[mod.id] === undefined && (next.enabled[mod.id] === true || isObject(next.options[mod.id]))) {
      next.installed[mod.id] = true;
    }
  }
  return next;
}

async function loadState() {
  const { saved, failed } = await readSavedState();
  state = normalizeState(saved);
  if (!saved && failed) saveBlocked = true;
}

function saveState() {
  if (saveBlocked) return;
  const record = {
    version: /^\d/.test(runningVersion) ? runningVersion : undefined,
    installed: state.installed,
    enabled: state.enabled,
    options: state.options,
    masterLocked: state.masterLocked === true,
  };
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(record));
  } catch (error) {
    logError("Could not save plugin state.", error);
  }
  try {
    if (typeof DataStore !== "undefined") DataStore.set(STATE_KEY, record);
  } catch (error) {
    logError("Could not save plugin state.", error);
  }
}

function logError(scope, error) {
  console.error(`[Perfectionism] ${scope}`, error);
}

function moduleById(id) {
  return BUNDLED_MODULES.find((m) => m.id === id) ?? null;
}

function isPluginEnabled(id) {
  if (!registry.has(id) && !moduleById(id)) return false;
  if (state.masterLocked === true) return false;
  return state.enabled[id] === true;
}

function trackUnload(id) {
  if (isPluginEnabled(id)) unloadPending.delete(id);
  else unloadPending.add(id);
}

function needsReload() {
  return pendingReload || unloadPending.size > 0;
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
  const { id, name, description = "", version = "1.0.0", options = [], onEnable, onDisable, onOptionChange } = definition ?? {};
  if (!id || !name) {
    throw new Error("[Perfectionism] registerPlugin needs an id and a name.");
  }
  if (registry.has(id)) {
    console.warn(`[Perfectionism] ${name} is already registered.`);
    return;
  }
  const entry = { id, name, description, version, options, onEnable, onDisable, onOptionChange, active: false };
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
  if (entry) {
    applyLifecycle(entry, isPluginEnabled(id));
    trackUnload(id);
    refreshPanel();
    return true;
  }
  const mod = moduleById(id);
  if (enabled && state.masterLocked !== true && mod && !mod.core && isInstalled(mod)) {
    loadModule(mod).then(refreshPanel);
    return true;
  }
  refreshPanel();
  return false;
}

function findOption(entry, key) {
  for (const option of entry?.options ?? []) {
    if (option.key === key) return option;
    for (const child of option.children ?? []) {
      if (child.key === key) return child;
    }
    for (const item of option.items ?? []) {
      if (`${option.key}.${item.id}` === key) return item;
    }
  }
  return null;
}

function getOption(id, key, fallback = false) {
  const entry = registry.get(id);
  const fallbackValue = findOption(entry, key)?.default ?? fallback;
  const stored = state.options?.[id]?.[key];
  return stored === undefined ? Boolean(fallbackValue) : Boolean(stored);
}

function setOption(id, key, value, refresh = true) {
  if (!state.options[id]) state.options[id] = {};
  state.options[id][key] = Boolean(value);
  saveState();
  const entry = registry.get(id);
  try {
    if (entry?.active) entry.onOptionChange?.(key, Boolean(value));
  } catch (error) {
    logError(`${entry?.name ?? id} could not apply the option change.`, error);
  }
  if (refresh) refreshPanel();
}

function getPlugins() {
  return [...registry.values()]
    .map(({ id, name, description, version }) => ({ id, name, description, version, enabled: isPluginEnabled(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getAvailableModules() {
  return BUNDLED_MODULES.filter((m) => !m.core);
}

function isInstalled(mod) {
  const installed = state.installed[mod.id];
  return installed === undefined ? registry.has(mod.id) : Boolean(installed);
}

function moduleUrl(file) {
  if (coords?.moduleBase) return new URL(file, coords.moduleBase).href;
  return `${CDN}/${PKG}@${runningVersion}/${file}`;
}

function importModule(url) {
  return coords?.importModule ? coords.importModule(url) : import(url);
}

async function installModule(mod) {
  state.installed[mod.id] = true;
  state.enabled[mod.id] = false;
  saveState();
  pendingReload = true;
  refreshPanel();
}

async function uninstallModule(mod) {
  if (registry.has(mod.id)) unloadPending.add(mod.id);
  unregisterPlugin(mod.id);
  state.enabled[mod.id] = false;
  state.installed[mod.id] = false;
  saveState();
  refreshPanel();
}

function reloadClientNow() {
  if (typeof window.reloadClient === "function") window.reloadClient();
  else window.location.reload();
}

async function loadModule(mod) {
  if (resolved.has(mod.id) || registry.has(mod.id)) return;
  try {
    const plugin = await importModule(moduleUrl(mod.file));
    resolved.set(mod.id, plugin);
    plugin.init?.();
  } catch (error) {
    logError(`could not load ${mod.name}.`, error);
  }
}

async function loadEnabledModules() {
  const wanted = BUNDLED_MODULES.filter((mod) => !mod.core && isInstalled(mod) && isPluginEnabled(mod.id));
  // Fetch every enabled module in parallel; each one registers itself as soon as it arrives.
  await Promise.all(wanted.map((mod) => loadModule(mod)));
}

async function loadModules() {
  if (modulesLoaded) return;
  modulesLoaded = true;
  await loadEnabledModules();
}

/* ------------------------------------------------------------------------------------------------
 * DOM watching. One shared MutationObserver for every plugin. A frame only inspects the nodes that
 * were added since the last frame, and falls back to a full document query for large re-renders.
 * ---------------------------------------------------------------------------------------------- */

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    runScan();
  });
}

function visitMatches(entries, nodes) {
  for (const node of nodes) {
    for (const entry of entries) {
      if (entry.seen.has(node)) continue;
      entry.seen.add(node);
      try {
        entry.callback(node);
      } catch (error) {
        logError(`Watcher for "${entry.selector}" failed.`, error);
      }
    }
  }
}

function runScan() {
  const nodes = pendingNodes;
  const full = fullScan;
  pendingNodes = [];
  fullScan = false;

  for (const hook of frameHooks) {
    try {
      hook();
    } catch (error) {
      logError("Frame hook failed.", error);
    }
  }

  for (const [selector, entries] of watchers) {
    if (entries.size === 0) continue;
    try {
      if (full) {
        visitMatches(entries, document.querySelectorAll(selector));
        continue;
      }
      for (const node of nodes) {
        if (!node.isConnected) continue;
        if (node.matches(selector)) visitMatches(entries, [node]);
        if (node.firstElementChild) visitMatches(entries, node.querySelectorAll(selector));
      }
    } catch (error) {
      logError(`Invalid selector "${selector}".`, error);
    }
  }
}

function onMutations(records) {
  if (!fullScan) {
    for (const record of records) {
      const added = record.addedNodes;
      for (let index = 0; index < added.length; index += 1) {
        if (added[index].nodeType === 1) pendingNodes.push(added[index]);
      }
    }
    if (pendingNodes.length > FULL_SCAN_THRESHOLD) {
      fullScan = true;
      pendingNodes = [];
    }
  }
  scheduleScan();
}

function ensureObserver() {
  if (observer) return;
  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function watch(selector, callback) {
  const entry = { selector, callback, seen: new WeakSet() };
  let entries = watchers.get(selector);
  if (!entries) {
    entries = new Set();
    watchers.set(selector, entries);
  }
  entries.add(entry);
  ensureObserver();
  try {
    visitMatches([entry], document.querySelectorAll(selector));
  } catch (error) {
    logError(`Invalid selector "${selector}".`, error);
  }
  return () => {
    entries.delete(entry);
    if (entries.size === 0 && watchers.get(selector) === entries) watchers.delete(selector);
  };
}

function onFrame(hook) {
  frameHooks.add(hook);
  ensureObserver();
  return () => frameHooks.delete(hook);
}

function waitFor(selector, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let unwatch = null;
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      unwatch?.();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);
    unwatch = watch(selector, (element) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      queueMicrotask(() => unwatch?.());
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

/* ------------------------------------------------------------------------------------------------
 * LCU helpers
 * ---------------------------------------------------------------------------------------------- */

const LCU_TIMEOUT_MS = 10000;

function lcuGet(path, { ttl = 0 } = {}) {
  const now = Date.now();
  const cached = requestCache.get(path);
  if (cached && (cached.pending || cached.expires > now)) return cached.promise;

  const entry = { pending: true, expires: 0, promise: null };
  const request = fetch(path, { headers: { Accept: "application/json" } }).then(async (response) => {
    if (!response.ok) throw new Error(`LCU ${path} responded ${response.status}`);
    return response.status === 204 ? null : response.json();
  });
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`LCU ${path} timed out`)), LCU_TIMEOUT_MS);
  });
  entry.promise = Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  requestCache.set(path, entry);
  entry.promise.then(
    () => {
      entry.pending = false;
      entry.expires = Date.now() + ttl;
      if (ttl <= 0 && requestCache.get(path) === entry) requestCache.delete(path);
    },
    () => {
      if (requestCache.get(path) === entry) requestCache.delete(path);
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
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function subscribe(uri, listener) {
  if (!socket?.observe) return null;
  const handle = socket.observe(uri, listener);
  return () => handle?.disconnect?.();
}

function whenRcpReady(name, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`Timed out waiting for ${name}`));
    }, timeout);
    const attempt = () => {
      if (settled) return;
      if (window.rcp?.whenReady) {
        window.rcp.whenReady(name).then(
          (api) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(api);
          },
          (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          },
        );
      } else {
        setTimeout(attempt, 250);
      }
    };
    attempt();
  });
}

/* ------------------------------------------------------------------------------------------------
 * Data binding transforms.
 *
 * Every client plugin (champ select, skins picker, profiles, ...) reads LCU data through its own
 * "identified" DataBinding from rcp-fe-common-libs, and each binding keeps a private ResourceCache.
 * Plugins register a transform for one identifier + path. The transform runs on every value that
 * enters that binding's cache (HTTP reads and WebSocket updates alike), so only that one client
 * plugin sees the modified data. No global fetch/XHR/WebSocket wrapping and no timing windows.
 * ---------------------------------------------------------------------------------------------- */

const bindingRules = new Set();
const bindingCaches = new Set();
let bindingSetup = null;

function ruleAppliesTo(rule, owner) {
  return Boolean(owner) && rule.identifier === owner.identifier && (!rule.base || rule.base === owner.base);
}

function rulesFor(owner) {
  if (!owner) return null;
  const list = [];
  for (const rule of bindingRules) if (ruleAppliesTo(rule, owner)) list.push(rule);
  return list.length ? list : null;
}

// Transforms must not mutate their input and must be idempotent: re-applying one to data it already
// produced gives the same result. That lets cached data be re-transformed in place without keeping a copy.
function applyRules(rules, path, data) {
  let out = data;
  for (const rule of rules) {
    let hit = false;
    try {
      hit = rule.match(path);
    } catch {}
    if (!hit) continue;
    try {
      const next = rule.transform(out, path);
      if (next !== undefined) out = next;
    } catch (error) {
      logError(`Data transform for ${path} failed.`, error);
    }
  }
  return out;
}

// reload: ask the client to fetch the real data again (used when a transform is removed).
function rewriteCachedPaths(cache, predicate, reload = false) {
  const data = cache._data;
  if (!(data instanceof Map)) return;
  for (const [path, entry] of [...data]) {
    if (!entry || entry.data == null || !predicate(path)) continue;
    try {
      if (reload) cache._resourceRead(path);
      else cache._cacheWrite(path, entry.data, entry.timestamp);
    } catch (error) {
      logError(`Could not refresh ${path}.`, error);
    }
  }
}

function adoptCache(cache, binding) {
  const owner = { identifier: binding?.options?.identifier ?? null, base: binding?.basePath ?? null };
  if (!owner.identifier) {
    cache.__perfOwner = null;
    return;
  }
  cache.__perfOwner = owner;
  cache.__perfRules = rulesFor(owner);
  bindingCaches.add(cache);
  if (cache.__perfRules) {
    const rules = cache.__perfRules;
    rewriteCachedPaths(cache, (path) => rules.some((rule) => rule.match(path)));
  }
}

function setupBindings() {
  if (bindingSetup) return bindingSetup;
  bindingSetup = (async () => {
    const libs = await whenRcpReady("rcp-fe-common-libs", 60000);
    const factory = await libs.getDataBinding("rcp-fe-perfectionism");
    const probe = factory("/perfectionism-probe");
    const bindingProto = Object.getPrototypeOf(probe);
    const probeCache = probe._getCache("/perfectionism-probe/state");
    const cacheProto = probeCache ? Object.getPrototypeOf(probeCache) : null;
    if (
      typeof bindingProto?._getCache !== "function" ||
      typeof cacheProto?._cacheWrite !== "function" ||
      !(probeCache._data instanceof Map)
    ) {
      throw new Error("The client's data binding layout changed.");
    }
    if (!bindingProto._getCache.__perfPatched) {
      const getCache = bindingProto._getCache;
      const patchedGetCache = function (path) {
        const cache = getCache.call(this, path);
        if (cache && typeof cache === "object") {
          const owner = cache.__perfOwner;
          if (owner === undefined) adoptCache(cache, this);
          else if (owner && owner.identifier !== this.options?.identifier) {
            // Shared cache (static assets): never transform it.
            cache.__perfOwner = null;
            cache.__perfRules = null;
            bindingCaches.delete(cache);
          }
        }
        return cache;
      };
      patchedGetCache.__perfPatched = true;
      bindingProto._getCache = patchedGetCache;

      const write = cacheProto._cacheWrite;
      const patchedWrite = function (path, data, stamp, error) {
        const rules = this.__perfRules;
        if (rules && !error && data != null) data = applyRules(rules, path, data);
        return write.call(this, path, data, stamp, error);
      };
      patchedWrite.__perfPatched = true;
      cacheProto._cacheWrite = patchedWrite;
    }
  })();
  bindingSetup.catch((error) => logError("Data binding hooks are unavailable.", error));
  return bindingSetup;
}

function refreshRule(rule, removed = false) {
  for (const cache of bindingCaches) {
    const owner = cache.__perfOwner;
    if (!ruleAppliesTo(rule, owner)) continue;
    cache.__perfRules = rulesFor(owner);
    const matches = (path) => {
      try {
        return rule.match(path);
      } catch {
        return false;
      }
    };
    rewriteCachedPaths(cache, matches, removed);
  }
}

function transformBinding({ identifier, base = null, match, transform }) {
  if (!identifier || typeof match !== "function" || typeof transform !== "function") {
    throw new Error("[Perfectionism] transformBinding needs an identifier, match() and transform().");
  }
  const rule = { identifier, base, match, transform };
  bindingRules.add(rule);
  const ready = setupBindings().then(() => {
    if (bindingRules.has(rule)) refreshRule(rule);
  });
  ready.catch(() => {});
  return {
    ready,
    reapply() {
      if (bindingRules.has(rule)) refreshRule(rule);
    },
    dispose() {
      if (!bindingRules.delete(rule)) return;
      refreshRule(rule, true);
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Settings page
 * ---------------------------------------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The client's own checkbox element. `label` may be empty (the plugin's Enabled box).
function buildCheckbox(label, checked, disabled, onChange, title) {
  const box = el("lol-uikit-flat-checkbox");
  if (checked) box.classList.add("checked");
  if (disabled) box.classList.add("perf-disabled");
  if (title) box.title = title;
  const input = el("input");
  input.slot = "input";
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.disabled = Boolean(disabled);
  if (title) input.setAttribute("aria-label", title);
  box.append(input);
  if (label) {
    const text = el("label", null, label);
    text.slot = "label";
    box.append(text);
  }
  input.addEventListener("change", () => {
    box.classList.toggle("checked", input.checked);
    onChange(input.checked);
  });
  return box;
}

function setCheckboxDisabled(box, disabled) {
  const input = box?.querySelector("input");
  if (!input) return;
  input.disabled = Boolean(disabled);
  box.classList.toggle("perf-disabled", Boolean(disabled));
}

function buildButton(tag, text, onClick, title) {
  const button = el(tag, null, text);
  if (title) button.title = title;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.hasAttribute("disabled")) return;
    onClick(button);
  });
  return button;
}

const optionGroupState = new Map();

function buildOptionRow(mod, option, disabled, onChange) {
  return buildCheckbox(
    option.label,
    getOption(mod.id, option.key),
    disabled,
    (checked) => (onChange ? onChange(checked) : setOption(mod.id, option.key, checked, false)),
    option.description,
  );
}

function buildChips(mod, option, locked) {
  const block = el("div", "perf-chip-block");
  block.title = option.description ?? "";
  if (option.label) block.append(el("div", "perf-chips-label", option.label));
  const row = el("div", "perf-chips");
  for (const item of option.items ?? []) {
    const key = `${option.key}.${item.id}`;
    const chip = el("button", "perf-chip", item.label);
    chip.type = "button";
    chip.title = item.description ?? "";
    chip.disabled = Boolean(locked);
    if (getOption(mod.id, key)) chip.classList.add("perf-chip--on");
    chip.addEventListener("click", () => {
      setOption(mod.id, key, !getOption(mod.id, key), false);
      chip.classList.toggle("perf-chip--on", getOption(mod.id, key));
    });
    row.append(chip);
  }
  block.append(row);
  return block;
}

function buildOptions(mod, locked) {
  const options = registry.get(mod.id)?.options ?? [];
  if (options.length === 0) return null;
  const wrap = el("div", "perf-opts");
  for (const option of options) {
    if (option.type === "chips") {
      wrap.append(buildChips(mod, option, locked));
      continue;
    }
    if (!option.children?.length) {
      wrap.append(buildOptionRow(mod, option, locked));
      continue;
    }
    const group = el("div", "perf-opt-group");
    const head = el("div", "perf-opt-head");
    const caret = el("span", "perf-caret");
    caret.setAttribute("role", "button");
    caret.setAttribute("aria-label", `Show ${mod.name} options`);
    const kids = el("div", "perf-opt-children");
    const childBoxes = option.children.map((child) => buildOptionRow(mod, child, locked || !getOption(mod.id, option.key)));
    kids.append(...childBoxes);
    const master = buildOptionRow(mod, option, locked, (checked) => {
      for (const box of childBoxes) setCheckboxDisabled(box, !checked || locked);
      setOption(mod.id, option.key, checked, false);
    });
    const groupKey = `${mod.id}:${option.key}`;
    const setExpanded = (open) => {
      optionGroupState.set(groupKey, open);
      kids.style.display = open ? "" : "none";
      caret.classList.toggle("perf-caret--open", open);
    };
    setExpanded(optionGroupState.get(groupKey) ?? false);
    caret.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(!(optionGroupState.get(groupKey) ?? false));
    });
    head.append(master, caret);
    group.append(head, kids);
    wrap.append(group);
  }
  return wrap;
}

function installedModules() {
  return getAvailableModules().filter(isInstalled);
}

function masterLocked() {
  return installedModules().length > 0 && state.masterLocked === true;
}

function disableAllPlugins() {
  state.masterLocked = true;
  saveState();
  for (const entry of registry.values()) {
    applyLifecycle(entry, false);
    trackUnload(entry.id);
  }
  refreshPanel();
}

function enableAllPlugins() {
  state.masterLocked = false;
  saveState();
  for (const entry of registry.values()) {
    applyLifecycle(entry, isPluginEnabled(entry.id));
    trackUnload(entry.id);
  }
  loadEnabledModules().then(refreshPanel);
  refreshPanel();
}

function applySearchFilter(panel = document.getElementById(PANEL_ID)) {
  if (!panel) return;
  let shown = 0;
  for (const card of panel.querySelectorAll(".perf-card")) {
    const match = !searchQuery || (card.dataset.search ?? "").includes(searchQuery);
    card.style.display = match ? "" : "none";
    if (match) shown += 1;
  }
  const scroller = panel.querySelector("lol-uikit-scrollable");
  let empty = panel.querySelector(".perf-no-match");
  if (shown === 0 && getAvailableModules().length > 0) {
    if (!empty && scroller) {
      empty = el("div", "perf-empty perf-no-match", "No plugins match your search.");
      scroller.append(empty);
    }
  } else if (empty) {
    empty.remove();
  }
}

function buildTools() {
  const tools = el("div", "perf-tools");

  const field = el("lol-uikit-flat-input");
  field.setAttribute("type", "search");
  const search = el("input");
  search.type = "search";
  search.placeholder = "Search plugins...";
  search.value = searchQuery;
  search.setAttribute("aria-label", "Search plugins");
  search.addEventListener("input", () => {
    searchQuery = search.value.trim().toLowerCase();
    applySearchFilter();
  });
  field.append(search);

  const master = buildButton("lol-uikit-flat-button-secondary", masterLocked() ? "Enable All" : "Disable All", () => {
    if (masterLocked()) enableAllPlugins();
    else disableAllPlugins();
  });
  if (installedModules().length === 0) master.setAttribute("disabled", "true");

  tools.append(field, master);
  return tools;
}

function buildCard(mod, locked) {
  const installed = isInstalled(mod);
  const card = el("div", installed ? "perf-card" : "perf-card perf-card--missing");
  if (locked) card.classList.add("perf-card--locked");
  card.dataset.search = `${mod.name} ${mod.description}`.toLowerCase();

  const info = el("div", "perf-info");
  const name = el("div", "perf-name", mod.name);
  name.append(el("span", "perf-version", `v${registry.get(mod.id)?.version ?? mod.version}`));
  info.append(name);
  if (mod.description) info.append(el("div", "perf-desc", mod.description));
  const optionList = buildOptions(mod, locked);
  if (optionList) info.append(optionList);

  const actions = el("div", "perf-actions");
  if (installed) {
    actions.append(buildCheckbox("", isPluginEnabled(mod.id), locked, (checked) => setPluginEnabled(mod.id, checked), `Enable ${mod.name}`));
    const remove = el("button", "perf-uninstall");
    remove.type = "button";
    remove.title = `Uninstall ${mod.name}`;
    remove.setAttribute("aria-label", `Uninstall ${mod.name}`);
    remove.addEventListener("click", () => uninstallModule(mod).catch((error) => logError(`could not uninstall ${mod.name}.`, error)));
    actions.append(remove);
  } else {
    actions.append(
      buildButton(
        "lol-uikit-flat-button-secondary",
        "Install",
        (button) => {
          button.setAttribute("disabled", "true");
          button.textContent = "Installing";
          installModule(mod).catch((error) => {
            logError(`could not install ${mod.name}.`, error);
            button.removeAttribute("disabled");
            button.textContent = "Install";
          });
        },
        `Install ${mod.name}`,
      ),
    );
  }

  card.append(info, actions);
  return card;
}

function buildPanel() {
  const panel = el("div");
  panel.id = PANEL_ID;
  panel.append(buildTools());
  if (needsReload()) {
    panel.append(el("div", "lol-settings-general-subtitle perf-notice", "Press Done to reload the client and apply your changes."));
  }

  const scroller = el("lol-uikit-scrollable");
  scroller.setAttribute("overflow-masks", "enabled");
  panel.append(scroller);

  const modules = getAvailableModules();
  if (modules.length === 0) {
    scroller.append(el("div", "perf-empty", "No plugins are available."));
    return panel;
  }
  const locked = masterLocked();
  for (const mod of modules) scroller.append(buildCard(mod, locked));
  applySearchFilter(panel);
  return panel;
}

function panelScrollTop(panel) {
  return panel?.querySelector("lol-uikit-scrollable")?.scrollTop ?? 0;
}

function applyScrollTop(panel, top) {
  if (!top || !panel) return;
  const host = panel.querySelector("lol-uikit-scrollable");
  if (host) host.scrollTop = top;
}

function refreshPanel() {
  const current = document.getElementById(PANEL_ID);
  if (!current) return;
  const top = panelScrollTop(current);
  const focused = document.activeElement?.closest?.(`#${PANEL_ID} .perf-toolbar`) ? document.activeElement : null;
  const next = buildPanel();
  current.replaceWith(next);
  if (panel) panel.element = next;
  if (focused) next.querySelector(".perf-toolbar input")?.focus();
  if (!top) return;
  applyScrollTop(next, top);
  requestAnimationFrame(() => applyScrollTop(next, top));
}

// The native settings modal is not destroyed when it closes: the client detaches it and re-attaches the
// same DOM on the next open. While our page is open, a class on the settings container hides the client's
// options pane and tab highlight and swaps the breadcrumb, all in CSS, so nothing the client renders is
// ever modified. `panel` holds direct references, so it can be torn down even after the modal is detached.
let panel = null;

function ownNav() {
  return document.getElementById(NAV_ID);
}

function measureCrumb(container) {
  const group = container.querySelector(".lol-settings-header-group-name");
  const current = container.querySelector(".lol-settings-title-current");
  if (group) {
    const style = getComputedStyle(group);
    container.style.setProperty("--perf-crumb-group-size", style.fontSize);
    container.style.setProperty("--perf-crumb-group-spacing", style.letterSpacing);
  }
  if (current) {
    const style = getComputedStyle(current);
    container.style.setProperty("--perf-crumb-size", style.fontSize);
    container.style.setProperty("--perf-crumb-spacing", style.letterSpacing);
  }
  const idle = container.querySelector(`lol-uikit-navigation-item.lol-settings-nav:not(#${NAV_ID}):not([active])`);
  if (idle) container.style.setProperty("--perf-nav-pad", getComputedStyle(idle).paddingLeft);
}

function openPanel() {
  const content = document.querySelector(".lol-settings-content");
  const container = content?.closest(".lol-settings-container");
  if (!content || !container) return;
  if (panel && panel.content !== content) closePanel();
  if (!panel) {
    measureCrumb(container);
    panel = { content, container, element: null, nav: ownNav() };
  }
  syncPanel();
}

function syncPanel() {
  if (!panel) return;
  const { content, container } = panel;
  if (!content.isConnected) {
    closePanel();
    return;
  }
  if (!container.classList.contains(OPEN_CLASS)) container.classList.add(OPEN_CLASS);
  if (!panel.element || !panel.element.isConnected || panel.element.parentElement !== content) {
    panel.element?.remove();
    panel.element = buildPanel();
    content.append(panel.element);
  }
  const nav = ownNav();
  panel.nav = nav;
  if (nav && nav.getAttribute("active") !== "true") nav.setAttribute("active", "true");
}

// Runs in the capture phase of a native tab click (before the client handles it), and when the settings
// modal is detached, so the next open starts clean on the client's own tab.
function closePanel() {
  if (!panel) return;
  const closing = panel;
  panel = null;
  const current = document.getElementById(PANEL_ID);
  if (current && current !== closing.element) current.remove();
  closing.element?.remove();
  closing.container.classList.remove(OPEN_CLASS);
  closing.nav?.removeAttribute("active");
  ownNav()?.removeAttribute("active");
}

function keepOwnNavQuiet(nav) {
  // The uikit navigation bar auto-selects its first item; ours must only light up while our page is open.
  const quiet = new MutationObserver(() => {
    if (!panel && nav.hasAttribute("active")) nav.removeAttribute("active");
  });
  quiet.observe(nav, { attributes: true, attributeFilter: ["active"] });
}

function ensureSettingsTab(titleNode) {
  if (ownNav()) return;
  const scope = titleNode.closest("lol-uikit-scrollable") ?? titleNode.parentElement;
  const firstTitle = scope?.querySelector(".lol-settings-nav-title:not([data-perfectionist])");
  if (!firstTitle) return;

  const groupTitle = el("div", "lol-settings-nav-title", GROUP_TITLE);
  groupTitle.dataset.perfectionist = "title";

  const item = document.createElement("lol-uikit-navigation-item");
  item.id = NAV_ID;
  item.className = "lol-settings-nav";
  item.setAttribute("name", "perfectionist-plugins");
  item.append(el("div", null, TAB_TITLE.toUpperCase()));

  const bar = document.createElement("lol-uikit-navigation-bar");
  bar.setAttribute("direction", "down");
  bar.setAttribute("type", "tabbed");
  bar.setAttribute("selectedindex", "-1");
  bar.dataset.perfectionist = "bar";
  bar.append(item);

  firstTitle.before(groupTitle, bar);
  keepOwnNavQuiet(item);
  if (!panel) item.removeAttribute("active");
}

function isDoneButton(target) {
  if (target.closest(".lol-settings-close-button")) return true;
  const button = target.closest("button, lol-uikit-flat-button, [role=button]");
  return !!button && !!button.closest(".lol-settings-container") && /^\s*done\s*$/i.test(button.textContent ?? "");
}

function onSettingsClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (needsReload() && isDoneButton(target)) {
    pendingReload = false;
    unloadPending.clear();
    reloadClientNow();
    return;
  }
  if (target.closest(`#${NAV_ID}`)) {
    event.stopPropagation();
    event.preventDefault();
    openPanel();
    return;
  }
  if (!panel) return;
  const nativeNav = target.closest(".lol-settings-nav");
  if (nativeNav && nativeNav.id !== NAV_ID && nativeNav.closest(".lol-settings-container")) closePanel();
}

function installSettingsTab() {
  addStyle(STYLE_ID, STYLE_CSS);
  document.addEventListener("click", onSettingsClick, true);
  onFrame(() => {
    if (panel) syncPanel();
  });
  watch(".lol-settings-nav-title", ensureSettingsTab);
}

const utils = {
  version,
  registerPlugin,
  unregisterPlugin,
  setPluginEnabled,
  isPluginEnabled,
  getPlugins,
  getOption,
  setOption,
  getAvailableModules,
  installModule,
  uninstallModule,
  watch,
  waitFor,
  onFrame,
  addStyle,
  lcu: { get: lcuGet, send: lcuSend },
  subscribe,
  whenRcpReady,
  transformBinding,
};

export async function init(context, coordsProvided) {
  if (coreStarted || window.PerfectionistUtils) return;
  coreStarted = true;
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
  } catch (error) {
    logError("startup failed.", error);
  }
}
