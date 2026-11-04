export const version = "0.2.0";

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
  SUMMONERICON: "Summoner Icons",
  CHEST: "Chests",
  "": "Other",
};

const ORDER = ["MATERIAL", "CHAMPION", "SKIN", "ETERNAL", "EMOTE", "WARDSKIN", "SUMMONERICON", "CHEST", ""];
const RARITY_ICONS = new Set(["LEGENDARY", "EPIC", "RARE"]);
const CURRENCIES = ["CURRENCY_cosmetic", "MATERIAL_key", "CURRENCY_mythic"];
const ACTION_LABELS = { REROLL: "Reroll", DISENCHANT: "Disenchant", UPGRADE: "Upgrade", OPEN: "Open", CRAFT: "Craft", redeem: "Redeem" };

const CSS = `
#${ROOT_ID} { position: absolute; left: 0; right: 0; top: 0; bottom: 0; z-index: 1; overflow: hidden; background: #010a13;
  color: #f0e6d2; font-family: "LoL Body", Arial, "Helvetica Neue", Helvetica, sans-serif; }
#${ROOT_ID} .pl-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #010a13; }
#${ROOT_ID} .pl-veil { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(1, 10, 19, 0.9) 0%, rgba(1, 10, 19, 0.55) 40%, rgba(1, 10, 19, 0.3) 100%); }
#${ROOT_ID} .pl-subnav { position: absolute; left: 17px; top: 92px; height: 20px; display: flex; align-items: center; gap: 21px; }
#${ROOT_ID} .pl-subnav-item { font-family: "LoL Display", "Times New Roman", Times, serif; font-size: 12px; font-weight: 700;
  letter-spacing: 0.9px; text-transform: uppercase; color: #a09b8c; cursor: pointer; padding-bottom: 3px; border-bottom: 2px solid transparent; }
#${ROOT_ID} .pl-subnav-item:hover { color: #f0e6d2; }
#${ROOT_ID} .pl-subnav-item--on { color: #f0e6d2; border-bottom-color: #c89b3c; }
#${ROOT_ID} .pl-tabs { position: absolute; left: 1px; top: 125px; width: 60px; display: flex; flex-direction: column; gap: 6px; }
#${ROOT_ID} .pl-tab { width: 32px; height: 36px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0.5; border: 1px solid transparent; box-sizing: border-box; }
#${ROOT_ID} .pl-tab img { width: 22px; height: 22px; }
#${ROOT_ID} .pl-tab:hover { opacity: 0.85; }
#${ROOT_ID} .pl-tab--on { opacity: 1; border-color: #c89b3c; background: rgba(200, 155, 60, 0.12); }
#${ROOT_ID} .pl-tools { position: absolute; left: 61px; top: 125px; display: flex; gap: 10px; align-items: center; }
#${ROOT_ID} .pl-search { width: 194px; height: 32px; box-sizing: border-box; padding: 0 10px 0 30px;
  font-family: "LoL Body", Arial, sans-serif; font-size: 12px; color: #f0e6d2; background: rgba(1, 10, 19, 0.9) url("/fe/lol-static-assets/images/uikit/magnifying-glass-icon.png") 9px center / 14px no-repeat;
  border: 1px solid #785a28; outline: none; }
#${ROOT_ID} .pl-search:focus { border-color: #c89b3c; }
#${ROOT_ID} .pl-search::placeholder { color: #a09b8c; }
#${ROOT_ID} .pl-sort { width: 118px; height: 32px; box-sizing: border-box; padding: 0 8px; font-family: "LoL Body", Arial, sans-serif;
  font-size: 12px; color: #cdbe91; background: #010a13; border: 1px solid #785a28; outline: none; }
#${ROOT_ID} .pl-sort:focus { border-color: #c89b3c; }
#${ROOT_ID} .pl-panel { position: absolute; left: 61px; top: 177px; width: 342px; height: 445px;
  overflow-y: auto; overflow-x: hidden; }
#${ROOT_ID} .pl-panel::-webkit-scrollbar { width: 8px; }
#${ROOT_ID} .pl-panel::-webkit-scrollbar-track { background: rgba(1, 10, 19, 0.6); }
#${ROOT_ID} .pl-panel::-webkit-scrollbar-thumb { background: #785a28; }
#${ROOT_ID} .pl-grid { padding: 0 0 20px; }
#${ROOT_ID} .pl-section-title { display: flex; align-items: center; gap: 8px; padding: 5px 0 2px;
  font-family: "LoL Display", "Times New Roman", Times, serif; font-size: 12px; letter-spacing: 0.6px;
  text-transform: uppercase; color: #a09b8c; }
#${ROOT_ID} .pl-section-title hr { flex: 1 1 auto; height: 0; margin: 0; border: 0; border-top: 1px solid rgba(120, 90, 40, 0.55); }
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
#${ROOT_ID} .pl-detail { position: absolute; left: 430px; top: 177px; width: 420px; }
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
#${ROOT_ID} .pl-footer { position: absolute; left: 149px; top: 655px; height: 60px; display: flex; align-items: center; gap: 30px; }
#${ROOT_ID} .pl-currency { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 40px; }
#${ROOT_ID} .pl-currency-icon { width: 26px; height: 26px; background-size: contain; background-repeat: no-repeat; background-position: center; }
#${ROOT_ID} .pl-currency-text { font-size: 12px; letter-spacing: 0.3px; color: #cdbe91; }
#${ROOT_ID} .pl-empty { padding: 18px 2px; font-size: 12px; color: #a09b8c; }
#${ROOT_ID} .pl-tip { position: fixed; z-index: 5; max-width: 260px; padding: 8px 10px; display: none;
  background: rgba(1, 10, 19, 0.97); border: 1px solid #785a28; pointer-events: none;
  font-size: 12px; line-height: 1.5; color: #a09b8c; }
#${ROOT_ID} .pl-tip b { display: block; color: #f0e6d2; font-family: "LoL Display", "Times New Roman", Times, serif;
  font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; }
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
let refreshTimer = null;
let searchTimer = null;
let selectedId = null;
let filter = null;
let sortMode = "alphabetical";
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

function groupItems(list) {
  const groups = new Map();
  for (const item of list) {
    const category = categoryOf(item);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  for (const [category, group] of groups) {
    group.sort((a, b) => (sortMode === "value" ? (b.value ?? 0) - (a.value ?? 0) : nameOf(a).localeCompare(nameOf(b))));
  }
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
  const host = root?.querySelector(".pl-subnav");
  if (!host) return;
  host.textContent = "";
  for (const [label, target] of SUB_TABS) {
    const tab = document.createElement("div");
    tab.className = target ? "pl-subnav-item" : "pl-subnav-item pl-subnav-item--on";
    tab.dataset.subtab = label;
    tab.textContent = label;
    host.append(tab);
  }
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
  const host = root?.querySelector(".pl-footer");
  if (!host) return;
  host.textContent = "";
  for (const currency of currencies) {
    const cell = document.createElement("div");
    cell.className = "pl-currency";
    cell.innerHTML = `<div class="pl-currency-icon" style="background-image:url('${ASSETS.currency(currency.icon)}')"></div><div class="pl-currency-text">${esc(currency.count)}</div>`;
    host.append(cell);
  }
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
  const item = items.find((entry) => entry.lootId === selectedId) ?? items[0];
  if (!item) {
    box.innerHTML = "";
    return;
  }
  selectedId = item.lootId;
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
    title.innerHTML = `${esc(TITLES[category] ?? category)}<hr>`;
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
  const out = [];
  for (const id of CURRENCIES) {
    const entry = loot.find((item) => item.lootId === id);
    if (!entry) continue;
    out.push({ icon: id === "MATERIAL_key" ? "MATERIAL_key" : id, count: entry.count ?? 0 });
  }
  return out;
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

async function refresh() {
  if (!root || !api) return;
  const loot = await api.lcu.get(LOOT_URI, { ttl: 2000 });
  if (!Array.isArray(loot)) throw new Error("unexpected loot payload");
  items = loot.filter((item) => item.type !== "CURRENCY" && item.type !== "MATERIAL");
  currencies = deriveCurrencies(loot);
  if (!items.some((item) => item.lootId === selectedId)) selectedId = items[0]?.lootId ?? null;
  await loadActions(selectedId);
  renderSubNav();
  renderTabs();
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
      <video class="pl-backdrop" src="/fe/lol-loot/assets/videos/background_ambient.webm" autoplay muted loop playsinline></video>
      <div class="pl-veil"></div>
      <div class="pl-subnav"></div>
      <div class="pl-tabs"></div>
      <div class="pl-tools">
        <input class="pl-search" type="search" placeholder="Search" aria-label="Search loot">
        <select class="pl-sort" aria-label="Sort loot">
          <option value="alphabetical">Alphabetical</option>
          <option value="value">Value</option>
        </select>
      </div>
      <div class="pl-panel"><div class="pl-grid"></div></div>
      <div class="pl-detail"></div>
      <div class="pl-footer"></div>
      <div class="pl-tip"></div>`;
    const navBottom = Math.max(0, ...[...document.querySelectorAll('[class*="lol-navigation"]')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => Math.round(el.getBoundingClientRect().bottom)));
    if (navBottom > 0 && navBottom < screenRoot.clientHeight) root.style.top = `${navBottom}px`;
    screenRoot.append(root);
    const video = root.querySelector("video");
    if (video) {
      video.muted = true;
      video.play?.().catch(() => {});
    }
    markActive();
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
      <div class="pl-modal-body">${esc(metaOf(item))}.${esc(cost)}</div>
      <div class="pl-modal-buttons">
        <button type="button" class="pl-action" data-modal="cancel">Cancel</button>
        <button type="button" class="pl-action" data-modal="confirm">${esc(actionLabel(action))}</button>
      </div>
    </div>`;
  root.append(modal);
}

async function runAction() {
  const action = pendingAction;
  const modal = root?.querySelector(".pl-modal");
  modal?.remove();
  pendingAction = null;
  if (!action || !selectedId) return;
  try {
    await api.lcu.send("POST", `/lol-loot/v1/recipes/${encodeURIComponent(action.name)}/craft`, [selectedId]);
    await refresh();
  } catch (error) {
    console.warn("[Loot Remake] action failed.", error);
  }
}

function onInput(event) {
  const target = event.target;
  if (!(target instanceof Element) || !root?.contains(target)) return;
  if (target.classList.contains("pl-search")) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGrid, 120);
  } else if (target.classList.contains("pl-sort")) {
    sortMode = target.value === "value" ? "value" : "alphabetical";
    renderGrid();
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

  const modalButton = target.closest("[data-modal]");
  if (modalButton) {
    if (modalButton.dataset.modal === "confirm") runAction();
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
  tip.innerHTML = `<b>${esc(nameOf(item))}</b>${esc(metaOf(item))}`;
  tip.style.display = "block";
  const width = tip.offsetWidth || 220;
  const height = tip.offsetHeight || 60;
  tip.style.left = `${Math.min(rect.right + 8, innerWidth - width - 8)}px`;
  tip.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - height - 8))}px`;
}

function onKey(event) {
  if (event.key !== "Escape" || !root) return;
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

function enable() {
  failed = false;
  passthrough = false;
  api = window.PerfectionistUtils ?? null;
  if (!api?.lcu || !isValidNav()) {
    failed = true;
    return;
  }
  active = true;
  styleRemover = api.addStyle(STYLE_ID, CSS);
  attachListeners();
  if (document.querySelector(".loot-application-container")) open();
}

function disable() {
  active = false;
  detachListeners();
  close();
  styleRemover?.();
  styleRemover = null;
}

export function init() {
  const utils = window.PerfectionistUtils;
  if (!utils) return;
  utils.registerPlugin({
    id: ID,
    name: "Loot Remake",
    description: "Replaces the Loot screen with a plain-DOM view of the same inventory, including craft, disenchant, reroll and upgrade with the same confirmations as the original.",
    version,
    defaultEnabled: false,
    onEnable: enable,
    onDisable: disable,
  });
}
