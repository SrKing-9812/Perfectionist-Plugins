const PLUGIN_ID = "dodge-helper";
export const version = "2.0.0";

const PHASE_URI = "/lol-gameflow/v1/gameflow-phase";
const GAMEFLOW_URI = "/lol-gameflow/v1/session";
const CHAMP_SELECT_URI = "/lol-champ-select/v1/session";
const SEARCH_STATE_URI = "/lol-lobby/v2/lobby/matchmaking/search-state";
const SUMMONER_URI = "/lol-summoner/v1/current-summoner";
const RANKED_STATS_URI = "/lol-ranked/v1/current-ranked-stats";
// The same endpoint the client's own QUIT button uses. It leaves champ select on the server and moves the
// client back to the lobby properly.
const QUIT_URI = "/lol-lobby-team-builder/champ-select/v1/session/quit";
// Riot refuses that endpoint in ranked and in the last seconds before a game starts. Closing the client is then
// the only way out (it counts as a dodge), so it is offered as an explicitly labelled confirm step.
const CLOSE_CLIENT_URI = "/process-control/v1/process/quit";

const STORE_KEY = "perfectionist:dodge-helper:accounts:v2";
const LEGACY_STORE_KEY = "perfectionist:dodge-helper:accounts:v1";
const STYLE_ID = "perf-dodge-helper-style";
const ROOT_CLASS = "perf-dodge-quit";
const FOOTER_SELECTOR = ".bottom-right-buttons";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CONFIRM_MS = 3000;

// Riot's published queue dodge penalties (support article "Queue Dodging"). The tier goes up by one per
// dodge and drops by one for every 24 hours without a dodge. Dodges count across all queues.
const LOCKOUT_MINUTES = { 1: 6, 2: 30, 3: 720 };
const ARAM_LOCKOUT_MINUTES = { 1: 15, 2: 30, 3: 720 };
const RANKED_LP = { 1: 5, 2: 15, 3: 15 };
const APEX_FIRST_DODGE_LP = 20;
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

const CSS = `
.${ROOT_CLASS} { position: fixed; z-index: 100; height: 32px; box-sizing: border-box; }
.${ROOT_CLASS} lol-uikit-flat-button { display: block; width: 100%; height: 32px; }
.${ROOT_CLASS} .perf-dodge-cost {
  position: absolute; left: 50%; bottom: calc(100% + 5px); transform: translateX(-50%);
  white-space: nowrap; pointer-events: none; text-align: center;
  font-family: var(--font-body, "LoL Body", Arial, sans-serif); font-size: 10px; font-weight: 700;
  letter-spacing: 0.25px; line-height: 14px; color: #c89b3c; text-shadow: 0 1px 2px #000;
}
.${ROOT_CLASS}.perf-dodge-armed lol-uikit-flat-button { filter: hue-rotate(-28deg) saturate(1.6); }
`;

let api = null;
let active = false;
let unsubscribes = [];
let unwatchFooter = null;
let removeFrameHook = null;
let removeStyle = null;
let armedTimer = null;
let penaltyToken = 0;

const state = {
  phase: null,
  queue: null,
  showQuitButton: false,
  summoner: null,
  penalty: null,
  armed: false,
  busy: false,
  quitSent: false,
  closeOffered: false,
};

/* ---------------------------------------------------------------------------------------------
 * Dodge tier bookkeeping (per account, local).
 * ------------------------------------------------------------------------------------------- */

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {};
}

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

function accountKey() {
  return state.summoner?.puuid || (state.summoner?.summonerId ? `sid:${state.summoner.summonerId}` : null);
}

function storedRecord() {
  const key = accountKey();
  if (!key) return null;
  const record = readStore()[key];
  return record && typeof record.tier === "number" && typeof record.at === "number" ? record : null;
}

// Current tier after decay: one step down per full 24 hours since the last dodge.
function currentTier(now = Date.now()) {
  const record = storedRecord();
  if (!record) return 0;
  const drops = Math.floor(Math.max(0, now - record.at) / DAY_MS);
  return Math.max(0, Math.min(3, record.tier - drops));
}

function saveTier(tier, at) {
  const key = accountKey();
  if (!key) return;
  const store = readStore();
  const previous = store[key];
  // The same dodge can be observed several times (search state, gameflow); keep the first timestamp.
  if (previous && previous.tier === tier && Math.abs(previous.at - at) < 10 * 60 * 1000) return;
  store[key] = { tier: Math.max(1, Math.min(3, tier)), at };
  writeStore(store);
}

function recordOwnDodge() {
  saveTier(Math.min(3, currentTier() + 1), Date.now());
}

// The server tells us the lockout it applied. Its length identifies the tier exactly
// (6 or 15 minutes: tier 1, 30 minutes: tier 2, 12 hours: tier 3), which also corrects the count for
// dodges this plugin did not see (closing the client, a missed lock-in, another PC).
// Only readings that can't be ambiguous are used: more than 30 minutes left can only be the 12 hour
// lockout, and otherwise the reading must be within 3 minutes of a full lockout (a 30 minute lockout with
// 10 minutes left would look like a fresh 15 minute one).
const LOCKOUTS = [
  [6, 1],
  [15, 1],
  [30, 2],
];
const FRESH_WINDOW_S = 180;

function learnFromPenalty(remainingSeconds) {
  const remaining = Number(remainingSeconds);
  if (!Number.isFinite(remaining) || remaining <= 0) return;
  if (remaining > 30 * 60) {
    saveTier(3, Date.now() - Math.max(0, 720 * 60 - remaining) * 1000);
    return;
  }
  for (const [minutes, tier] of LOCKOUTS) {
    const full = minutes * 60;
    if (remaining <= full && remaining >= full - FRESH_WINDOW_S) {
      saveTier(tier, Date.now() - (full - remaining) * 1000);
      return;
    }
  }
}

/* ---------------------------------------------------------------------------------------------
 * Penalty preview
 * ------------------------------------------------------------------------------------------- */

function queueOf(gameflow) {
  const queue = gameflow?.gameData?.queue;
  if (!queue) return null;
  return {
    id: Number(queue.id) || 0,
    type: String(queue.type ?? ""),
    gameMode: String(queue.gameMode ?? ""),
    isRanked: queue.isRanked === true,
    isCustom: Boolean(gameflow?.gameData?.isCustomGame || queue.isCustom),
  };
}

function isAram(queue) {
  return /ARAM/i.test(queue?.type ?? "") || /^ARAM$/i.test(queue?.gameMode ?? "");
}

function isRankedQueue(queue) {
  return Boolean(queue?.isRanked) || /^RANKED_/i.test(queue?.type ?? "");
}

function lockoutText(minutes) {
  if (minutes >= 60) return `${Math.round(minutes / 60)} hr lockout`;
  return `${minutes} min lockout`;
}

async function computePenalty(queue) {
  const tier = Math.min(currentTier() + 1, 3);
  const aram = isAram(queue);
  const lockout = (aram ? ARAM_LOCKOUT_MINUTES : LOCKOUT_MINUTES)[tier];
  const penalty = { tier, lockout, lp: 0, ranked: isRankedQueue(queue), placed: false, apex: false, aram };
  if (!penalty.ranked) return penalty;
  const stats = await api.lcu.get(RANKED_STATS_URI).catch(() => null);
  const entry = stats?.queueMap?.[queue.type] ?? null;
  const tierName = String(entry?.tier ?? "").toUpperCase();
  // No LP is lost before you are placed in that queue.
  penalty.placed = Boolean(tierName) && tierName !== "NONE" && tierName !== "UNRANKED" && entry?.isProvisional !== true;
  penalty.apex = penalty.placed && APEX_TIERS.has(tierName);
  if (penalty.placed) penalty.lp = penalty.apex && tier === 1 ? APEX_FIRST_DODGE_LP : RANKED_LP[tier];
  return penalty;
}

function costText(penalty) {
  if (!penalty) return "";
  const parts = [];
  if (penalty.ranked) parts.push(penalty.lp > 0 ? `−${penalty.lp} LP` : "No LP");
  parts.push(lockoutText(penalty.lockout));
  return parts.join(" · ");
}

function costTitle(penalty) {
  const lines = [];
  if (penalty) {
    lines.push(`Your next dodge is dodge #${penalty.tier}: ${costText(penalty)}.`);
    if (penalty.ranked && !penalty.placed) lines.push("You are not placed in this queue yet, so no LP is lost.");
    if (penalty.apex) lines.push("Master+ dodges also affect your MMR.");
    if (penalty.aram) lines.push("ARAM dodges also cost a Blessed Card.");
  }
  lines.push("", "Dodges within 24 hours stack: 6 min, then 30 min, then 12 hours (ranked: -5, -15, -15 LP).");
  lines.push("Each 24 hours without a dodge lowers the count by one.");
  return lines.join("\n");
}

async function refreshPenalty() {
  if (!active || state.phase !== "ChampSelect" || !state.queue || state.queue.isCustom) return;
  const token = ++penaltyToken;
  const penalty = await computePenalty(state.queue);
  if (!active || token !== penaltyToken) return;
  state.penalty = penalty;
  render();
}

/* ---------------------------------------------------------------------------------------------
 * Button: the client's own flat button, on its own row above the chat / missions / voice buttons.
 * ------------------------------------------------------------------------------------------- */

function shouldShow() {
  return active && state.phase === "ChampSelect" && state.queue && !state.queue.isCustom && !state.showQuitButton;
}

function buttonLabel() {
  if (state.busy) return "Leaving...";
  if (state.closeOffered) return state.armed ? "Confirm close" : "Close client";
  if (state.armed) return "Confirm";
  return isRankedQueue(state.queue) ? "Dodge" : "Quit";
}

// Sits on its own row right above the chat / missions / voice buttons, exactly as wide as that group.
function place(root, footer) {
  const chat = footer.querySelector("lol-social-chat-toggle-button");
  const voice = footer.querySelector(".champ-select-voice-button-wrapper");
  const box = footer.getBoundingClientRect();
  const left = Math.round((chat ?? footer).getBoundingClientRect().left);
  const right = Math.round((voice ?? footer).getBoundingClientRect().right);
  const top = Math.round(box.top - 32 - 8);
  const width = Math.max(96, right - left);
  const key = `${left}:${top}:${width}`;
  if (root.dataset.place === key) return;
  root.dataset.place = key;
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.width = `${width}px`;
}

function render() {
  const footer = document.querySelector(FOOTER_SELECTOR);
  let root = document.querySelector(`.${ROOT_CLASS}`);
  if (!shouldShow() || !footer) {
    root?.remove();
    return;
  }
  if (!root || !root.isConnected) {
    root?.remove();
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    const cost = document.createElement("div");
    cost.className = "perf-dodge-cost";
    const button = document.createElement("lol-uikit-flat-button");
    button.addEventListener("click", onClick);
    root.append(cost, button);
    document.body.append(root);
  }
  place(root, footer);
  const button = root.querySelector("lol-uikit-flat-button");
  const cost = root.querySelector(".perf-dodge-cost");
  const label = buttonLabel();
  if (button.textContent !== label) button.textContent = label;
  if (state.busy) button.setAttribute("disabled", "true");
  else button.removeAttribute("disabled");
  root.classList.toggle("perf-dodge-armed", state.armed);
  const text = costText(state.penalty);
  if (cost.textContent !== text) cost.textContent = text;
  const title = state.closeOffered
    ? "Riot doesn't let the client leave this champ select (ranked, or the game is about to start). Closing the client dodges; reopen League afterwards."
    : state.armed
      ? "Click again to leave champ select."
      : costTitle(state.penalty);
  if (root.title !== title) root.title = title;
}

function disarm() {
  clearTimeout(armedTimer);
  armedTimer = null;
  state.armed = false;
}

function onClick(event) {
  event.preventDefault();
  event.stopPropagation();
  if (state.busy || !shouldShow()) return;
  // Two clicks: a stray click can't cost LP.
  if (!state.armed) {
    state.armed = true;
    clearTimeout(armedTimer);
    armedTimer = setTimeout(() => {
      disarm();
      render();
    }, CONFIRM_MS);
    render();
    return;
  }
  disarm();
  if (state.closeOffered) closeClient();
  else leave();
}

function closeClient() {
  state.busy = true;
  render();
  recordOwnDodge();
  fetch(CLOSE_CLIENT_URI, { method: "POST" }).catch(() => {});
}

async function leave() {
  state.busy = true;
  render();
  try {
    const response = await fetch(QUIT_URI, { method: "POST" });
    if (!response.ok) {
      state.closeOffered = true;
      state.armed = true;
      clearTimeout(armedTimer);
      armedTimer = setTimeout(() => {
        disarm();
        render();
      }, CONFIRM_MS * 2);
      throw new Error(`quit responded ${response.status}`);
    }
    state.quitSent = true;
    if (!state.queue?.isCustom) recordOwnDodge();
  } catch (error) {
    console.warn("[Dodge Helper] Could not leave champ select:", error);
  } finally {
    state.busy = false;
    render();
  }
}

/* ---------------------------------------------------------------------------------------------
 * Gameflow
 * ------------------------------------------------------------------------------------------- */

async function loadSummoner() {
  if (state.summoner) return state.summoner;
  const summoner = await api.lcu.get(SUMMONER_URI).catch(() => null);
  if (summoner && active) state.summoner = { puuid: summoner.puuid || "", summonerId: summoner.summonerId || 0 };
  return state.summoner;
}

function migrateLegacyStore() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE_KEY) || "null");
    if (!legacy || typeof legacy !== "object") return;
    const store = readStore();
    for (const [key, record] of Object.entries(legacy)) {
      if (!store[key] && typeof record?.tier === "number" && typeof record?.at === "number") store[key] = record;
    }
    writeStore(store);
    localStorage.removeItem(LEGACY_STORE_KEY);
    localStorage.removeItem("perfectionist:dodge-helper:pending:v1");
  } catch {}
}

function applySearchState(search) {
  if (!search || !state.summoner) return;
  for (const error of Array.isArray(search.errors) ? search.errors : []) {
    if (!/DODGE/i.test(String(error?.errorType ?? ""))) continue;
    const who = Number(error.penalizedSummonerId) || 0;
    if (who && state.summoner.summonerId && who !== state.summoner.summonerId) continue;
    learnFromPenalty(error.penaltyTimeRemaining);
  }
}

async function checkPenaltyFromServer() {
  const search = await api.lcu.get(SEARCH_STATE_URI).catch(() => null);
  if (active) applySearchState(search);
}

async function onChampSelectEnded(nextPhase) {
  const gameflow = await api.lcu.get(GAMEFLOW_URI).catch(() => null);
  const dodgers = (gameflow?.gameDodge?.dodgeIds ?? []).map(Number);
  const me = Number(state.summoner?.summonerId) || 0;
  // A missed lock-in or a closed client is a dodge too; the gameflow names who dodged.
  if (me && dodgers.includes(me) && !state.quitSent && !state.queue?.isCustom) recordOwnDodge();
  state.quitSent = false;
  if (nextPhase === "Lobby" || nextPhase === "None") setTimeout(() => active && checkPenaltyFromServer(), 1500);
}

async function onPhase(raw) {
  if (!active) return;
  const phase = typeof raw === "string" ? raw : raw?.data;
  if (typeof phase !== "string" || !phase) return;
  const previous = state.phase;
  state.phase = phase;
  if (previous === "ChampSelect" && phase !== "ChampSelect") onChampSelectEnded(phase);
  if (phase === "ChampSelect" && previous !== "ChampSelect") {
    disarm();
    state.penalty = null;
    state.quitSent = false;
    await loadSummoner();
    const [gameflow, champSelect] = await Promise.all([
      api.lcu.get(GAMEFLOW_URI).catch(() => null),
      api.lcu.get(CHAMP_SELECT_URI).catch(() => null),
    ]);
    if (!active || state.phase !== "ChampSelect") return;
    if (gameflow) state.queue = queueOf(gameflow) ?? state.queue;
    if (champSelect) state.showQuitButton = Boolean(champSelect.showQuitButton);
    refreshPenalty();
  }
  if (phase !== "ChampSelect") {
    disarm();
    state.showQuitButton = false;
    state.closeOffered = false;
  }
  render();
}

function onGameflow(message) {
  const queue = queueOf(message?.data ?? message);
  if (!queue) return;
  const changed = !state.queue || queue.id !== state.queue.id || queue.type !== state.queue.type;
  state.queue = queue;
  if (changed && state.phase === "ChampSelect") refreshPenalty();
  render();
}

function onChampSelect(message) {
  const session = message?.data ?? message;
  if (!session || typeof session !== "object" || message?.eventType === "Delete") return;
  const show = Boolean(session.showQuitButton);
  if (show !== state.showQuitButton) {
    state.showQuitButton = show;
    render();
  }
}

function onSearchState(message) {
  applySearchState(message?.data ?? message);
}

function onFrame() {
  // Ember can re-render the footer; put the button back if it went missing.
  if (state.phase !== "ChampSelect") return;
  const footer = document.querySelector(FOOTER_SELECTOR);
  const root = document.querySelector(`.${ROOT_CLASS}`);
  if (shouldShow() ? !(root && footer) : root) render();
  else if (root && footer) place(root, footer);
}

async function onEnable(utils) {
  api = utils;
  active = true;
  migrateLegacyStore();
  removeStyle = utils.addStyle(STYLE_ID, CSS);
  const handlers = [
    [PHASE_URI, onPhase],
    [GAMEFLOW_URI, onGameflow],
    [CHAMP_SELECT_URI, onChampSelect],
    [SEARCH_STATE_URI, onSearchState],
  ];
  for (const [uri, handler] of handlers) {
    const off = utils.subscribe(uri, handler);
    if (off) unsubscribes.push(off);
  }
  unwatchFooter = utils.watch(FOOTER_SELECTOR, () => render());
  removeFrameHook = utils.onFrame ? utils.onFrame(onFrame) : null;
  window.addEventListener("resize", render);

  await loadSummoner();
  if (!active) return;
  const phase = await utils.lcu.get(PHASE_URI).catch(() => null);
  if (!active) return;
  if (phase === "Lobby" || phase === "None") checkPenaltyFromServer();
  if (typeof phase === "string") await onPhase(phase);
}

function onDisable() {
  active = false;
  for (const off of unsubscribes) {
    try {
      off();
    } catch {}
  }
  unsubscribes = [];
  unwatchFooter?.();
  unwatchFooter = null;
  removeFrameHook?.();
  removeFrameHook = null;
  window.removeEventListener("resize", render);
  disarm();
  document.querySelector(`.${ROOT_CLASS}`)?.remove();
  removeStyle?.();
  removeStyle = null;
  Object.assign(state, {
    phase: null,
    queue: null,
    showQuitButton: false,
    summoner: null,
    penalty: null,
    armed: false,
    busy: false,
    quitSent: false,
    closeOffered: false,
  });
  penaltyToken += 1;
  api = null;
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Dodge Helper",
      description:
        "Adds a DODGE button to champ select (QUIT outside ranked) that leaves cleanly, showing the LP and queue lockout your next dodge will cost.",
      version,
      onEnable,
      onDisable,
    });
  };

  if (window.PerfectionistUtils) {
    registerWith(window.PerfectionistUtils);
    return;
  }
  addEventListener("perfectionist:utils-ready", (event) => registerWith(event.detail ?? window.PerfectionistUtils), { once: true });
}
