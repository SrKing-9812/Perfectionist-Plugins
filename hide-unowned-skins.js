export const version = "3.0.0";

const PLUGIN_ID = "hide-unowned-skins";

// Champ select reads the skin carousel through its own (rcp-fe-lol-champ-select) data binding. Removing
// the locked skins there means the client itself builds the carousel from owned skins only: spacing,
// arrows, dots and keyboard navigation all stay native, and nothing else in the client is affected.
const CHAMP_SELECT_PLUGIN = "rcp-fe-lol-champ-select";
const CAROUSEL_PATH = "/lol-champ-select/v1/skin-carousel-skins";

let handle = null;

function usable(skin) {
  return Boolean(skin) && (skin.unlocked === true || skin.awUnlocked === true || skin.ownership?.owned === true);
}

function ownedOnly(skins) {
  if (!Array.isArray(skins)) return skins;
  const kept = [];
  for (const skin of skins) {
    if (!skin || typeof skin !== "object") continue;
    // The base skin always stays, so the carousel is never empty.
    if (!skin.isBase && !usable(skin)) continue;
    if (Array.isArray(skin.childSkins) && skin.childSkins.some((child) => !usable(child))) {
      kept.push({ ...skin, childSkins: skin.childSkins.filter(usable) });
    } else {
      kept.push(skin);
    }
  }
  return kept;
}

function onEnable(utils) {
  handle = utils.transformBinding({
    identifier: CHAMP_SELECT_PLUGIN,
    match: (path) => path === CAROUSEL_PATH,
    transform: ownedOnly,
  });
}

function onDisable() {
  handle?.dispose();
  handle = null;
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Hide Unowned Skins",
      description: "In champion select, only shows the skins you own for the picked champion.",
      version,
      onEnable,
      onDisable,
    });
  };

  if (window.PerfectionistUtils) {
    registerWith(window.PerfectionistUtils);
  } else {
    addEventListener("perfectionist:utils-ready", (event) => registerWith(event.detail ?? window.PerfectionistUtils), { once: true });
  }
}
