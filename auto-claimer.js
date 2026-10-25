const PLUGIN_ID = "auto-claimer";
const version = "1.0.0";

const SWEEP_DEBOUNCE_MS = 400;
const CLAIM_COOLDOWN_MS = 5 * 60 * 1000;
const BUY_COOLDOWN_MS = 30 * 60 * 1000;
const SHOP_THROTTLE_MS = 60 * 1000;
const BUY_FALLBACK_MS = 15 * 60 * 1000;
const MAX_ACTIONS_PER_SWEEP = 25;

const EVENTS_URI = "/lol-event-hub/v1/events";
const MISSIONS_URI = "/lol-missions/v1/missions";
const TFT_PASS_URI = "/lol-tft-pass/v1/battle-pass";
const TFT_PASSES_URI = "/lol-tft-pass/v1/active-passes";
const LOOT_URI = "/lol-loot/v1/player-loot";
const STORE_READY_URI = "/lol-store/v1/store-ready";
const CATALOG_URI = "/lol-store/v1/catalog";
const BUY_URI = "/lol-purchase-widget/v2/purchaseItems";

let api = null;
let active = false;
let claimTimer = null;
let claimRunning = false;
let claimQueued = false;
let shopDebounce = null;
let shopInterval = null;
let shopRunning = false;
let shopQueued = false;
let unsubscribes = [];
let sourceInstalled = false;
const cooldowns = new Map();
const menus = new Map();

function on(key) {
  try {
    return api?.getOption?.(PLUGIN_ID, key) === true;
  } catch {
    return false;
  }
}

function ready(key, wait) {
  return (cooldowns.get(key) ?? 0) + wait <= Date.now();
}

function stamp(key) {
  cooldowns.set(key, Date.now());
}

function getJson(path) {
  return fetch(path, { headers: { Accept: "application/json" } }).then((response) => {
    if (!response.ok) throw new Error(`${path} responded ${response.status}`);
    return response.json();
  });
}

function sendJson(method, path, body) {
  return fetch(path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((response) => {
    if (!response.ok) throw new Error(`${method} ${path} responded ${response.status}`);
    return response.status === 204 ? null : response.json().catch(() => null);
  });
}

async function sweepEvents() {
  const events = await getJson(EVENTS_URI);
  if (!Array.isArray(events)) return;
  for (const entry of events) {
    const id = entry?.eventId;
    const unclaimed = entry?.eventInfo?.unclaimedRewardCount ?? 0;
    if (!id || unclaimed <= 0 || !ready(`event:${id}`, CLAIM_COOLDOWN_MS)) continue;
    stamp(`event:${id}`);
    await sendJson("POST", `${EVENTS_URI}/${id}/reward-track/claim-all`).catch(() => {});
  }
}

async function sweepMissions() {
  const missions = await getJson(MISSIONS_URI);
  if (!Array.isArray(missions)) return;
  for (const mission of missions) {
    if (mission?.status !== "SELECT_REWARDS") continue;
    const id = mission.id;
    if (!id || !ready(`mission:${id}`, CLAIM_COOLDOWN_MS)) continue;
    const rewards = Array.isArray(mission.rewards) ? mission.rewards : [];
    const groups = [...new Set(rewards.map((reward) => reward?.rewardGroup).filter((group) => group != null && group !== ""))];
    if (groups.length === 0) continue;
    if (groups.length > 1 && (mission.rewardStrategy?.selectMaxGroupCount ?? 0) > 0) continue;
    stamp(`mission:${id}`);
    await sendJson("PUT", `/lol-missions/v1/player/${id}`, { rewardGroups: [groups[0]] }).catch(() => {});
  }
}

async function sweepTftPasses() {
  const seen = new Set();
  for (const uri of [TFT_PASS_URI, TFT_PASSES_URI]) {
    const data = await getJson(uri).catch(() => null);
    const passes = Array.isArray(data) ? data : data ? [data] : [];
    for (const pass of passes) {
      const passId = pass?.info?.passId;
      if (!passId || seen.has(passId)) continue;
      seen.add(passId);
      const milestones = [...(Array.isArray(pass.milestones) ? pass.milestones : []), ...(Array.isArray(pass.bonuses) ? pass.bonuses : [])];
      const claimable = milestones.some(
        (m) => m && !m.isLocked && !m.isClaimRequestPending && (m.status === "REWARDABLE" || m.status === "CLAIMABLE"),
      );
      if (!claimable || !ready(`tftpass:${passId}`, CLAIM_COOLDOWN_MS)) continue;
      stamp(`tftpass:${passId}`);
      await sendJson("PUT", `/lol-tft-pass/v1/pass/${passId}/milestone/claimAllRewards`).catch(() => {});
    }
  }
}

function menuFor(lootId) {
  if (!menus.has(lootId)) {
    const promise = getJson(`/lol-loot/v1/player-loot/${encodeURIComponent(lootId)}/context-menu`).catch(() => {
      menus.delete(lootId);
      return null;
    });
    menus.set(lootId, promise);
  }
  return menus.get(lootId);
}

async function sweepLoot() {
  const loot = await getJson(LOOT_URI);
  if (!Array.isArray(loot)) return;
  let actions = 0;
  for (const item of loot) {
    if (actions >= MAX_ACTIONS_PER_SWEEP) break;
    const lootId = item?.lootId;
    const count = item?.count ?? 0;
    if (!lootId || count <= 0 || /^(CURRENCY|MATERIAL)_/.test(lootId)) continue;
    if (!ready(`loot:${lootId}`, CLAIM_COOLDOWN_MS)) continue;
    const menu = await menuFor(lootId);
    const open = (Array.isArray(menu) ? menu : []).find((action) => action?.actionType === "OPEN" && action.name && action.enabled !== false);
    if (!open) continue;
    const needsKey = (open.requiredOthersCount ?? 0) > 0;
    if (needsKey ? !on("openChests") : !on("openLoot")) continue;
    stamp(`loot:${lootId}`);
    actions++;
    const repeat = Math.min(count, 25);
    await sendJson("POST", `/lol-loot/v1/recipes/${encodeURIComponent(open.name)}/craft?repeat=${repeat}`, [lootId]).catch(() => {});
  }
}

async function isOwned(inventoryType, itemId) {
  if (!inventoryType || itemId == null) return null;
  const list = await getJson(`/lol-inventory/v2/inventory/${encodeURIComponent(inventoryType)}`).catch(() => null);
  if (!Array.isArray(list)) return null;
  return list.some((entry) => entry?.itemId === itemId);
}

async function runShop() {
  if (!active || shopRunning) {
    if (shopRunning) shopQueued = true;
    return;
  }
  if (!on("buy1Be") || !ready("shop-catalog", SHOP_THROTTLE_MS)) return;
  shopRunning = true;
  stamp("shop-catalog");
  try {
    const catalog = await getJson(CATALOG_URI);
    if (!Array.isArray(catalog)) return;
    const cheap = catalog.filter(
      (item) =>
        item?.active === true &&
        Array.isArray(item.prices) &&
        item.prices.some((price) => price?.cost === 1 && price?.currency === "IP"),
    );
    for (const item of cheap) {
      const key = `buy:${item.inventoryType}:${item.itemId}`;
      if (!ready(key, BUY_COOLDOWN_MS)) continue;
      const owned = await isOwned(item.inventoryType, item.itemId);
      if (owned === null) continue;
      stamp(key);
      if (owned) continue;
      await sendJson("POST", BUY_URI, {
        items: [
          {
            itemKey: { itemId: item.itemId, inventoryType: item.inventoryType },
            purchaseCurrencyInfo: { currencyType: "IP", price: 1, purchasable: true },
            source: "store",
            featuredSection: "",
            quantity: 1,
          },
        ],
      }).catch(() => {});
    }
  } finally {
    shopRunning = false;
    if (shopQueued) {
      shopQueued = false;
      scheduleShop();
    }
  }
}

function scheduleClaims() {
  if (!active) return;
  clearTimeout(claimTimer);
  claimTimer = setTimeout(runClaims, SWEEP_DEBOUNCE_MS);
}

function scheduleShop() {
  if (!active || !on("buy1Be")) return;
  clearTimeout(shopDebounce);
  shopDebounce = setTimeout(runShop, SWEEP_DEBOUNCE_MS);
}

async function runClaims() {
  if (!active) return;
  if (claimRunning) {
    claimQueued = true;
    return;
  }
  claimRunning = true;
  try {
    await sweepEvents().catch(() => {});
    await sweepMissions().catch(() => {});
    await sweepTftPasses().catch(() => {});
    if (on("openLoot") || on("openChests")) await sweepLoot().catch(() => {});
  } finally {
    claimRunning = false;
    if (claimQueued) {
      claimQueued = false;
      scheduleClaims();
    }
  }
}

function syncShopTimer() {
  if (active && on("buy1Be")) {
    if (!shopInterval) shopInterval = setInterval(scheduleShop, BUY_FALLBACK_MS);
    scheduleShop();
    return;
  }
  clearInterval(shopInterval);
  clearTimeout(shopDebounce);
  shopInterval = null;
}

function noteTraffic(url) {
  if (!active || typeof url !== "string") return;
  if (url.includes("/lol-store/v1/catalog")) scheduleShop();
}

function installSourceWatch() {
  if (sourceInstalled) return;
  sourceInstalled = true;
  const original = window.fetch;
  if (typeof original === "function" && !original.__perfClaimWatch) {
    const wrapped = function (input, init) {
      noteTraffic(typeof input === "string" ? input : (input && input.url) || "");
      return original.call(this, input, init);
    };
    wrapped.__perfClaimWatch = true;
    window.fetch = wrapped;
  }
  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (proto && !proto.open.__perfClaimWatch) {
    const origOpen = proto.open;
    const origSend = proto.send;
    proto.open = function (method, url, ...rest) {
      this.__perfClaimUrl = typeof url === "string" ? url : "";
      return origOpen.call(this, method, url, ...rest);
    };
    proto.open.__perfClaimWatch = true;
    proto.send = function (...args) {
      noteTraffic(this.__perfClaimUrl || "");
      return origSend.apply(this, args);
    };
  }
}

function onEnable(utils) {
  api = utils;
  active = true;
  cooldowns.clear();
  menus.clear();
  const claimPush = () => scheduleClaims();
  const shopPush = () => {
    if (on("buy1Be")) scheduleShop();
  };
  for (const uri of [EVENTS_URI, MISSIONS_URI, TFT_PASS_URI, TFT_PASSES_URI, LOOT_URI]) {
    try {
      const off = api.subscribe(uri, claimPush);
      if (off) unsubscribes.push(off);
    } catch {}
  }
  try {
    const off = api.subscribe(STORE_READY_URI, shopPush);
    if (off) unsubscribes.push(off);
  } catch {}
  scheduleClaims();
  syncShopTimer();
}

function onDisable() {
  active = false;
  clearTimeout(claimTimer);
  clearTimeout(shopDebounce);
  clearInterval(shopInterval);
  claimTimer = null;
  shopDebounce = null;
  shopInterval = null;
  claimRunning = false;
  claimQueued = false;
  shopRunning = false;
  shopQueued = false;
  for (const off of unsubscribes) {
    try {
      off();
    } catch {}
  }
  unsubscribes = [];
  cooldowns.clear();
  menus.clear();
  api = null;
}

function onOptionChange(key) {
  if (!active) return;
  if (key === "buy1Be") {
    syncShopTimer();
    return;
  }
  scheduleClaims();
}

export function init() {
  installSourceWatch();

  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Auto Claimer",
      description: "Automatically claims battle pass, event and mission rewards the moment they become claimable.",
      version,
      defaultEnabled: true,
      options: [
        {
          key: "buy1Be",
          label: "Auto-buy 1 BE shop items",
          description: "Instantly buys items Riot lists in the shop for 1 BE (wards, icons, emotes, bundles).",
          default: false,
        },
        {
          key: "openLoot",
          label: "Auto-open loot (mystery icons, ward skins, ...)",
          description: "Opens free mystery loot the moment you get it. Never touches items that need a key.",
          default: false,
        },
        {
          key: "openChests",
          label: "Auto-open chests with keys",
          description: "Opens chest + key loot automatically while you have keys.",
          default: false,
        },
      ],
      onEnable,
      onDisable,
      onOptionChange,
    });
  };

  if (window.PerfectionistUtils) {
    registerWith(window.PerfectionistUtils);
    return;
  }
  addEventListener("perfectionist:utils-ready", (e) => registerWith(e.detail ?? window.PerfectionistUtils), { once: true });
}
