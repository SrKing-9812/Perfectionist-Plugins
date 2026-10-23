const STATE_KEY = "perfectionist-plugins:state";
const CACHE_KEY = "perfectionist-plugins:cache";
const PKG = "perfectionist-plugins";
const CDN = "https://cdn.jsdelivr.net/npm";
const REGISTRY_URL = `https://registry.npmjs.org/${PKG}/latest`;

export async function resolveVersion() {
  try {
    const saved = typeof DataStore !== "undefined" ? await DataStore.get(STATE_KEY) : null;
    if (saved?.version && saved.version !== "latest") return saved.version;
  } catch {}
  try {
    const response = await fetch(REGISTRY_URL, { cache: "no-store" });
    if (response.ok) {
      const latest = (await response.json())?.version;
      if (latest) return latest;
    }
  } catch {}
  return "latest";
}

export function init(context, tools) {
  runCachedPlugins();
  return boot(context, tools);
}

function runCachedPlugins() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    for (const [id, source] of Object.entries(cache?.files ?? {})) {
      if (saved?.installed?.[id] === false) continue;
      runPluginSource(id, source);
    }
  } catch (error) {
    console.error("[Perfectionism] Could not run the cached plugin code.", error);
  }
}

function runPluginSource(id, source) {
  try {
    const factory = new Function(
      `"use strict";\n${String(source).replace(/^export /gm, "")}\nreturn typeof init === "function" ? init : null;`,
    );
    factory()?.();
  } catch (error) {
    console.error(`[Perfectionism] Could not run the cached ${id}.`, error);
  }
}

async function boot(context, tools) {
  const version = await resolveVersion();
  const load = tools?.importModule ?? ((url) => import(url));
  const candidates = [`${CDN}/${PKG}@${version}/perfectionist-utils.js`, `${CDN}/${PKG}@latest/perfectionist-utils.js`];
  let core = null;
  let loaded = version;
  for (let i = 0; i < candidates.length; i++) {
    try {
      core = await load(candidates[i]);
      loaded = i === 0 ? version : "latest";
      break;
    } catch (error) {
      console.error(`[Perfectionism] Could not load ${candidates[i]}`, error);
    }
  }
  if (!core?.init) return;
  await core.init(context, { version: loaded });
  await cacheRunningPlugins(loaded);
}

async function cacheRunningPlugins(version) {
  try {
    const modules = window.PerfectionistUtils?.getAvailableModules?.() ?? [];
    const files = {};
    for (const mod of modules) {
      const response = await fetch(`${CDN}/${PKG}@${version}/${mod.file}`, { cache: "force-cache" });
      const text = await response.text();
      if (!response.ok || !text) return;
      files[mod.id] = text;
    }
    if (Object.keys(files).length > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version, files }));
    }
  } catch {
  }
}
