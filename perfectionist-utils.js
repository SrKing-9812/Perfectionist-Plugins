const READY_EVENT = "perfectionist:utils-ready";
const STATE_KEY = "perfectionist-plugins:state";
const NAV_ID = "perfectionist-plugins-nav";
const PANEL_ID = "perfectionist-plugins-panel";
const STYLE_ID = "perfectionist-plugins-style";
const TAB_TITLE = "Perfectionism";

export const version = "2.4.0";

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
    version: "1.7.0",
    description: "Makes the client lighter and smoother without changing how it looks. Cuts tracking and repeated requests and fixes small bugs. Has an optional Performance mode for slower PCs.",
  },
  {
    id: "ban-blocker",
    file: "ban-blocker.js",
    name: "Ban Blocker",
    version: "3.6.0",
    description: "Adds a BLOCK button to your teammates in champ select. While a teammate is blocked, the champion they are about to ban is prepicked for you, so their ban can never land on it.",
  },
  {
    id: "unlock-profile-skins",
    file: "unlock-profile-skins.js",
    name: "Unlock Profile Skins",
    version: "1.2.4",
    description: "Shows every skin as unlocked in the Set profile background window, event skins included, so you can pick any skin as your profile background.",
  },
  {
    id: "hide-unowned-skins",
    file: "hide-unowned-skins.js",
    name: "Hide Unowned Skins",
    version: "2.5.1",
    description: "In champ select, the skin carousel only shows the skins you own for the champion you picked.",
  },
  {
    id: "auto-accept",
    file: "auto-accept.js",
    name: "Auto Accept",
    version: "1.1.2",
    description: "Accepts the match for you when the ready check pops up. Add an optional delay, and switch it on or off from the lobby footer.",
  },
  {
    id: "dodge-helper",
    file: "dodge-helper.js",
    name: "Dodge Helper",
    version: "1.4.2",
    description: "Adds a button to leave champ select: DODGE in ranked Solo/Duo and Flex, with the estimated LP you will lose, and QUIT in every other mode.",
  },
  {
    id: "auto-claimer",
    file: "auto-claimer.js",
    name: "Auto Claimer",
    version: "1.2.0",
    description: "Claims rewards for you as soon as they are ready: event tracks, missions and the TFT Battle Pass. Optional extras can also buy 1 BE shop items and open mystery loot and chests.",
  },
  {
    id: "auto-read",
    file: "auto-read.js",
    name: "Auto Read",
    version: "1.2.0",
    description: "Marks quests, loot, Clash, TFT and client notices as read for you, so no badge or dot stays lit.",
  },
];

const STYLE_CSS = `
#${PANEL_ID} { display: flex; flex-direction: column; overflow-x: hidden; padding: 15px 20px; position: relative; width: calc(100% - 40px); box-sizing: content-box; color: #f0e6d2; font-family: "LoL Body", Arial, "Helvetica Neue", Helvetica, sans-serif; }
#${PANEL_ID} > lol-uikit-scrollable { display: block; flex: 1 1 auto; min-height: 0; }
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
#${PANEL_ID} .perf-opts { margin-top: 11px; display: flex; flex-direction: column; gap: 8px; }
#${PANEL_ID} .perf-opt { display: flex; align-items: center; gap: 9px; cursor: pointer; }
#${PANEL_ID} .perf-opt .perf-opt-label { font-size: 11px; letter-spacing: 0.3px; color: #a09b8c; }
#${PANEL_ID} .perf-opt:hover .perf-opt-label { color: #f0e6d2; }
#${PANEL_ID} .perf-opt-group { margin-top: 2px; }
#${PANEL_ID} .perf-opt-head { display: flex; align-items: center; gap: 9px; }
#${PANEL_ID} .perf-caret { flex: 0 0 auto; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; background: transparent; }
#${PANEL_ID} .perf-caret:hover { border-color: #785a28; background: #0a1428; }
#${PANEL_ID} .perf-caret::after { content: ""; width: 12px; height: 12px; transform-origin: center;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath d='M2 1l4 3-4 3z' fill='%23c89b3c'/%3E%3C/svg%3E") center / 12px 12px no-repeat;
  transition: transform 0.15s; }
#${PANEL_ID} .perf-caret:hover::after { filter: brightness(1.4); }
#${PANEL_ID} .perf-caret--open::after { transform: rotate(90deg); }
#${PANEL_ID} .perf-opt-children { margin: 8px 0 2px 25px; padding-left: 12px; display: flex; flex-direction: column; gap: 8px;
  border-left: 1px solid #785a28; }
#${PANEL_ID} .perf-toggle input:disabled + .perf-box,
#${PANEL_ID} .perf-toggle input:disabled ~ .perf-opt-label { opacity: 0.45; }
#${PANEL_ID} .perf-toggle input:disabled ~ .perf-opt-label { cursor: default; }
#${PANEL_ID} .perf-chip-block { margin-top: 11px; }
#${PANEL_ID} .perf-chips-label { font-size: 10px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #c89b3c; margin-bottom: 7px; }
#${PANEL_ID} .perf-chips { display: flex; flex-wrap: wrap; gap: 6px; }
#${PANEL_ID} .perf-chip { font-family: "LoL Body", Arial, "Helvetica Neue", Helvetica, sans-serif; font-size: 10px; font-weight: 700;
  letter-spacing: 0.5px; text-transform: uppercase; color: #a09b8c; background: #0a1428; border: 1px solid #785a28;
  padding: 6px 11px; cursor: pointer; }
#${PANEL_ID} .perf-chip:hover { color: #f0e6d2; border-color: #c89b3c; }
#${PANEL_ID} .perf-chip--on { color: #010a13; background: #c89b3c; border-color: #c89b3c; }
#${PANEL_ID} .perf-chip--on:hover { background: #f0e6d2; }
#${PANEL_ID} .perf-tools { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; margin-bottom: 14px; }
#${PANEL_ID} .perf-search { flex: 1 1 auto; min-width: 0; box-sizing: border-box;
  font-family: "LoL Body", Arial, "Helvetica Neue", Helvetica, sans-serif; font-size: 12px; letter-spacing: 0.3px;
  color: #f0e6d2; background: #0a1428; border: 1px solid #785a28; padding: 9px 12px; outline: none; }
#${PANEL_ID} .perf-search:focus { border-color: #c89b3c; }
#${PANEL_ID} .perf-search::placeholder { color: #a09b8c; }
#${PANEL_ID} .perf-master { flex: 0 0 auto; white-space: nowrap; }
#${PANEL_ID} .perf-card--locked .perf-opts { pointer-events: none; }
#${PANEL_ID} .perf-card--locked .perf-actions > .perf-toggle { pointer-events: none; }
#${PANEL_ID} .perf-card--locked .perf-caret { opacity: 0.45; }
#${PANEL_ID} .perf-card--locked .perf-chips-label { opacity: 0.45; }
#${PANEL_ID} .perf-chip:disabled { opacity: 0.45; cursor: default; }
#${PANEL_ID} .perf-chip:disabled:hover { color: #a09b8c; border-color: #785a28; background: #0a1428; }
#${PANEL_ID} .perf-chip--on:disabled:hover { color: #010a13; border-color: #c89b3c; background: #c89b3c; }
`;

const registry = new Map();
const watchers = new Map();
const requestCache = new Map();
let socket = null;
let observer = null;
let scanScheduled = false;

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

function getOption(id, key) {
  const entry = registry.get(id);
  const fallback = findOption(entry, key)?.default;
  const stored = state.options?.[id]?.[key];
  return stored === undefined ? Boolean(fallback) : Boolean(stored);
}

function setOption(id, key, value, refresh = true) {
  if (!state.options[id]) state.options[id] = {};
  state.options[id][key] = Boolean(value);
  saveState();
  const entry = registry.get(id);
  try {
    entry?.onOptionChange?.(key, Boolean(value));
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
  for (const mod of BUNDLED_MODULES) {
    if (mod.core || !isInstalled(mod) || !isPluginEnabled(mod.id)) continue;
    await loadModule(mod);
  }
}

async function loadModules() {
  if (modulesLoaded) return;
  modulesLoaded = true;
  await loadEnabledModules();
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

const optionGroupState = new Map();

function buildOptionRow(mod, option, disabled, onChange) {
  const row = el("label", "perf-opt perf-toggle");
  row.title = option.description ?? "";
  const input = el("input");
  input.type = "checkbox";
  input.checked = getOption(mod.id, option.key);
  input.disabled = Boolean(disabled);
  input.setAttribute("aria-label", `${mod.name}: ${option.label}`);
  input.addEventListener("change", () => {
    if (onChange) onChange(input.checked);
    else setOption(mod.id, option.key, input.checked, false);
  });
  row.append(input, el("span", "perf-box"), el("span", "perf-opt-label", option.label));
  return row;
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
      wrap.append(buildOptionRow(mod, option, Boolean(locked)));
      continue;
    }
    const group = el("div", "perf-opt-group");
    const head = el("div", "perf-opt-head");
    const caret = el("span", "perf-caret");
    caret.setAttribute("role", "button");
    caret.setAttribute("aria-label", `Show ${mod.name} options`);
    const kids = el("div", "perf-opt-children");
    const childInputs = [];
    for (const child of option.children) {
      const childRow = buildOptionRow(mod, child, !getOption(mod.id, option.key) || Boolean(locked));
      childInputs.push(childRow.querySelector("input"));
      kids.append(childRow);
    }
    const master = buildOptionRow(mod, option, Boolean(locked), (checked) => {
      for (const input of childInputs) input.disabled = !checked || Boolean(locked);
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

function buildToggle(mod, locked) {
  const label = el("label", "perf-toggle");
  label.title = `Enable ${mod.name}`;
  const input = el("input");
  input.type = "checkbox";
  input.checked = isPluginEnabled(mod.id);
  input.disabled = Boolean(locked);
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

  const search = el("input", "perf-search");
  search.type = "search";
  search.placeholder = "Search plugins...";
  search.value = searchQuery;
  search.setAttribute("aria-label", "Search plugins");
  search.addEventListener("input", () => {
    searchQuery = search.value.trim().toLowerCase();
    applySearchFilter();
  });

  const master = el("button", "perf-btn perf-master", masterLocked() ? "Enable All" : "Disable All");
  master.type = "button";
  master.disabled = installedModules().length === 0;
  master.addEventListener("click", () => {
    if (masterLocked()) enableAllPlugins();
    else disableAllPlugins();
  });

  tools.append(search, master);
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
  if (installed) actions.append(buildToggle(mod, locked));
  actions.append(installed ? buildUninstallButton(mod) : buildInstallButton(mod));

  card.append(info, actions);
  return card;
}

function buildPanel() {
  const panel = el("div");
  panel.id = PANEL_ID;
  panel.append(buildTools());

  const scroller = el("lol-uikit-scrollable");
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
  const next = buildPanel();
  current.replaceWith(next);
  if (!top) return;
  applyScrollTop(next, top);
  requestAnimationFrame(() => applyScrollTop(next, top));
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
let syncTimer = null;

function startSync() {
  if (syncTimer === null) syncTimer = setInterval(keepPanelInSync, 300);
}

function stopSync() {
  if (syncTimer === null) return;
  clearInterval(syncTimer);
  syncTimer = null;
}

function openPanel() {
  panelRequested = true;
  startSync();
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
    stopSync();
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
  startSync();
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
      if (needsReload() && isDoneButton(target)) {
        pendingReload = false;
        unloadPending.clear();
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
  addStyle,
  lcu: { get: lcuGet, send: lcuSend },
  subscribe,
  whenRcpReady,
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