/*
 * Perfectionism (Pengu Loader).
 *
 * The whole suite lives in the npm package "perfectionist-plugins", so this file never needs
 * updating: every client start it pins the newest published version and imports the core from
 * jsDelivr. Installing, uninstalling and updates are handled inside the suite (Settings >
 * Perfectionism). This folder holds no plugin code, so uninstalling leaves nothing behind.
 */

const STATE_KEY = "perfectionist-plugins:state";
const PKG = "perfectionist-plugins";
const CDN = "https://cdn.jsdelivr.net/npm";
const REGISTRY_URL = `https://registry.npmjs.org/${PKG}/latest`;

/** The version to load: the one pinned by the last update, else the newest on npm, else latest. */
export async function resolveVersion() {
  try {
    const saved = typeof DataStore !== "undefined" ? await DataStore.get(STATE_KEY) : null;
    // "latest" is a fallback, not a pin: re-check npm so a normal pinned boot can resume.
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

/** Pengu entry point: load the core from npm and hand over to it. */
export function init(context, tools) {
  return boot(context, tools);
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
      // If the pinned core is gone, run at @latest instead of handing the core a dead version.
      loaded = i === 0 ? version : "latest";
      break;
    } catch (error) {
      console.error(`[Perfectionism] Could not load ${candidates[i]}`, error);
    }
  }
  if (!core?.init) return;
  await core.init(context, { version: loaded });
}
