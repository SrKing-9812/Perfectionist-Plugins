const PLUGIN_ID = "auto-read";
const version = "1.2.0";

const SWEEP_DEBOUNCE_MS = 500;
const ITEM_COOLDOWN_MS = 10 * 60 * 1000;
const BULK_COOLDOWN_MS = 60 * 1000;

const MISSIONS_URI = "/lol-missions/v1/missions";
const MISSIONS_PLAYER_URI = "/lol-missions/v1/player";
const LOOT_URI = "/lol-loot/v1/player-loot";
const CLASH_FLAGS_URI = "/lol-clash/v1/simple-state-flags";
const REWARDS_GRANTS_URI = "/lol-rewards/v1/grants";
const REWARDS_VIEW_URI = "/lol-rewards/v1/grants/view";
const LOOT_NOTIF_URI = "/lol-loot/v1/player-loot-notifications";
const MASTERY_NOTIF_URI = "/lol-champion-mastery/v1/notifications";
const MASTERY_ACK_URI = "/lol-champion-mastery/v1/notifications/ack";
const HONOR_NOTICES = [
  { uri: "/lol-honor-v2/v1/reward-granted", ack: "/lol-honor-v2/v1/reward-granted/ack", present: (d) => Number(d?.quantity ?? -1) >= 0 || Boolean(d?.rewardType) },
  { uri: "/lol-honor-v2/v1/mutual-honor", ack: "/lol-honor-v2/v1/mutual-honor/ack", present: (d) => (d?.summoners?.length ?? 0) > 0 },
  { uri: "/lol-honor-v2/v1/level-change", ack: "/lol-honor-v2/v1/level-change/ack", present: (d) => Number(d?.currentState?.level ?? -1) >= 0 },
];
const RANKED_NOTIF_URI = "/lol-ranked/v1/notifications";
const EOS_NOTIF_URI = "/lol-ranked/v1/eos-notifications";
const NOTICE_LIST_URIS = [
  "/player-notifications/v1/notifications",
  "/lol-patch/v1/notifications",
  "/patcher/v1/notifications",
  "/lol-leaver-buster/v1/notifications",
  "/lol-lobby/v2/notifications",
];
const NOTICE_BULK_DELETES = [
  "/lol-gameflow/v1/early-exit-notifications/eog",
  "/lol-gameflow/v1/early-exit-notifications/missions",
  "/lol-statstones/v1/vignette-notifications",
  "/lol-player-behavior/v1/code-of-conduct-notification",
];
const CLASH_BULK_ACKS = [
  "/lol-clash/v1/notifications/acknowledge",
  "/lol-clash/v1/eog-player-update/acknowledge",
  "/lol-clash/v1/game-end/acknowledge",
];
const IDENTITY_NOTICE_TYPES = ["ACHIEVEMENT_TITLE", "SUMMONER_ICON", "REGALIA_BANNER"];
const IDENTITY_ACK_URI = "/lol-inventory/v1/notification/acknowledge";
const TOKENS_PREFS_URI = "/lol-settings/v2/account/LCUPreferences/lol-customizer-tokens";
const LEVELUP_PREFS_URI = "/lol-settings/v2/account/LCUPreferences/lol-challenges-latest-level-up";
const TFT_BATTLE_PASS_URI = "/lol-tft-pass/v1/battle-pass";
const TFT_HOME_HUB_URI = "/lol-tft/v1/tft/homeHub";
const TFT_PREFS_URI = "/lol-settings/v2/account/LCUPreferences/lol-tft";
const PIP_STYLE_ID = "auto-read-pips-style";
const PIP_CSS = ".activity-center__tab_label_notification { display: none !important; }";

let api = null;
let active = false;
let sweepTimer = null;
let sweepRunning = false;
let sweepQueued = false;
let unsubscribes = [];
const cooldowns = new Map();
const markedGrants = new Set();

function on(key) {
  try {
    return api?.getOption?.(PLUGIN_ID, `read.${key}`) === true;
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

async function sweepQuests() {
  const missions = await getJson(MISSIONS_URI);
  if (!Array.isArray(missions)) return;
  const ids = [];
  for (const mission of missions) {
    if (!mission?.id || mission.viewed !== false) continue;
    if (!ready(`mission:${mission.id}`, ITEM_COOLDOWN_MS)) continue;
    stamp(`mission:${mission.id}`);
    ids.push(mission.id);
  }
  for (let i = 0; i < ids.length; i += 100) {
    await sendJson("PUT", MISSIONS_PLAYER_URI, { missionIds: ids.slice(i, i + 100) }).catch(() => {});
  }
}

async function sweepLootMarks() {
  const loot = await getJson(LOOT_URI);
  if (!Array.isArray(loot)) return;
  for (const item of loot) {
    const id = item?.lootId;
    if (!id || item.isNew !== true || !ready(`lootmark:${id}`, ITEM_COOLDOWN_MS)) continue;
    stamp(`lootmark:${id}`);
    await sendJson("DELETE", `${LOOT_URI}/${encodeURIComponent(id)}/new-notification`).catch(() => {});
  }
}

async function sweepClash() {
  const flags = await getJson(CLASH_FLAGS_URI).catch(() => null);
  if (Array.isArray(flags)) {
    for (const flag of flags) {
      if (!flag?.id || flag.status === "ACKNOWLEDGED" || !ready(`clashflag:${flag.id}`, ITEM_COOLDOWN_MS)) continue;
      stamp(`clashflag:${flag.id}`);
      await sendJson("POST", `${CLASH_FLAGS_URI}/${encodeURIComponent(flag.id)}/acknowledge`).catch(() => {});
    }
  }
  if (!ready("clash-bulk", BULK_COOLDOWN_MS)) return;
  stamp("clash-bulk");
  for (const path of CLASH_BULK_ACKS) {
    await sendJson("POST", path).catch(() => {});
  }
}

async function sweepRewards() {
  const grants = await getJson(REWARDS_GRANTS_URI).catch(() => null);
  if (Array.isArray(grants) && grants.length && ready("rewards-grants", BULK_COOLDOWN_MS)) {
    const ids = [];
    for (const grant of grants) {
      const id = grant?.grantId ?? grant?.id;
      if (typeof id !== "string" || !id || markedGrants.has(id)) continue;
      ids.push(id);
    }
    if (ids.length) {
      stamp("rewards-grants");
      for (const id of ids) markedGrants.add(id);
      await sendJson("PATCH", REWARDS_VIEW_URI, ids).catch(() => {
        for (const id of ids) markedGrants.delete(id);
      });
    }
  }

  const notes = await getJson(LOOT_NOTIF_URI).catch(() => null);
  if (Array.isArray(notes)) {
    for (const note of notes) {
      const id = note?.id ?? note?.lootId;
      if (!id || !ready(`lootnote:${id}`, ITEM_COOLDOWN_MS)) continue;
      stamp(`lootnote:${id}`);
      await sendJson("POST", `${LOOT_NOTIF_URI}/${encodeURIComponent(id)}/acknowledge`).catch(() => {});
    }
  }

  const mastery = await getJson(MASTERY_NOTIF_URI).catch(() => null);
  if (Number(mastery?.championId ?? 0) > 0 && ready("mastery", ITEM_COOLDOWN_MS)) {
    stamp("mastery");
    await sendJson("POST", MASTERY_ACK_URI).catch(() => {});
  }

  for (const notice of HONOR_NOTICES) {
    const data = await getJson(notice.uri).catch(() => null);
    const key = `honor:${notice.uri}`;
    if (!data || !notice.present(data) || !ready(key, ITEM_COOLDOWN_MS)) continue;
    stamp(key);
    await sendJson("POST", notice.ack).catch(() => {});
  }
}

async function sweepRanked() {
  for (const uri of [RANKED_NOTIF_URI, EOS_NOTIF_URI]) {
    const list = await getJson(uri).catch(() => null);
    if (!Array.isArray(list)) continue;
    for (const note of list) {
      const id = note?.id ?? note?.notificationId;
      if (id == null || !ready(`ranked:${id}`, ITEM_COOLDOWN_MS)) continue;
      stamp(`ranked:${id}`);
      await sendJson("POST", `${uri}/${encodeURIComponent(id)}/acknowledge`).catch(() => {});
    }
  }
}

async function sweepNotices() {
  for (const uri of NOTICE_LIST_URIS) {
    const list = await getJson(uri).catch(() => null);
    if (!Array.isArray(list)) continue;
    for (const note of list) {
      const id = note?.id ?? note?.notificationId;
      if (id == null || !ready(`notice:${id}`, ITEM_COOLDOWN_MS)) continue;
      stamp(`notice:${id}`);
      await sendJson("DELETE", `${uri}/${encodeURIComponent(id)}`).catch(() => {});
    }
  }
  if (!ready("notice-bulk", BULK_COOLDOWN_MS)) return;
  stamp("notice-bulk");
  for (const path of NOTICE_BULK_DELETES) {
    await sendJson("DELETE", path).catch(() => {});
  }
}

async function sweepIdentity() {
  for (const type of IDENTITY_NOTICE_TYPES) {
    const list = await getJson(`/lol-inventory/v1/notifications/${type}`).catch(() => null);
    if (!Array.isArray(list)) continue;
    for (const note of list) {
      const id = note?.id;
      if (id == null || note.acknowledged === true) continue;
      if (!ready(`invnote:${id}`, ITEM_COOLDOWN_MS)) continue;
      stamp(`invnote:${id}`);
      await sendJson("POST", IDENTITY_ACK_URI, { id }).catch(() => {});
    }
  }
  if (!ready("tokens-visit", BULK_COOLDOWN_MS)) return;
  const [tokens, levelUp] = await Promise.all([
    getJson(TOKENS_PREFS_URI).catch(() => null),
    getJson(LEVELUP_PREFS_URI).catch(() => null),
  ]);
  const lastVisit = Number(tokens?.data?.lastVisitTime ?? 0);
  const lastLevelUp = Number(levelUp?.data?.lastLevelUpTime ?? 0);
  if (!lastVisit || !(lastLevelUp > lastVisit)) return;
  stamp("tokens-visit");
  await sendJson("PUT", TOKENS_PREFS_URI, { schemaVersion: 1, data: { lastVisitTime: Date.now() } }).catch(() => {});
}

async function sweepTft() {
  const bp = await getJson(TFT_BATTLE_PASS_URI).catch(() => null);
  if (bp && Array.isArray(bp.milestones) && Array.isArray(bp.bonuses)) {
    const list = [...bp.milestones, ...bp.bonuses];
    const claimable = list.some((m) => m && m.status === "CLAIMABLE" && !m.isLocked);
    const pending = list.some((m) => m && m.isClaimRequestPending);
    const passId = bp?.info?.passId;
    if (claimable && !pending && passId && ready("tft-claim", BULK_COOLDOWN_MS)) {
      stamp("tft-claim");
      await sendJson("PUT", `/lol-tft-pass/v1/pass/${encodeURIComponent(passId)}/milestone/claimAllRewards`).catch(() => {});
    }
  }
  if (!ready("tft-promos", BULK_COOLDOWN_MS)) return;
  const [hub, prefs] = await Promise.all([
    getJson(TFT_HOME_HUB_URI).catch(() => null),
    getJson(TFT_PREFS_URI).catch(() => null),
  ]);
  const store = hub?.storePromoOfferIds;
  const battle = hub?.battlePassOfferIds;
  const tact = hub?.tacticianPromoOfferIds;
  if (!hub?.enabled || !Array.isArray(store) || !Array.isArray(battle) || !Array.isArray(tact)) return;
  const target = { storeOfferIds: [battle[0], store[0]], tacticianOfferIds: tact };
  const seen = prefs?.data?.seenOfferIds;
  const same =
    Array.isArray(seen?.storeOfferIds) &&
    seen.storeOfferIds.length === target.storeOfferIds.length &&
    seen.storeOfferIds.every((value, index) => value === target.storeOfferIds[index]) &&
    Array.isArray(seen?.tacticianOfferIds) &&
    seen.tacticianOfferIds.length === target.tacticianOfferIds.length &&
    seen.tacticianOfferIds.every((value, index) => value === target.tacticianOfferIds[index]);
  if (same) return;
  stamp("tft-promos");
  await sendJson("PATCH", TFT_PREFS_URI, { data: { seenOfferIds: target }, schemaVersion: 1 }).catch(() => {});
}

function syncPips() {
  const wanted = active && on("pips");
  let style = document.getElementById(PIP_STYLE_ID);
  if (wanted && !style) {
    style = document.createElement("style");
    style.id = PIP_STYLE_ID;
    style.textContent = PIP_CSS;
    document.head.appendChild(style);
  } else if (!wanted && style) {
    style.remove();
  }
}

function scheduleSweep() {
  if (!active) return;
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(runSweep, SWEEP_DEBOUNCE_MS);
}

async function runSweep() {
  if (!active) return;
  if (sweepRunning) {
    sweepQueued = true;
    return;
  }
  sweepRunning = true;
  try {
    if (on("quests")) await sweepQuests().catch(() => {});
    if (on("loot")) await sweepLootMarks().catch(() => {});
    if (on("rewards")) {
      await sweepRewards().catch(() => {});
      await sweepIdentity().catch(() => {});
    }
    if (on("tft")) await sweepTft().catch(() => {});
    if (on("clash")) await sweepClash().catch(() => {});
    if (on("ranked")) await sweepRanked().catch(() => {});
    if (on("notices")) await sweepNotices().catch(() => {});
  } finally {
    sweepRunning = false;
    if (sweepQueued) {
      sweepQueued = false;
      scheduleSweep();
    }
  }
}

function onEnable(utils) {
  api = utils;
  active = true;
  cooldowns.clear();
  for (const uri of [MISSIONS_URI, LOOT_URI, CLASH_FLAGS_URI, REWARDS_GRANTS_URI, LOOT_NOTIF_URI, MASTERY_NOTIF_URI, ...HONOR_NOTICES.map((n) => n.uri), RANKED_NOTIF_URI, EOS_NOTIF_URI, ...NOTICE_LIST_URIS, ...IDENTITY_NOTICE_TYPES.map((type) => `/lol-inventory/v1/notifications/${type}`), TOKENS_PREFS_URI, LEVELUP_PREFS_URI, TFT_BATTLE_PASS_URI, TFT_HOME_HUB_URI, TFT_PREFS_URI]) {
    try {
      const off = api.subscribe(uri, scheduleSweep);
      if (off) unsubscribes.push(off);
    } catch {}
  }
  scheduleSweep();
  syncPips();
}

function onDisable() {
  active = false;
  clearTimeout(sweepTimer);
  sweepTimer = null;
  sweepRunning = false;
  sweepQueued = false;
  for (const off of unsubscribes) {
    try {
      off();
    } catch {}
  }
  unsubscribes = [];
  cooldowns.clear();
  markedGrants.clear();
  api = null;
  syncPips();
}

function onOptionChange() {
  if (!active) return;
  scheduleSweep();
  syncPips();
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Auto Read",
      description: "Automatically marks quests, loot, Clash, TFT and client notices as read so no badge or dot stays lit.",
      version,
      defaultEnabled: true,
      options: [
        {
          type: "chips",
          key: "read",
          label: "Mark as read",
          description: "Choose what gets marked as read automatically.",
          items: [
            { id: "quests", label: "Quests", description: "Quest and mission badges, including the mission button counter.", default: true },
            { id: "loot", label: "Loot marks", description: "The new mark on freshly earned loot.", default: true },
            { id: "rewards", label: "Rewards", description: "The dot on your avatar for new tokens, titles and banners, plus mastery, honor and loot notifications.", default: true },
            { id: "tft", label: "TFT tab", description: "Claims claimable TFT pass rewards and marks TFT promo offers as seen so the TFT tab dot stays off.", default: true },
            { id: "clash", label: "Clash", description: "Clash tab flags and Clash notifications.", default: true },
            { id: "ranked", label: "Ranked", description: "Ranked, end-of-season and champion mastery notices.", default: true },
            { id: "notices", label: "Notices", description: "Patch, patcher, leaver buster, lobby, behavior and gameflow notices.", default: true },
            { id: "pips", label: "Tab pips", description: "Hides the new pips on activity tabs.", default: true },
          ],
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
