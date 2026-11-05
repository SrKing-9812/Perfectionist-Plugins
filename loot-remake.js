export const version = "1.0.0";

const ID = "loot-remake";
const ROOT_ID = "perf-loot-root";
const STYLE_ID = "perf-loot-style";
const NAV_SELECTOR = '[class*="menu_item_navbar_loot"]';
const NAV_ITEM_SELECTOR = '[class*="menu_item_navbar_"]';
const APP_SELECTOR = '[class*="ember-application"]';
const LOOT_URI = "/lol-loot/v1/player-loot";
const CHUNK = 30;
const REFRESH_DELAY = 250;
const PASSTHROUGH_WAIT = 4000;

const ASSETS = {
  border: "/fe/lol-loot/assets/border_images/shard.png",
  borderHover: "/fe/lol-loot/assets/border_images/shard_hover.png",
  rarity: (rarity) => `/fe/lol-loot/assets/rarity_icons/rarity_${String(rarity).toLowerCase()}.png`,
  tab: (name) => `/fe/lol-loot/assets/category_icons/${name}.png`,
  currency: (name) => `/fe/lol-loot/assets/tray_icons/${name}.png`,
};

const TABS = [
  ["all", null],
  ["chest", "CHEST"],
  ["champion", "CHAMPION"],
  ["skin", "SKIN"],
  ["eternals", "ETERNAL"],
  ["emote", "EMOTE"],
  ["wardskin", "WARDSKIN"],
  ["summonericon", "SUMMONERICON"],
];

const SUB_TABS = [
  ["CRAFTING", null],
  ["THE SANCTUM", "THE SANCTUM"],
  ["MYTHIC SHOP", "MYTHIC SHOP"],
];

const TITLES = {
  MATERIAL: "Materials",
  CHAMPION: "Champions",
  SKIN: "Skins",
  ETERNAL: "Eternals",
  EMOTE: "Emotes",
  WARDSKIN: "Ward Skins",
  SUMMONERICON: "Icons",
  CHEST: "Chests",
  "": "Other",
};

const ORDER = ["MATERIAL", "CHAMPION", "SKIN", "ETERNAL", "EMOTE", "WARDSKIN", "SUMMONERICON", "CHEST", ""];
const RARITY_ICONS = new Set(["LEGENDARY", "EPIC", "RARE"]);
const TYPE_LABELS = {
  CHAMPION: "Champion Shard",
  CHAMPION_SKIN: "Skin Shard",
  WARD_SKIN: "Ward Skin",
  SUMMONER_ICON: "Summoner Icon",
  EMOTE: "Emote",
  ETERNAL: "Eternal",
};
const CURRENCIES = [
  ["CURRENCY_cosmetic", "CURRENCY_cosmetic"],
  ["MATERIAL_key", "MATERIAL_key"],
  ["CURRENCY_chest", "chest_generic"],
];
const SORT_OPTIONS = [
  ["alphabetical", "Alphabetical"],
  ["value", "Value"],
  ["rarity", "Rarity"],
  ["champion", "Champion"],
  ["activatable", "Activatable"],
  ["selected_quantity", "Selection"],
];
const ACTION_LABELS = { REROLL: "Reroll", DISENCHANT: "Disenchant", UPGRADE: "Upgrade", OPEN: "Open", CRAFT: "Craft", redeem: "Redeem" };

const CSS = `
#${ROOT_ID} { position: absolute; left: 0; right: 0; top: 80px; bottom: 0; z-index: 1; overflow: hidden; background: #010a13;
  color: #f0e6d2; font-family: "LoL Body", Arial, "Helvetica Neue", Helvetica, sans-serif; }
#${ROOT_ID} .pl-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #010a13; }
#${ROOT_ID} .pl-backdrop--static { background: radial-gradient(90% 120% at 62% 38%, #16324a 0%, #0b2236 38%, #061522 70%, #030c15 100%); }
#${ROOT_ID} .pl-veil { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(1, 10, 19, 0.55) 0%, rgba(1, 10, 19, 0.2) 42%, rgba(1, 10, 19, 0.06) 100%); }
#${ROOT_ID} .pl-subnav { position: absolute; left: 17px; top: 12px; height: 20px; }
#${ROOT_ID} .pl-subnav-item { position: absolute; top: 0; height: 20px; display: flex; align-items: center;
  font-family: "LoL Display", "Times New Roman", Times, serif; font-size: 12px; font-weight: 500;
  letter-spacing: 1.2px; text-transform: uppercase; color: #a09b8c; cursor: pointer; white-space: nowrap; }
#${ROOT_ID} .pl-subnav-item:hover { color: #f0e6d2; }
#${ROOT_ID} .pl-subnav-item--on { color: #f0e6d2; }
#${ROOT_ID} .pl-subnav-sep { position: absolute; left: 115px; top: 2px; width: 1px; height: 16px; background: #3c3c41; }
#${ROOT_ID} .pl-tabs { position: absolute; left: 1px; top: 45px; width: 60px; }
#${ROOT_ID} .pl-tab { position: relative; width: 32px; height: 32px; margin-bottom: 10px; opacity: 0.5;
  cursor: pointer; box-sizing: border-box; }
#${ROOT_ID} .pl-tab img { width: 20px; height: 20px; margin: 6px 6px 6px 18px; opacity: 0.7; display: block; }
#${ROOT_ID} .pl-tab:hover { opacity: 0.8; }
#${ROOT_ID} .pl-tab--on { opacity: 1; height: 36px; }
#${ROOT_ID} .pl-tab--on::after { content: ""; position: absolute; left: 0; top: 0; width: 4px; height: 32px; background: #c89b3c; }
#${ROOT_ID} .pl-tools { position: absolute; left: 61px; top: 45px; width: 342px; height: 32px; }
#${ROOT_ID} .pl-search { position: absolute; left: 0; top: 0; width: 200px; height: 32px; box-sizing: border-box;
  padding: 0 24px 0 27px; font-family: "LoL Body", Arial, sans-serif; font-size: 12px; letter-spacing: 1.2px; color: #a09b8c;
  background: rgba(0, 0, 0, 0.7) url("/fe/lol-static-assets/images/uikit/magnifying-glass-icon.png") 9px center / 14px no-repeat;
  border: 1px solid #785a28; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25); outline: none;
  -webkit-appearance: none; appearance: none; }
#${ROOT_ID} .pl-search:focus { border-color: #c89b3c; color: #f0e6d2; }
#${ROOT_ID} .pl-search::placeholder { color: #a09b8c; }
#${ROOT_ID} .pl-search::-webkit-search-cancel-button { display: none; }
#${ROOT_ID} .pl-clear { display: none; position: absolute; left: 176px; top: 8px; width: 16px; height: 16px;
  padding: 0; border: 0; background: transparent url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><path d='M2 2l8 8M10 2l-8 8' stroke='%23a09b8c' stroke-width='1.6' stroke-linecap='round'/></svg>") center / 12px no-repeat;
  cursor: pointer; z-index: 2; }
#${ROOT_ID} .pl-clear--on { display: block; }
#${ROOT_ID} .pl-clear:hover { filter: brightness(1.35); }
#${ROOT_ID} .pl-sort { position: absolute; left: 204px; top: 0; width: 118px; height: 32px; box-sizing: border-box;
  cursor: pointer; outline: none; background: rgba(0, 0, 0, 0.7);
  border: 1px solid transparent;
  border-image: linear-gradient(to top, #695625 0%, #a9852d 23%, #b88d35 93%, #c8aa6e 100%) 1; }
#${ROOT_ID} .pl-sort:hover, #${ROOT_ID} .pl-sort--open { border-image: linear-gradient(to top, #c89b3c, #f0e6d2) 1; }
#${ROOT_ID} .pl-sort-value { position: absolute; left: 8px; top: 8px; font-family: "LoL Body", Arial, sans-serif;
  font-size: 12px; line-height: 16px; letter-spacing: 0.3px; color: #a09b8c; }
#${ROOT_ID} .pl-sort:hover .pl-sort-value, #${ROOT_ID} .pl-sort--open .pl-sort-value { color: #f0e6d2; }
#${ROOT_ID} .pl-sort-caret { position: absolute; right: 7px; top: 10px; width: 8px; height: 12px;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='12'><path d='M1 4l3-3 3 3' fill='none' stroke='%23c8aa6e' stroke-width='1.3'/><path d='M1 8l3 3 3-3' fill='none' stroke='%23c8aa6e' stroke-width='1.3'/></svg>") center / 8px 12px no-repeat; }
#${ROOT_ID} .pl-sort-menu { display: none; position: absolute; left: -1px; top: 32px; width: 118px; box-sizing: border-box;
  background: #010a13; border: 1px solid transparent;
  border-image: linear-gradient(to top, #695625, #463714) 1; z-index: 6; }
#${ROOT_ID} .pl-sort--open .pl-sort-menu { display: block; }
#${ROOT_ID} .pl-sort-option { position: relative; height: 35px; box-sizing: border-box; padding: 0 24px 0 9px;
  display: flex; align-items: center; font-family: "LoL Body", Arial, sans-serif; font-size: 12px;
  letter-spacing: 0.3px; color: #a09b8c; cursor: pointer; }
#${ROOT_ID} .pl-sort-option:hover { background: #1e2328; color: #f0e6d2; }
#${ROOT_ID} .pl-sort-option--on { color: #f0e6d2; }
#${ROOT_ID} .pl-sort-option--on::after { content: ""; position: absolute; right: 9px; top: 11px; width: 13px; height: 13px;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><path d='M2 7.5l3.2 3.2L12 3.4' fill='none' stroke='%23c8aa6e' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>") center / 14px no-repeat; }
#${ROOT_ID} .pl-panel { position: absolute; left: 61px; top: 97px; width: 342px; height: 445px;
  overflow-y: auto; overflow-x: hidden; }
#${ROOT_ID} .pl-panel::-webkit-scrollbar { width: 11px; height: 11px; background: transparent; }
#${ROOT_ID} .pl-panel::-webkit-scrollbar-thumb { border: 3px solid transparent; border-radius: 6px;
  background-clip: padding-box; min-height: 32px; background-color: #785a28; }
#${ROOT_ID} .pl-panel::-webkit-scrollbar-thumb:hover { background-color: #c8aa6e; }
#${ROOT_ID} .pl-panel::-webkit-scrollbar-track { background: transparent; }
#${ROOT_ID} .pl-grid { width: 332px; padding: 0 0 20px; }
#${ROOT_ID} .pl-section-title { padding: 0; }
#${ROOT_ID} .pl-section-text { font-family: "LoL Display", "Times New Roman", Times, serif; font-size: 12px;
  font-weight: 700; line-height: 16px; letter-spacing: 0.9px; text-transform: uppercase; color: #a09b8c;
  padding: 5px 0 2px; }
#${ROOT_ID} .pl-section-title hr { height: 1px; margin: 2px 0 14px; border: 0;
  background: linear-gradient(90deg, rgba(120, 90, 40, 0.85) 0%, rgba(120, 90, 40, 0.25) 100%); }
#${ROOT_ID} .pl-tiles { display: flex; flex-wrap: wrap; }
#${ROOT_ID} .pl-tile { position: relative; width: 69px; height: 69px; margin: 0 12px 16px 2px; cursor: pointer; }
#${ROOT_ID} .pl-art { position: absolute; inset: 0; background-color: #0a1428; background-size: cover; background-position: center; }
#${ROOT_ID} .pl-art::after { content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(1, 10, 19, 0) 55%, rgba(1, 10, 19, 0.6) 100%); }
#${ROOT_ID} .pl-frame { position: absolute; left: -1px; top: 0; width: 70px; height: 70px;
  background-size: 100% 100%; background-repeat: no-repeat; pointer-events: none; }
#${ROOT_ID} .pl-frame--hover { opacity: 0; }
#${ROOT_ID} .pl-tile:hover .pl-frame--hover, #${ROOT_ID} .pl-tile--on .pl-frame--hover { opacity: 1; }
#${ROOT_ID} .pl-tile--legendary .pl-frame { filter: sepia(0.4) saturate(1.35) brightness(1.12); }
#${ROOT_ID} .pl-rarity { position: absolute; left: 1px; top: 1px; width: 14px; height: 14px; z-index: 2; pointer-events: none; }
#${ROOT_ID} .pl-count { position: absolute; right: 2px; bottom: 1px; z-index: 2; font-size: 11px; font-weight: 700;
  color: #f0e6d2; text-shadow: 0 0 3px #000, 0 0 6px #000; pointer-events: none; }
#${ROOT_ID} .pl-new { position: absolute; right: 3px; top: 3px; width: 6px; height: 6px; z-index: 2;
  border-radius: 50%; background: #c89b3c; box-shadow: 0 0 5px #c89b3c; pointer-events: none; }
#${ROOT_ID} .pl-detail { position: absolute; left: 430px; top: 97px; width: 420px; display: none; }
#${ROOT_ID} .pl-detail--on { display: block; }
#${ROOT_ID} .pl-toast { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 7;
  padding: 9px 16px; background: rgba(1, 10, 19, 0.96); border: 1px solid #785a28;
  font-size: 12px; letter-spacing: 0.4px; color: #cdbe91; white-space: nowrap; }
#${ROOT_ID} .pl-detail-art { width: 100%; height: 236px; background-size: cover; background-position: center;
  border: 1px solid rgba(120, 90, 40, 0.6); box-sizing: border-box; background-color: #0a1428; }
#${ROOT_ID} .pl-detail-name { margin-top: 12px; font-family: "LoL Display", "Times New Roman", Times, serif;
  font-size: 16px; letter-spacing: 0.8px; text-transform: uppercase; color: #f0e6d2; }
#${ROOT_ID} .pl-detail-meta { margin-top: 6px; font-size: 12px; letter-spacing: 0.3px; color: #a09b8c; line-height: 1.6; }
#${ROOT_ID} .pl-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
#${ROOT_ID} .pl-action { font-family: "LoL Body", Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1px;
  text-transform: uppercase; color: #c89b3c; background: #0a1428; border: 1px solid #785a28; padding: 8px 14px; cursor: pointer; }
#${ROOT_ID} .pl-action:hover { color: #f0e6d2; border-color: #c89b3c; background: #1e2328; }
#${ROOT_ID} .pl-action:disabled { opacity: 0.45; cursor: default; }
#${ROOT_ID} .pl-cost { display: block; font-size: 10px; letter-spacing: 0.4px; color: #a09b8c; text-transform: none; margin-top: 2px; }
#${ROOT_ID} .pl-footer { position: absolute; left: 3px; top: 562px; width: 400px; height: 63px; }
#${ROOT_ID} .pl-footer::before { content: ""; position: absolute; left: 0; top: 0; width: 330px; height: 1px;
  background: linear-gradient(90deg, rgba(120, 90, 40, 0.75), rgba(120, 90, 40, 0.1)); }
#${ROOT_ID} .pl-help { position: absolute; left: 14px; top: 27px; width: 25px; height: 25px; cursor: pointer;
  background: url("/fe/lol-loot/assets/flexible_crafter/button-crafter-tooltip.png") center / contain no-repeat; opacity: 0.85; }
#${ROOT_ID} .pl-help:hover { opacity: 1; }
#${ROOT_ID} .pl-store { position: absolute; left: 70px; top: 21px; width: 72px; height: 38px; cursor: pointer;
  background: url("/fe/lol-loot/assets/purchase_buttons/chest_generic.png") center / contain no-repeat; }
#${ROOT_ID} .pl-currencies { position: absolute; left: 0; top: 0; width: 400px; height: 63px; pointer-events: none; }
#${ROOT_ID} .pl-currency { position: absolute; top: 16px; width: 40px; text-align: center; }
#${ROOT_ID} .pl-currency-icon { width: 26px; height: 26px; margin: 0 auto; background-size: contain;
  background-repeat: no-repeat; background-position: center; }
#${ROOT_ID} .pl-currency-text { margin-top: 5px; font-family: "LoL Display", "Times New Roman", Times, serif;
  font-size: 12px; font-weight: 700; letter-spacing: 0.9px; color: #a09b8c; }
#${ROOT_ID} .pl-empty { padding: 18px 2px; font-size: 12px; color: #a09b8c; }
#${ROOT_ID} .pl-tip { position: fixed; z-index: 5; display: none; width: 300px; box-sizing: border-box;
  background: #010a13; border: 1px solid #785a28; box-shadow: 0 0 18px rgba(0, 0, 0, 0.75); pointer-events: none;
  font-family: "LoL Body", Arial, sans-serif; font-size: 12px; line-height: 16px; letter-spacing: 0.3px; color: #a09b8c; }
#${ROOT_ID} .pl-tip-tag { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); z-index: 2; height: 20px;
  padding: 0 12px; display: none; align-items: center; background: #010a13; border: 1px solid #785a28;
  font-family: "LoL Display", "Times New Roman", Times, serif; font-size: 11px; letter-spacing: 0.8px;
  text-transform: uppercase; color: #a09b8c; white-space: nowrap; }
#${ROOT_ID} .pl-tip--tag .pl-tip-tag { display: flex; }
#${ROOT_ID} .pl-tip-art { position: relative; height: 150px; background-size: cover; background-position: center;
  background-color: #0a1428; border-bottom: 1px solid #785a28; }
#${ROOT_ID} .pl-tip-art::after { content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(1, 10, 19, 0) 60%, rgba(1, 10, 19, 0.75) 100%); }
#${ROOT_ID} .pl-tip-head { padding: 8px 16px 9px; }
#${ROOT_ID} .pl-tip-name { font-family: "LoL Display", "Times New Roman", Times, serif; font-size: 14px;
  font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #c8aa6e; }
#${ROOT_ID} .pl-tip-value-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; color: #a09b8c; }
#${ROOT_ID} .pl-tip-value-row img { width: 14px; height: 14px; }
#${ROOT_ID} .pl-tip-meta { margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(120, 90, 40, 0.35);
  font-size: 11px; color: #a09b8c; }
#${ROOT_ID} .pl-tip-meta img { width: 12px; height: 12px; margin-right: 5px; vertical-align: -2px; }
#${ROOT_ID} .pl-tip-body { border-top: 1px solid #1e2328; padding: 8px 16px 9px; }
#${ROOT_ID} .pl-tip-line { display: flex; align-items: center; justify-content: space-between; min-height: 22px; }
#${ROOT_ID} .pl-tip-line-name { color: #a09b8c; }
#${ROOT_ID} .pl-tip-line-value { display: flex; align-items: center; gap: 6px; color: #a09b8c; }
#${ROOT_ID} .pl-tip-line-value img { width: 14px; height: 14px; }
#${ROOT_ID} .pl-modal { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center;
  background: rgba(1, 10, 19, 0.72); }
#${ROOT_ID} .pl-modal-box { width: 430px; box-sizing: border-box; padding: 22px 26px; background: #010a13;
  border: 1px solid #785a28; box-shadow: 0 0 32px rgba(0, 0, 0, 0.8); }
#${ROOT_ID} .pl-modal-title { font-family: "LoL Display", "Times New Roman", Times, serif; font-size: 15px; font-weight: 700;
  letter-spacing: 1.05px; text-transform: uppercase; color: #f0e6d2; }
#${ROOT_ID} .pl-modal-body { margin-top: 12px; font-size: 12px; line-height: 1.6; color: #a09b8c; }
#${ROOT_ID} .pl-modal-buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
`;

let api = null;
let styleRemover = null;
let root = null;
let hiddenApp = null;
let observer = null;
let unsubscribe = null;
let actionBusy = false;
let refreshTimer = null;
let searchTimer = null;
let selectedId = null;
let filter = null;
let sortMode = "alphabetical";
let sortOpen = false;
let items = [];
let currencies = [];
let actions = [];
let pendingAction = null;
let failed = false;
let active = false;
let passthrough = false;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const CSS_ESCAPE = (value) => String(value).replace(/["\\]/g, "");
const isValidNav = () => !!document.querySelector(NAV_SELECTOR) && !!document.querySelector(".screen-root");
const imageOf = (item) => item.tilePath || item.splashPath || "";
const nameOf = (item) => item.itemDesc || item.localizedName || item.lootName || "";
const categoryOf = (item) => (TITLES[item.displayCategories] !== undefined ? item.displayCategories : String(item.displayCategories ?? "").toUpperCase());
const essenceOf = (item) => (item.disenchantValue > 0 ? `${item.disenchantValue} ${String(item.disenchantLootName ?? "").replace(/^CURRENCY_/i, "").toLowerCase()}` : "");

function metaOf(item) {
  const parts = [];
  const rarity = item.rarity ? String(item.rarity).toLowerCase() : "";
  if (rarity && rarity !== "default") parts.push(rarity.replace(/^./, (c) => c.toUpperCase()));
  if (item.count > 1) parts.push(`${item.count} owned`);
  if (item.isRental) parts.push("Rental");
  const essence = essenceOf(item);
  if (essence) parts.push(essence);
  return parts.join(" · ");
}

const RARITY_RANK = { MYTHIC: 6, LEGENDARY: 5, EPIC: 4, RARE: 3, UNCOMMON: 2, COMMON: 1 };

function groupItems(list) {
  const groups = new Map();
  for (const item of list) {
    const category = categoryOf(item);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  const compare = (a, b) => {
    if (sortMode === "value") return (b.value ?? 0) - (a.value ?? 0);
    if (sortMode === "rarity") return (RARITY_RANK[String(b.rarity ?? "").toUpperCase()] ?? 0) - (RARITY_RANK[String(a.rarity ?? "").toUpperCase()] ?? 0) || nameOf(a).localeCompare(nameOf(b));
    if (sortMode === "champion") return String(a.itemDesc ?? "").localeCompare(String(b.itemDesc ?? "")) || nameOf(a).localeCompare(nameOf(b));
    return nameOf(a).localeCompare(nameOf(b));
  };
  for (const [, group] of groups) group.sort(compare);
  const ordered = [];
  for (const category of ORDER) {
    if (groups.has(category)) {
      ordered.push([category, groups.get(category)]);
      groups.delete(category);
    }
  }
  for (const [category, value] of groups) ordered.push([category, value]);
  return ordered;
}

function markActive() {
  const nav = document.querySelector(NAV_SELECTOR);
  if (!nav) return;
  const others = [...document.querySelectorAll(NAV_ITEM_SELECTOR)].filter((el) => el !== nav);
  const sample = others.find((el) => el.hasAttribute("active")) ?? others.find((el) => el.classList.contains("active"));
  if (!sample) return;
  if (sample.hasAttribute("active")) {
    for (const el of others) el.removeAttribute("active");
    nav.setAttribute("active", sample.getAttribute("active") || "true");
  }
  if (sample.classList.contains("active")) {
    for (const el of others) el.classList.remove("active");
    nav.classList.add("active");
  }
  nav.dataset.perfLootActive = "1";
}

function clearActive() {
  const nav = document.querySelector(NAV_SELECTOR);
  if (!nav || !nav.dataset.perfLootActive) return;
  nav.removeAttribute("active");
  nav.classList.remove("active");
  delete nav.dataset.perfLootActive;
}

function paintArt(node) {
  const src = node?.dataset?.src;
  if (!src || node.style.backgroundImage) return;
  node.style.backgroundImage = `url("${CSS_ESCAPE(src)}")`;
  delete node.dataset.src;
}

function onIntersect(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    paintArt(entry.target);
    observer?.unobserve(entry.target);
  }
}

function createTile(item) {
  const rarity = String(item.rarity ?? "").toUpperCase();
  const classes = ["pl-tile"];
  if (selectedId === item.lootId) classes.push("pl-tile--on");
  if (rarity === "LEGENDARY") classes.push("pl-tile--legendary");
  const tile = document.createElement("div");
  tile.className = classes.join(" ");
  tile.dataset.id = item.lootId;
  const art = imageOf(item);
  tile.innerHTML = `
    <div class="pl-art"${art ? ` data-src="${esc(art)}"` : ""}></div>
    <div class="pl-frame" style="background-image:url('${ASSETS.border}')"></div>
    <div class="pl-frame pl-frame--hover" style="background-image:url('${ASSETS.borderHover}')"></div>
    ${RARITY_ICONS.has(rarity) ? `<img class="pl-rarity" src="${ASSETS.rarity(rarity)}" alt="">` : ""}
    ${item.count > 1 ? `<div class="pl-count">${esc(item.count)}</div>` : ""}
    ${item.isNew ? '<div class="pl-new"></div>' : ""}`;
  const artNode = tile.querySelector(".pl-art");
  if (artNode && art) observer?.observe(artNode);
  return tile;
}

function flush(queue) {
  if (!root || !queue.length) return;
  for (const [host, item] of queue.splice(0, CHUNK)) host.append(createTile(item));
  if (queue.length) requestAnimationFrame(() => flush(queue));
}

function renderSubNav() {
  // The sub-nav is static markup: Crafting is the page this view renders and the
  // other two hand off to Riot's own tabs.
}

function renderTabs() {
  const host = root?.querySelector(".pl-tabs");
  if (!host) return;
  host.textContent = "";
  for (const [name, category] of TABS) {
    const tab = document.createElement("div");
    tab.className = category === filter ? "pl-tab pl-tab--on" : "pl-tab";
    tab.dataset.filter = name;
    tab.innerHTML = `<img src="${ASSETS.tab(name)}" alt="">`;
    host.append(tab);
  }
}

function renderFooter() {
  const host = root?.querySelector(".pl-currencies");
  if (!host) return;
  host.textContent = "";
  currencies.forEach((currency, index) => {
    const cell = document.createElement("div");
    cell.className = "pl-currency";
    cell.style.left = `${181 + index * 70}px`;
    cell.innerHTML = `<div class="pl-currency-icon" style="background-image:url('${ASSETS.currency(currency.icon)}')"></div><div class="pl-currency-text">${esc(currency.count)}</div>`;
    host.append(cell);
  });
}

function actionLabel(action) {
  return ACTION_LABELS[action.actionType] ?? action.actionType ?? "Action";
}

function renderActions() {
  const host = root?.querySelector(".pl-actions");
  if (!host) return;
  host.textContent = "";
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pl-action";
    button.dataset.action = action.name;
    button.disabled = action.enabled === false;
    const cost = action.essenceQuantity > 0 && action.essenceType
      ? `<span class="pl-cost">${esc(action.essenceQuantity)} ${esc(String(action.essenceType).replace(/^CURRENCY_/i, "").toLowerCase())}</span>`
      : action.essenceQuantity < 0 && action.essenceType
        ? `<span class="pl-cost">${esc(Math.abs(action.essenceQuantity))} ${esc(String(action.essenceType).replace(/^CURRENCY_/i, "").toLowerCase())}</span>`
        : "";
    button.innerHTML = `${esc(actionLabel(action))}${cost}`;
    host.append(button);
  }
}

function renderDetail() {
  const box = root?.querySelector(".pl-detail");
  if (!box) return;
  const item = selectedId ? items.find((entry) => entry.lootId === selectedId) : null;
  if (!item) {
    box.classList.remove("pl-detail--on");
    box.innerHTML = "";
    return;
  }
  box.classList.add("pl-detail--on");
  const art = imageOf(item);
  box.innerHTML = `
    <div class="pl-detail-art"${art ? ` style="background-image:url('${esc(art)}')"` : ""}></div>
    <div class="pl-detail-name">${esc(nameOf(item))}</div>
    <div class="pl-detail-meta">${esc(metaOf(item))}</div>
    <div class="pl-actions"></div>`;
  renderActions();
}

function renderGrid() {
  const grid = root?.querySelector(".pl-grid");
  if (!grid) return;
  grid.textContent = "";
  const query = (root.querySelector(".pl-search")?.value ?? "").trim().toLowerCase();
  const visible = items.filter(
    (item) => (!filter || categoryOf(item) === filter) && (!query || nameOf(item).toLowerCase().includes(query)),
  );
  const grouped = new Map(groupItems(visible));
  const categories = filter ? [filter] : ORDER.filter((category) => category !== "" && category !== "CHEST");
  const queue = [];
  for (const category of categories) {
    const list = grouped.get(category) ?? [];
    const section = document.createElement("div");
    section.className = "pl-section";
    const title = document.createElement("div");
    title.className = "pl-section-title";
    title.innerHTML = `<div class="pl-section-text">${esc(TITLES[category] ?? category)}</div><hr>`;
    const tiles = document.createElement("div");
    tiles.className = "pl-tiles";
    section.append(title, tiles);
    grid.append(section);
    for (const item of list) queue.push([tiles, item]);
  }
  if (!queue.length) {
    grid.innerHTML = '<div class="pl-empty">Nothing in this category.</div>';
    return;
  }
  flush(queue);
}

function deriveCurrencies(loot) {
  return CURRENCIES.map(([id, icon]) => ({
    icon,
    count: loot.find((item) => item.lootId === id)?.count ?? 0,
  }));
}

function renderSort() {
  const host = root?.querySelector(".pl-sort");
  if (!host) return;
  const label = SORT_OPTIONS.find(([id]) => id === sortMode)?.[1] ?? "Alphabetical";
  const value = host.querySelector(".pl-sort-value");
  if (value) value.textContent = label;
  host.classList.toggle("pl-sort--open", sortOpen);
  const menu = host.querySelector(".pl-sort-menu");
  if (!menu) return;
  menu.textContent = "";
  for (const [id, text] of SORT_OPTIONS) {
    const option = document.createElement("div");
    option.className = id === sortMode ? "pl-sort-option pl-sort-option--on" : "pl-sort-option";
    option.dataset.sort = id;
    option.setAttribute("role", "option");
    option.textContent = text;
    menu.append(option);
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh().catch(fail), REFRESH_DELAY);
}

async function loadActions(lootId) {
  if (!lootId) {
    actions = [];
    return;
  }
  try {
    const menu = await api.lcu.get(`/lol-loot/v1/player-loot/${encodeURIComponent(lootId)}/context-menu`, { ttl: 0 });
    actions = Array.isArray(menu) ? menu.filter((action) => action.name) : [];
  } catch {
    actions = [];
  }
}

async function refresh(force = false) {
  if (!root || !api) return;
  const loot = await api.lcu.get(LOOT_URI, { ttl: force ? 0 : 2000 });
  if (!Array.isArray(loot)) throw new Error("unexpected loot payload");
  items = loot.filter((item) => item.type !== "CURRENCY" && item.type !== "MATERIAL");
  currencies = deriveCurrencies(loot);
  if (selectedId && !items.some((item) => item.lootId === selectedId)) selectedId = null;
  await loadActions(selectedId);
  renderSubNav();
  renderTabs();
  renderSort();
  renderFooter();
  renderGrid();
  renderDetail();
}

function fail(error) {
  if (!failed) console.warn("[Loot Remake] falling back to the original page.", error);
  failed = true;
  close();
  detachListeners();
  passthrough = true;
  try {
    document.querySelector(NAV_SELECTOR)?.click();
  } catch {}
}

function mountRiotLoot() {
  passthrough = true;
  close();
  const nav = document.querySelector(NAV_SELECTOR);
  try {
    nav?.click();
  } catch {}
  setTimeout(() => {
    passthrough = false;
  }, 1200);
}

function jumpToRiotTab(label) {
  const started = Date.now();
  const tick = () => {
    const target = [...document.querySelectorAll(".loot-nav-item")].find((el) => (el.innerText || "").trim().toUpperCase() === label);
    if (target) {
      target.click();
      return;
    }
    if (Date.now() - started < PASSTHROUGH_WAIT) setTimeout(tick, 120);
  };
  tick();
}

function open() {
  if (root || failed) return;
  const backdropMode = window.PerfectionistLootBackdrop === "video" ? "video" : "static";
  try {
    const screenRoot = document.querySelector(".screen-root");
    if (!screenRoot) throw new Error("no screen root");
    if (getComputedStyle(screenRoot).position === "static") {
      screenRoot.style.position = "relative";
      screenRoot.dataset.perfLootPosition = "1";
    }
    const app = screenRoot.querySelector(APP_SELECTOR);
    if (app) {
      hiddenApp = { node: app, display: app.style.display };
      app.style.display = "none";
    }
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      ${backdropMode === "video"
        ? '<video class="pl-backdrop" src="/fe/lol-loot/assets/videos/background_ambient.webm" autoplay muted loop playsinline></video>'
        : '<div class="pl-backdrop pl-backdrop--static"></div>'}
      <div class="pl-veil"></div>
      <div class="pl-subnav">
        <div class="pl-subnav-item pl-subnav-item--on" data-subtab="CRAFTING" style="left:0">Crafting</div>
        <div class="pl-subnav-sep"></div>
        <div class="pl-subnav-item" data-subtab="THE SANCTUM" style="left:131px">The Sanctum</div>
        <div class="pl-subnav-item" data-subtab="MYTHIC SHOP" style="left:250px">Mythic Shop</div>
      </div>
      <div class="pl-tabs"></div>
      <div class="pl-tools">
        <input class="pl-search" type="search" placeholder="Search" aria-label="Search loot">
        <button class="pl-clear" type="button" aria-label="Clear search"></button>
        <div class="pl-sort" tabindex="0" role="button" aria-label="Sort loot" aria-haspopup="listbox">
          <span class="pl-sort-value">Alphabetical</span>
          <i class="pl-sort-caret"></i>
          <div class="pl-sort-menu" role="listbox"></div>
        </div>
      </div>
      <div class="pl-panel"><div class="pl-grid"></div></div>
      <div class="pl-detail"></div>
      <div class="pl-footer">
        <div class="pl-help" title="How crafting works"></div>
        <div class="pl-store" title="Loot store"></div>
        <div class="pl-currencies"></div>
      </div>
      <div class="pl-tip">
        <div class="pl-tip-tag"></div>
        <div class="pl-tip-art"></div>
        <div class="pl-tip-head"></div>
        <div class="pl-tip-body"></div>
      </div>`;
    screenRoot.append(root);
    const video = root.querySelector("video");
    if (video) {
      video.muted = true;
      video.play?.().catch(() => {});
    }
    markActive();
    selectedId = null;
    filter = null;
    sortMode = "alphabetical";
    sortOpen = false;
    observer = new IntersectionObserver(onIntersect, { rootMargin: "240px" });
    refresh().catch(fail);
    unsubscribe = api?.subscribe?.(LOOT_URI, scheduleRefresh) ?? null;
  } catch (error) {
    fail(error);
  }
}

function close() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  clearTimeout(searchTimer);
  searchTimer = null;
  unsubscribe?.();
  unsubscribe = null;
  observer?.disconnect();
  observer = null;
  root?.remove();
  root = null;
  if (hiddenApp) {
    if (hiddenApp.node.isConnected) hiddenApp.node.style.display = hiddenApp.display;
    hiddenApp = null;
  }
  clearActive();
  pendingAction = null;
  const screenRoot = document.querySelector(".screen-root");
  if (screenRoot?.dataset.perfLootPosition) {
    screenRoot.style.position = "";
    delete screenRoot.dataset.perfLootPosition;
  }
}

function confirmAction(action) {
  pendingAction = action;
  const modal = document.createElement("div");
  modal.className = "pl-modal";
  const item = items.find((entry) => entry.lootId === selectedId);
  const cost = action.essenceQuantity > 0 && action.essenceType
    ? ` This consumes ${action.essenceQuantity} ${String(action.essenceType).replace(/^CURRENCY_/i, "").toLowerCase()}.`
    : action.essenceQuantity < 0 && action.essenceType
      ? ` This costs ${Math.abs(action.essenceQuantity)} ${String(action.essenceType).replace(/^CURRENCY_/i, "").toLowerCase()}.`
      : "";
  modal.innerHTML = `
    <div class="pl-modal-box">
      <div class="pl-modal-title">${esc(actionLabel(action))} ${esc(nameOf(item))}</div>
      <div class="pl-modal-body">${esc(metaOf(item))}.${esc(cost)} This cannot be undone.</div>
      <div class="pl-modal-buttons">
        <button type="button" class="pl-action" data-modal="cancel">Cancel</button>
        <button type="button" class="pl-action" data-modal="confirm">${esc(actionLabel(action))}</button>
      </div>
    </div>`;
  root.append(modal);
}

function toast(message) {
  if (!root) return;
  const el = document.createElement("div");
  el.className = "pl-toast";
  el.textContent = message;
  root.append(el);
  setTimeout(() => el.remove(), 2800);
}

async function runAction() {
  const action = pendingAction;
  const lootId = selectedId;
  pendingAction = null;
  root?.querySelector(".pl-modal")?.remove();
  if (!action || !lootId || actionBusy || !api?.lcu?.send) return;
  actionBusy = true;
  try {
    await api.lcu.send("POST", `/lol-loot/v1/recipes/${encodeURIComponent(action.name)}/craft`, [lootId]);
    selectedId = null;
    toast(`${actionLabel(action)} complete.`);
    await refresh(true);
    setTimeout(() => refresh(true).catch(() => {}), 900);
  } catch (error) {
    toast(`${actionLabel(action)} failed: Riot rejected the request.`);
    await refresh(true).catch(() => {});
  } finally {
    actionBusy = false;
  }
}

function onInput(event) {
  const target = event.target;
  if (!(target instanceof Element) || !root?.contains(target)) return;
  if (target.classList.contains("pl-search")) {
    root.querySelector(".pl-clear")?.classList.toggle("pl-clear--on", target.value.length > 0);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGrid, 120);
  }
}

function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(NAV_SELECTOR)) return;
  if (root && target.closest(NAV_ITEM_SELECTOR)) {
    close();
    return;
  }
  if (!root || !root.contains(target)) return;

  const sortOption = target.closest(".pl-sort-option");
  if (sortOption) {
    sortMode = sortOption.dataset.sort ?? "alphabetical";
    sortOpen = false;
    renderSort();
    renderGrid();
    return;
  }
  const clearButton = target.closest(".pl-clear");
  if (clearButton) {
    const input = root.querySelector(".pl-search");
    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
    return;
  }
  const sort = target.closest(".pl-sort");
  if (sort) {
    sortOpen = !sortOpen;
    renderSort();
    return;
  }
  if (sortOpen) {
    sortOpen = false;
    renderSort();
  }
  const modalButton = target.closest("[data-modal]");
  if (modalButton) {
    if (modalButton.dataset.modal === "confirm") runAction().catch(() => {});
    else {
      pendingAction = null;
      root.querySelector(".pl-modal")?.remove();
    }
    return;
  }
  const subTab = target.closest(".pl-subnav-item");
  if (subTab?.dataset.subtab && subTab.dataset.subtab !== "CRAFTING") {
    const label = subTab.dataset.subtab;
    mountRiotLoot();
    jumpToRiotTab(label);
    return;
  }
  const actionButton = target.closest(".pl-action");
  if (actionButton && !actionButton.disabled) {
    const action = actions.find((entry) => entry.name === actionButton.dataset.action);
    if (action && action.enabled !== false) confirmAction(action);
    return;
  }
  const tile = target.closest(".pl-tile");
  if (tile) {
    selectedId = tile.dataset.id;
    for (const other of root.querySelectorAll(".pl-tile")) other.classList.toggle("pl-tile--on", other === tile);
    loadActions(selectedId).then(() => {
      renderDetail();
      if (root) renderGrid();
    });
    renderDetail();
    return;
  }
  const tab = target.closest(".pl-tab");
  if (tab) {
    filter = TABS.find(([name]) => name === tab.dataset.filter)?.[1] ?? null;
    renderTabs();
    renderGrid();
  }
}

function onNavClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(NAV_SELECTOR)) return;
  if (!active || failed || passthrough) return;
  event.stopImmediatePropagation();
  event.stopPropagation();
  event.preventDefault();
  if (!root) open();
}

function onHover(event) {
  if (!root) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const tip = root.querySelector(".pl-tip");
  if (!tip) return;
  const tile = target.closest(".pl-tile");
  if (!tile || event.type === "mouseout") {
    tip.style.display = "none";
    return;
  }
  const item = items.find((entry) => entry.lootId === tile.dataset.id);
  if (!item) return;
  const rect = tile.getBoundingClientRect();
  const tag = Number(item.upgradeEssenceValue) > 0 ? "Activatable" : "";
  tip.classList.toggle("pl-tip--tag", Boolean(tag));
  tip.querySelector(".pl-tip-tag").textContent = tag;
  const art = imageOf(item);
  tip.querySelector(".pl-tip-art").style.backgroundImage = art ? `url("${CSS_ESCAPE(art)}")` : "";
  const essenceIcon = ASSETS.currency("CURRENCY_cosmetic");
  const rarityLabel = String(item.rarity ?? "").replace(/^./, (char) => char.toUpperCase());
  const lootId = String(item.lootId ?? "");
  const typeLabel = /CHAMPION_SKIN/.test(lootId)
    ? "Skin Shard"
    : /WARD_SKIN/.test(lootId)
      ? "Ward Skin"
      : /SUMMONER_ICON/.test(lootId)
        ? "Summoner Icon"
        : /EMOTE/.test(lootId)
          ? "Emote"
          : /ETERNAL/.test(lootId)
            ? "Eternal"
            : /CHAMPION/.test(lootId)
              ? "Champion Shard"
              : TYPE_LABELS[String(item.type ?? "").replace(/_RENTAL$/, "")] ?? "";
  const gem = RARITY_ICONS.has(String(item.rarity ?? "").toUpperCase()) ? `<img src="${ASSETS.rarity(item.rarity)}" alt="">` : "";
  tip.querySelector(".pl-tip-head").innerHTML = `
    <div class="pl-tip-name">${esc(nameOf(item) || item.lootId)}</div>
    ${Number(item.value) > 0 ? `<div class="pl-tip-value-row"><img src="${esc(essenceIcon)}" alt=""><span>${esc(item.value)}</span></div>` : ""}
    <div class="pl-tip-meta">${gem}${esc([rarityLabel, typeLabel].filter(Boolean).join(" "))}</div>`;
  const rows = [];
  if (Number(item.disenchantValue) > 0) {
    rows.push(`<div class="pl-tip-line"><span class="pl-tip-line-name">Disenchant into Essence</span><span class="pl-tip-line-value"><img src="${esc(essenceIcon)}" alt="">+${esc(item.disenchantValue)}</span></div>`);
  }
  if (Number(item.upgradeEssenceValue) > 0) {
    rows.push(`<div class="pl-tip-line"><span class="pl-tip-line-name">Upgrade into Permanent</span><span class="pl-tip-line-value"><img src="${esc(essenceIcon)}" alt="">-${esc(item.upgradeEssenceValue)}</span></div>`);
  }
  tip.querySelector(".pl-tip-body").innerHTML = rows.join("");
  tip.style.display = "block";
  const width = tip.offsetWidth || 300;
  const height = tip.offsetHeight || 270;
  tip.style.left = `${Math.max(8, Math.min(rect.right + 15, innerWidth - width - 8))}px`;
  tip.style.top = `${Math.max(8, Math.min(rect.top - 61, innerHeight - height - 8))}px`;
}

function onKey(event) {
  if (event.key !== "Escape" || !root) return;
  if (sortOpen) {
    sortOpen = false;
    renderSort();
    return;
  }
  if (pendingAction) {
    pendingAction = null;
    root.querySelector(".pl-modal")?.remove();
    return;
  }
  close();
}

const EVENT_TYPES = ["mousedown", "mouseup", "click", "pointerdown", "pointerup"];

function attachListeners() {
  for (const type of EVENT_TYPES) window.addEventListener(type, onNavClick, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("mouseover", onHover, true);
  window.addEventListener("mouseout", onHover, true);
  window.addEventListener("input", onInput, true);
  window.addEventListener("change", onInput, true);
  window.addEventListener("keydown", onKey, true);
}

function detachListeners() {
  for (const type of EVENT_TYPES) window.removeEventListener(type, onNavClick, true);
  window.removeEventListener("click", onClick, true);
  window.removeEventListener("mouseover", onHover, true);
  window.removeEventListener("mouseout", onHover, true);
  window.removeEventListener("input", onInput, true);
  window.removeEventListener("change", onInput, true);
  window.removeEventListener("keydown", onKey, true);
}

export function enable(utils) {
  if (active) return;
  failed = false;
  passthrough = false;
  api = utils ?? window.PerfectionistUtils ?? null;
  if (!api?.lcu || typeof api.addStyle !== "function" || !isValidNav()) {
    failed = true;
    return;
  }
  active = true;
  try {
    styleRemover = api.addStyle(STYLE_ID, CSS);
    attachListeners();
    if (document.querySelector(".loot-application-container")) open();
  } catch (error) {
    console.warn("[Pages Remake] Loot remake failed; the original page stays in place.", error);
    disable();
  }
}

export function disable() {
  active = false;
  detachListeners();
  close();
  styleRemover?.();
  styleRemover = null;
  api = null;
}
