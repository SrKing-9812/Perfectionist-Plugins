const PKG = "perfectionist-plugins";
const CDN = "https://cdn.jsdelivr.net/npm";
const REGISTRY_URL = `https://registry.npmjs.org/${PKG}/latest`;

let bootPromise = null;

export async function resolveVersion() {
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
  if (!bootPromise) bootPromise = boot(context, tools);
  return bootPromise;
}

async function boot(context, tools) {
  const version = await resolveVersion();
  const load = tools?.importModule ?? ((url) => import(url));
  const candidates = [
    `${CDN}/${PKG}@${version}/perfectionist-utils.js`,
    `${CDN}/${PKG}@latest/perfectionist-utils.js`,
  ];

  let core = null;
  let loaded = version;
  for (let i = 0; i < candidates.length; i += 1) {
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
}
