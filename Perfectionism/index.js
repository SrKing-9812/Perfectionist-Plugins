/*
 * index.js
 * Perfectionism (Pengu Loader) bootstrap. Pengu runs this file from the plugin folder and nothing
 * else, so it stays small and stable. It owns the module loader: downloaded plugin code lives in
 * Pengu's DataStore and is evaluated here in place of the files on disk, it picks the newer of the
 * downloaded and the on-disk core, and then hands over to the core. Every module file exports
 * `version` (its version string) and `init`.
 */

const STORE_KEY = "perfectionist-plugins:store";
const CORE_FILE = "perfectionist-utils.js";
const SAFE_FILE = /^[\w.-]+\.js$/;

/** Reads the module store: downloaded module files plus the list of uninstalled ones. */
export async function readStore() {
  let raw = null;
  try {
    raw =
      typeof DataStore !== "undefined"
        ? await DataStore.get(STORE_KEY)
        : JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch {
    raw = null;
  }
  return {
    modules: raw && typeof raw.modules === "object" && raw.modules ? raw.modules : {},
    removed: Array.isArray(raw?.removed) ? raw.removed : [],
  };
}

/** Persists the module store. */
export async function writeStore(store) {
  try {
    if (typeof DataStore !== "undefined") await DataStore.set(STORE_KEY, store);
    else localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    console.error("[Perfectionism] Could not save the module store.", error);
    return false;
  }
}

/** True when a is a newer version than b ("1.10.0" > "1.9.0"). */
export function newerVersion(a, b) {
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

/** Pulls the version number out of module source ('version = "2.0.0"'). */
export function parseVersion(text) {
  const match = text && /version\s*[:=]\s*["'](\d+(?:\.\d+)+)["']/i.exec(text);
  return match ? match[1] : null;
}

/**
 * Runs module source and resolves with its exports. The source must be an ES module body without
 * imports or top-level await: a downloaded file has no URL to resolve imports against.
 */
export async function evaluateModule(code) {
  const names = [];
  for (const match of code.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  const body = `"use strict";\n${code.replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/g, "")}\nreturn {${names.join(", ")}};`;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction(body)();
}

/** Imports a module file from this plugin folder. */
export function importDisk(file) {
  if (!SAFE_FILE.test(file)) throw new Error(`refusing to import "${file}"`);
  return import(new URL(file, import.meta.url).href);
}

/** The core: the downloaded copy when it is newer than the file on disk. */
async function resolveCore(store) {
  const overlay = store.modules[CORE_FILE];
  let disk = null;
  try {
    disk = await importDisk(CORE_FILE);
  } catch {
    disk = null;
  }
  if (!overlay?.code || store.removed.includes(CORE_FILE)) return disk;
  let downloaded = null;
  try {
    downloaded = await evaluateModule(overlay.code);
  } catch (error) {
    console.error("[Perfectionism] Downloaded core is broken, using the file on disk.", error);
  }
  if (disk && downloaded) return newerVersion(disk.version, overlay.version) ? disk : downloaded;
  return downloaded ?? disk;
}

/** Pengu entry point: load the core and hand it the module loader. */
export function init(context) {
  return start(context);
}

async function start(context) {
  const loader = { evaluateModule, importDisk, readStore, writeStore, newerVersion, parseVersion };
  const core = await resolveCore(await readStore());
  if (!core?.init) {
    console.error("[Perfectionism] Could not load the core.");
    return;
  }
  core.init(context, loader);
  await core.boot?.(context, loader);
}
