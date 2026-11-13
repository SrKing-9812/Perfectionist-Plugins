export const version = "2.0.0";

const PLUGIN_ID = "unlock-profile-skins";

// The "Set profile background" window is the rcp-fe-lol-skins-picker client plugin, and nothing else in the
// client uses it. Its data binding is private to it, so unlocking the data there changes this window only:
// Collection, champ select, the store and loot keep seeing the real inventory.
const PICKER_PLUGIN = "rcp-fe-lol-skins-picker";
const CHAMPIONS_PATH = /^\/lol-champions\/v1\/inventories\/\d+\/champions$/;
const MINIMAL_PATH = /^\/lol-champions\/v1\/inventories\/\d+\/champions-minimal$/;
const AUGMENTS_PATH = /^\/lol-inventory\/v2\/inventory\/SKIN_AUGMENT$/i;
const GROUPING_SELECTOR = ".flyout-component lol-uikit-framed-dropdown.control-panel-grouping-options";
const TRANSLATIONS_URI = "/fe/lol-skins-picker/trans.json";
const TIER_KEY = "control_panel_grouping_by_tier";

const FAKE_PURCHASE_DATE = 1577836800000;
const FAKE_RENTAL_END = 4102444800000;
const SHADOW_CHAMPION_ID = 60000;

let api = null;
let active = false;
let handles = [];
let unwatchGrouping = null;
let pickerApi = null;
let pickerSelectSkin = null;
let tierLabel = null;
const augmentIds = new Set();
const variantIdRemap = new Map();

function logError(scope, error) {
  console.error(`[Perfectionism] Unlock Profile Skins: ${scope}`, error);
}

function cloneData(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function ownedRecord() {
  return {
    owned: true,
    loyaltyReward: false,
    xboxGPReward: false,
    rental: { rented: false, purchaseDate: FAKE_PURCHASE_DATE, endDate: 0, winCountRemaining: 0 },
  };
}

function unlockOwnership(ownership) {
  if (!ownership || typeof ownership !== "object") return;
  const wasOwned = ownership.owned === true && ownership.rental?.rented !== true;
  ownership.owned = true;
  if (wasOwned) return;
  const rental = ownership.rental;
  if (rental && typeof rental === "object") {
    rental.rented = false;
    rental.purchaseDate = FAKE_PURCHASE_DATE;
    if (rental.endDate !== undefined) rental.endDate = FAKE_RENTAL_END;
  }
  if (ownership.purchaseDate !== undefined) ownership.purchaseDate = FAKE_PURCHASE_DATE;
}

function unlockItem(item) {
  if (!item || typeof item !== "object") return;
  if (item.ownership && typeof item.ownership === "object") unlockOwnership(item.ownership);
  else if (typeof item.id === "number" || typeof item.contentId === "string") item.ownership = ownedRecord();
  if (item.owned === false) item.owned = true;
  if (item.unlocked === false) item.unlocked = true;
}

function unlockAugments(holder) {
  const list = holder?.skinAugments?.augments;
  if (!Array.isArray(list)) return;
  for (const aug of list) {
    if (!aug || typeof aug !== "object") continue;
    if (typeof aug.contentId === "string") augmentIds.add(aug.contentId);
    if (aug.ownership && typeof aug.ownership === "object") unlockOwnership(aug.ownership);
    else aug.ownership = ownedRecord();
  }
}

function variantLabel(overlays) {
  for (const overlay of overlays || []) {
    const match = /splash_tile_([a-z0-9]+)\.png$/i.exec(String(overlay?.tileLCOverlayPath || ""));
    if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  return "Variant";
}

// Signature/event skins keep their colour variants as augments with tile overlays on one tier. Split each
// overlay variant into its own tile so every variant can be picked; the fake ids are mapped back to the real
// tier id when the profile saves the choice (see wrapSelectSkin).
function splitVariantTiers(skin) {
  const tiers = skin?.questSkinInfo?.tiers;
  if (!Array.isArray(tiers)) return;
  const parent = typeof skin.id === "number" ? skin.id : null;
  const taken = new Set(tiers.map((tier) => tier?.id));
  const out = [];
  let sibling = 0;
  for (const tier of tiers) {
    out.push(tier);
    const augments = tier?.skinAugments?.augments;
    if (!Array.isArray(augments) || augments.length < 2) continue;
    const withOverlays = augments.filter((aug) => Array.isArray(aug?.overlays) && aug.overlays.some((o) => o?.tileLCOverlayPath));
    const plain = augments.filter((aug) => !withOverlays.includes(aug));
    if (withOverlays.length === 0 || plain.length === 0) continue;
    tier.skinAugments = { ...tier.skinAugments, augments: plain };
    for (const aug of withOverlays) {
      let id = parent !== null ? parent + 1000000 * (sibling + 1) : -((tier.id ?? 0) * 10) - sibling - 1;
      while (taken.has(id)) id += parent !== null ? 1000000 : -1;
      taken.add(id);
      sibling += 1;
      variantIdRemap.set(id, tier.id);
      out.push({
        ...tier,
        id,
        name: `${tier.name ?? ""} ${variantLabel(aug.overlays)}`.trim(),
        skinAugments: { ...tier.skinAugments, augments: [aug] },
      });
    }
  }
  skin.questSkinInfo.tiers = out;
}

function unlockSkin(skin) {
  unlockItem(skin);
  unlockAugments(skin);
  for (const chroma of Array.isArray(skin?.chromas) ? skin.chromas : []) {
    unlockItem(chroma);
    unlockAugments(chroma);
  }
  const tiers = skin?.questSkinInfo?.tiers;
  if (Array.isArray(tiers)) {
    for (const tier of tiers) {
      unlockItem(tier);
      unlockAugments(tier);
    }
    splitVariantTiers(skin);
  }
}

function unlockChampions(data) {
  if (!Array.isArray(data)) return data;
  const before = augmentIds.size;
  const out = cloneData(data).filter((champion) => !(typeof champion?.id === "number" && champion.id >= SHADOW_CHAMPION_ID));
  for (const champion of out) {
    if (!champion || typeof champion !== "object") continue;
    // The picker copies the champion's ownership onto its base skin and every tier, so an unowned
    // champion would hide all of its skins. Unlock the champion too (only inside this window).
    unlockItem(champion);
    for (const skin of Array.isArray(champion.skins) ? champion.skins : []) unlockSkin(skin);
  }
  if (augmentIds.size !== before) queueMicrotask(() => augmentHandle()?.reapply());
  return out;
}

function unlockMinimal(data) {
  if (!Array.isArray(data)) return data;
  return cloneData(data)
    .filter((champion) => !(typeof champion?.id === "number" && champion.id >= SHADOW_CHAMPION_ID))
    .map((champion) => {
      unlockItem(champion);
      return champion;
    });
}

function unlockAugmentInventory(data) {
  if (!Array.isArray(data)) return data;
  const out = cloneData(data);
  const present = new Set();
  for (const item of out) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.uuid === "string") present.add(item.uuid);
    item.owned = true;
    if (item.ownershipType !== undefined) item.ownershipType = "OWNED";
  }
  for (const id of augmentIds) {
    if (present.has(id)) continue;
    out.push({ uuid: id, inventoryType: "SKIN_AUGMENT", ownershipType: "OWNED", owned: true, quantity: 1, purchaseDate: FAKE_PURCHASE_DATE });
  }
  return out;
}

function augmentHandle() {
  return handles[2] ?? null;
}

function remapId(id) {
  const numeric = Number(id);
  return variantIdRemap.has(numeric) ? variantIdRemap.get(numeric) : id;
}

async function wrapSelectSkin() {
  try {
    const picker = await api.whenRcpReady(PICKER_PLUGIN, 60000);
    if (!active || !picker || typeof picker.selectSkin !== "function" || pickerApi) return;
    const original = picker.selectSkin;
    pickerApi = picker;
    pickerSelectSkin = original;
    picker.selectSkin = function (onSelected, onDefault, onReady) {
      const select =
        typeof onSelected === "function"
          ? function (id, ...rest) {
              return onSelected.call(this, active ? remapId(id) : id, ...rest);
            }
          : onSelected;
      return original.call(this, select, onDefault, onReady);
    };
  } catch (error) {
    logError("could not hook the skin picker.", error);
  }
}

function unwrapSelectSkin() {
  if (pickerApi && pickerSelectSkin) {
    if (Object.prototype.hasOwnProperty.call(pickerApi, "selectSkin")) delete pickerApi.selectSkin;
    if (pickerApi.selectSkin !== pickerSelectSkin && typeof pickerSelectSkin === "function") pickerApi.selectSkin = pickerSelectSkin;
  }
  pickerApi = null;
  pickerSelectSkin = null;
}

async function loadTierLabel() {
  if (tierLabel !== null) return tierLabel;
  try {
    const response = await fetch(TRANSLATIONS_URI);
    const strings = response.ok ? await response.json() : null;
    tierLabel = String(strings?.[TIER_KEY] ?? "").trim().toLowerCase();
  } catch {
    tierLabel = "";
  }
  return tierLabel;
}

async function groupByTier(dropdown) {
  const label = await loadTierLabel();
  if (!active || !dropdown.isConnected) return;
  const options = [...dropdown.querySelectorAll("lol-uikit-dropdown-option")];
  if (options.length === 0) return;
  const tier = (label && options.find((option) => option.textContent.trim().toLowerCase() === label)) ?? options[options.length - 1];
  if (tier && !tier.hasAttribute("selected")) tier.click();
}

function onEnable(utils) {
  api = utils;
  active = true;
  const transform = (match, fn) => utils.transformBinding({ identifier: PICKER_PLUGIN, match: (path) => match.test(path), transform: fn });
  handles = [
    transform(CHAMPIONS_PATH, unlockChampions),
    transform(MINIMAL_PATH, unlockMinimal),
    transform(AUGMENTS_PATH, unlockAugmentInventory),
  ];
  unwatchGrouping = utils.watch(GROUPING_SELECTOR, (dropdown) => {
    groupByTier(dropdown).catch((error) => logError("tier grouping failed.", error));
  });
  wrapSelectSkin();
}

function onDisable() {
  active = false;
  for (const handle of handles) handle.dispose();
  handles = [];
  unwatchGrouping?.();
  unwatchGrouping = null;
  unwrapSelectSkin();
  api = null;
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Unlock Profile Skins",
      description: "Unlocks every skin in the Set profile background window.",
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
