const PLUGIN_ID = "dodge-helper";
export const version = "1.4.2";

const PHASE_URI = "/lol-gameflow/v1/gameflow-phase";
const SESSION_URI = "/lol-gameflow/v1/session";
const CHAMP_SELECT_URI = "/lol-champ-select/v1/session";
const SUMMONER_URI = "/lol-summoner/v1/current-summoner";
const RANKED_STATS_URI = "/lol-ranked/v1/current-ranked-stats";
const DODGE_URI = "/lol-gameflow/v1/session/dodge";
const QUIT_URI = "/lol-lobby-team-builder/champ-select/v1/session/quit";
const STORE_KEY = "perfectionist:dodge-helper:accounts:v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const STYLE_ID = "perf-dodge-helper-style";
const ROOT_ID = "perfDodgeHelper";
const BUTTON_ID = "perfDodgeHelperButton";
const LP_ID = "perfDodgeHelperLp";

const RANKED_QUEUES = new Map([
  [420, "RANKED_SOLO_5x5"],
  [440, "RANKED_FLEX_SR"],
]);
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const PENALTY_TIERS = {
  1: { lp: 5, lockout: "6-minute" },
  2: { lp: 15, lockout: "30-minute" },
  3: { lp: 15, lockout: "12-hour" },
};

const CSS = `
.perf-dodge-anchor { position: relative !important; overflow: visible !important; }
#${ROOT_ID} {
  position: relative !important; display: flex !important; align-items: flex-end !important;
  justify-content: center !important; width: 125px !important; height: 32px !important; z-index: 20 !important;
}
#${ROOT_ID}.perf-dodge-quit { position: absolute !important; left: 0 !important; bottom: 0 !important; }
#${ROOT_ID}.perf-dodge-bar { margin-left: 12px !important; }
#${ROOT_ID}.perf-dodge-floating { position: fixed !important; right: 145px !important; bottom: 21px !important; }
#${ROOT_ID} lol-uikit-flat-button { width: 125px !important; height: 32px !important; }
#${ROOT_ID} .perf-dodge-lp {
  position: absolute !important; left: 0 !important; right: 0 !important; bottom: calc(100% + 4px) !important;
  text-align: center !important; white-space: nowrap !important;
  font-family: var(--font-body, "LoL Body", Arial, sans-serif) !important;
  font-size: 11px !important; font-weight: 700 !important; letter-spacing: 0.4px !important;
  line-height: 1 !important; color: #cdbe91 !important;
}`;

let api = null;
let active = false;
let dodging = false;
let unsubscribes = [];
let removeStyle = null;
let domObserver = null;
let domTimer = null;
let networkWatch = null;
let penaltyToken = 0;
const state = {
  phase: null,
  queueId: 0,
  isCustom: false,
  showQuitButton: false,
  gameMode: "",
  account: null,
  penalty: null,
  lastSelfDodgeAt: 0,
  lockedLocalPick: false,
  anchor: null,
};

function unwrap(raw) {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return unwrap(JSON.parse(text));
      } catch {
        return raw;
      }
    }
    return raw;
  }
  if (Array.isArray(raw) && raw.length >= 3 && typeof raw[1] === "string") {
    return unwrap(raw[2]?.data ?? raw[2]);
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    const keys = Object.keys(raw);
    if (keys.includes("uri") || keys.includes("eventType") || keys.length <= 2) return unwrap(raw.data);
  }
  return raw;
}

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function accountKey() {
  const account = state.account;
  if (!account) return null;
  if (account.puuid) return account.puuid;
  if (account.summonerId) return `sid:${account.summonerId}`;
  return null;
}

function currentTier() {
  const key = accountKey();
  if (!key) return 0;
  const record = readStore()[key];
  if (!record || typeof record.tier !== "number" || typeof record.at !== "number") return 0;
  const drops = Math.floor((Date.now() - record.at) / DAY_MS);
  return Math.max(0, Math.min(record.tier - drops, 3));
}

async function loadAccount() {
  if (state.account) return state.account;
  const summoner = await api.lcu.get(SUMMONER_URI).catch(() => null);
  if (summoner) {
    state.account = { puuid: summoner.puuid || "", summonerId: summoner.summonerId || 0 };
  }
  return state.account;
}

async function recordDodge() {
  if (!active) return;
  if (hasNativeQuit()) return;
  const now = Date.now();
  if (now - state.lastSelfDodgeAt < 1500) return;
  state.lastSelfDodgeAt = now;
  await loadAccount();
  const key = accountKey();
  if (!key) return;
  const store = readStore();
  const tier = Math.min(currentTier() + 1, 3);
  store[key] = { tier, at: now };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

async function computePenalty(queueId) {
  const rankedKey = RANKED_QUEUES.get(queueId);
  if (!rankedKey) return { ranked: false, lp: 0, tier: 0, lockout: "" };
  await loadAccount();
  const stats = await api.lcu.get(RANKED_STATS_URI).catch(() => null);
  const tierName = String(stats?.queueMap?.[rankedKey]?.tier ?? "").toUpperCase();
  if (!tierName || tierName === "UNRANKED") return { ranked: true, lp: 0, tier: 0, lockout: "" };
  const tier = Math.min(currentTier() + 1, 3);
  const apex = APEX_TIERS.has(tierName);
  return {
    ranked: true,
    lp: apex && tier === 1 ? 20 : PENALTY_TIERS[tier].lp,
    lockout: PENALTY_TIERS[tier].lockout,
    tier,
  };
}

function isCustomQueue() {
  return state.isCustom || state.gameMode === "PRACTICETOOL" || state.queueId === 0;
}

function hasNativeQuit() {
  return state.showQuitButton || isCustomQueue();
}

function render() {
  const button = document.getElementById(BUTTON_ID);
  const lp = document.getElementById(LP_ID);
  if (!button || !lp) return;
  const ranked = RANKED_QUEUES.has(state.queueId);
  const label = ranked ? "DODGE" : "QUIT";
  if (button.textContent !== label) button.textContent = label;
  const penalty = state.penalty;
  const amount = ranked && penalty?.ranked ? penalty.lp : 0;
  const text = amount > 0 ? `\u2212${amount} LP` : "";
  if (lp.textContent !== text) lp.textContent = text;
  lp.style.display = text ? "" : "none";
  if (ranked) {
    button.title =
      amount > 0
        ? `Dodge champion select. This costs about ${amount} LP and a ${penalty?.lockout ?? "queue"} lockout. Your dodge tier is shared across queues and drops one step every 24 hours.`
        : "Dodge champion select. This queue is unranked, so no LP is lost, but the dodge still advances your shared dodge tier.";
  } else {
    button.title = "Leave champion select. This counts as a dodge and advances your shared dodge tier.";
  }
  lp.title =
    ranked && amount > 0
      ? "Estimated LP for this dodge, from this account's shared dodge tier. The tier drops one step every 24 hours."
      : "";
}

async function refreshPenalty() {
  if (!active || state.phase !== "ChampSelect" || !state.queueId || hasNativeQuit()) return;
  const queueId = state.queueId;
  const token = ++penaltyToken;
  const penalty = await computePenalty(queueId);
  if (!active || token !== penaltyToken || queueId !== state.queueId) return;
  state.penalty = penalty;
  render();
  bindButton(document.getElementById(BUTTON_ID));
  requestAnimationFrame(() => bindButton(document.getElementById(BUTTON_ID)));
}

function applySession(raw) {
  const session = unwrap(raw);
  if (!session) return;
  const queue = session.gameData?.queue;
  if (queue) {
    const queueId = Number(queue.id ?? 0) || 0;
    const isCustom = Boolean(session.gameData?.isCustomGame || queue.isCustom);
    const gameMode = String(queue.gameMode ?? "");
    if (queueId !== state.queueId || isCustom !== state.isCustom || gameMode !== state.gameMode) {
      state.queueId = queueId;
      state.isCustom = isCustom;
      state.gameMode = gameMode;
      state.penalty = null;
      if (state.phase === "ChampSelect") refreshPenalty();
    }
  }
  ensureMount();
}

function syncLocalPick(session) {
  const cellId = Number(session?.localPlayerCellId);
  if (!Number.isFinite(cellId)) return;
  const actions = Array.isArray(session.actions) ? session.actions.flat() : [];
  const locked = actions.some(
    (action) => Number(action?.actorCellId) === cellId && action?.type === "pick" && action?.completed === true
  );
  if (locked) state.lockedLocalPick = true;
}

function applyChampSelect(raw) {
  const session = unwrap(raw);
  if (!session) return;
  state.showQuitButton = Boolean(session.showQuitButton);
  const queueId = Number(session.queueId ?? 0) || 0;
  if (queueId > 0) state.queueId = queueId;
  if (session.isCustomGame) state.isCustom = true;
  syncLocalPick(session);
  ensureMount();
  syncWatching();
}

function unmount() {
  for (const element of document.querySelectorAll(`#${ROOT_ID}`)) element.remove();
  if (state.anchor) {
    state.anchor.classList.remove("perf-dodge-anchor");
    state.anchor = null;
  }
}

function onButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();
  quitOrDodge();
}

function bindButton(button) {
  if (!button) return;
  if (!button.__perfClickBound) {
    button.__perfClickBound = true;
    button.addEventListener("click", onButtonClick, true);
  }
  const inner = button.shadowRoot?.querySelector(".lol-uikit-flat-button");
  if (inner && !inner.__perfClickBound) {
    inner.__perfClickBound = true;
    inner.addEventListener("click", onButtonClick);
  }
}

function build() {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  const lp = document.createElement("span");
  lp.id = LP_ID;
  lp.className = "perf-dodge-lp";
  const button = document.createElement("lol-uikit-flat-button");
  button.id = BUTTON_ID;
  bindButton(button);
  root.append(lp, button);
  return root;
}

function host() {
  const quitBar = document.querySelector(".bottom-right-buttons");
  if (quitBar && quitBar.getBoundingClientRect().width > 1) return { element: quitBar, kind: "quit" };
  const screen = document.querySelector(".champion-select");
  if (screen) return { element: screen, kind: "floating" };
  const bars = [...document.querySelectorAll(".champ-select-action-content")].filter(
    (element) => element.getBoundingClientRect().width > 1
  );
  return bars[0] ? { element: bars[0], kind: "bar" } : null;
}

function ensureMount() {
  if (!active || state.phase !== "ChampSelect" || hasNativeQuit()) {
    unmount();
    return;
  }
  const target = host();
  if (!target) {
    unmount();
    return;
  }
  if (state.anchor && state.anchor !== target.element) {
    state.anchor.classList.remove("perf-dodge-anchor");
    state.anchor = null;
  }
  if (target.kind === "quit") {
    target.element.classList.add("perf-dodge-anchor");
    state.anchor = target.element;
  }
  const roots = [...document.querySelectorAll(`#${ROOT_ID}`)];
  for (const extra of roots.slice(1)) extra.remove();
  const root = roots[0] ?? build();
  if (root.parentElement !== target.element) target.element.prepend(root);
  else if (target.kind === "quit" && target.element.firstElementChild !== root) target.element.prepend(root);
  root.classList.toggle("perf-dodge-quit", target.kind === "quit");
  root.classList.toggle("perf-dodge-bar", target.kind === "bar");
  root.classList.toggle("perf-dodge-floating", target.kind === "floating");
  render();
  bindButton(document.getElementById(BUTTON_ID));
  requestAnimationFrame(() => bindButton(document.getElementById(BUTTON_ID)));
  setTimeout(() => bindButton(document.getElementById(BUTTON_ID)), 500);
}

function scheduleMount() {
  if (domTimer) return;
  domTimer = setTimeout(() => {
    domTimer = null;
    ensureMount();
  }, 200);
}

function startDomObserver() {
  if (domObserver) return;
  const target =
    document.querySelector(".champion-select") ?? document.querySelector(".screen-root") ?? document.body;
  domObserver = new MutationObserver(scheduleMount);
  domObserver.observe(target, { childList: true, subtree: true });
}

function stopDomObserver() {
  domObserver?.disconnect();
  domObserver = null;
  clearTimeout(domTimer);
  domTimer = null;
}

function isDodgeUrl(url) {
  return /\/(lol-gameflow\/v1\/session\/dodge|lol-lobby-team-builder\/champ-select\/v1\/session\/quit)(\?|$)/i.test(
    String(url)
  );
}

function installDodgeWatcher() {
  if (networkWatch) return;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  const ourFetch = function (...args) {
    const url = String(args[0]?.url ?? args[0] ?? "");
    const method = String(args[1]?.method ?? "GET").toUpperCase();
    const promise = originalFetch.apply(this, args);
    if (method === "POST" && isDodgeUrl(url)) {
      promise
        .then((response) => {
          if (response.ok) recordDodge();
        })
        .catch(() => {});
    }
    return promise;
  };

  const ourOpen = function (method, url, ...rest) {
    this.__perfDodgeUrl = String(url);
    this.__perfDodgeMethod = String(method ?? "GET").toUpperCase();
    return originalOpen.call(this, method, url, ...rest);
  };

  const ourSend = function (body) {
    if (this.__perfDodgeMethod === "POST" && isDodgeUrl(this.__perfDodgeUrl)) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) recordDodge();
      });
    }
    return originalSend.call(this, body);
  };

  window.fetch = ourFetch;
  XMLHttpRequest.prototype.open = ourOpen;
  XMLHttpRequest.prototype.send = ourSend;

  networkWatch = {
    restore() {
      if (window.fetch === ourFetch) window.fetch = originalFetch;
      if (XMLHttpRequest.prototype.open === ourOpen) XMLHttpRequest.prototype.open = originalOpen;
      if (XMLHttpRequest.prototype.send === ourSend) XMLHttpRequest.prototype.send = originalSend;
    },
  };
}

function removeDodgeWatcher() {
  networkWatch?.restore();
  networkWatch = null;
}

function syncWatching() {
  if (state.phase === "ChampSelect" && !hasNativeQuit()) {
    startDomObserver();
    installDodgeWatcher();
  } else {
    stopDomObserver();
    removeDodgeWatcher();
  }
}

async function quitOrDodge() {
  if (dodging || !state.queueId || hasNativeQuit()) return;
  dodging = true;
  const button = document.getElementById(BUTTON_ID);
  if (button) button.disabled = true;
  const ranked = RANKED_QUEUES.has(state.queueId);
  const uri = ranked ? DODGE_URI : QUIT_URI;
  try {
    await api.lcu.send("POST", uri);
    await recordDodge();
    setTimeout(() => {
      const current = document.getElementById(BUTTON_ID);
      if (current) current.disabled = false;
    }, 1500);
  } catch (error) {
    console.warn("[Dodge Helper] quit failed:", error);
    if (button) button.disabled = false;
  } finally {
    dodging = false;
  }
}

async function handlePhase(raw) {
  const previous = state.phase;
  const phase = typeof raw === "string" ? raw : unwrap(raw);
  if (typeof phase === "string" && phase) state.phase = phase;
  if (previous === "ChampSelect" && state.phase !== "ChampSelect" && state.phase !== "GameStart" && state.phase !== "InProgress") {
    if (RANKED_QUEUES.has(state.queueId) && !state.lockedLocalPick && !hasNativeQuit()) {
      recordDodge();
    }
    state.lockedLocalPick = false;
  }
  if (state.phase === "ChampSelect" && previous !== "ChampSelect") state.lockedLocalPick = false;
  if (state.phase === "ChampSelect") {
    await loadAccount();
    const [session, champSelect] = await Promise.all([
      api.lcu.get(SESSION_URI).catch(() => null),
      api.lcu.get(CHAMP_SELECT_URI).catch(() => null),
    ]);
    if (session) applySession(session);
    if (champSelect) applyChampSelect(champSelect);
    ensureMount();
    refreshPenalty();
  } else {
    stopDomObserver();
    removeDodgeWatcher();
    unmount();
    state.penalty = null;
    state.showQuitButton = false;
  }
}

function handleSession(raw) {
  applySession(raw);
}

function handleChampSelect(raw) {
  applyChampSelect(raw);
  if (state.phase === "ChampSelect") {
    ensureMount();
    refreshPenalty();
  }
}

function onEnable(utils) {
  api = utils;
  active = true;
  removeStyle = utils.addStyle(STYLE_ID, CSS);

  const handlers = {
    [PHASE_URI]: handlePhase,
    [SESSION_URI]: handleSession,
    [CHAMP_SELECT_URI]: handleChampSelect,
  };
  for (const [uri, handler] of Object.entries(handlers)) {
    try {
      const off = utils.subscribe(uri, handler);
      if (off) unsubscribes.push(off);
    } catch {}
  }

  loadAccount();
  utils.lcu
    .get(PHASE_URI)
    .then((phase) => handlePhase(unwrap(phase)))
    .catch(() => {});
  utils.lcu
    .get(SESSION_URI)
    .then((session) => session && applySession(session))
    .catch(() => {});
}

function onDisable() {
  active = false;
  for (const off of unsubscribes) {
    try {
      off();
    } catch {}
  }
  unsubscribes = [];
  stopDomObserver();
  removeDodgeWatcher();
  unmount();
  removeStyle?.();
  removeStyle = null;
  state.phase = null;
  state.queueId = 0;
  state.isCustom = false;
  state.showQuitButton = false;
  state.gameMode = "";
  state.account = null;
  state.penalty = null;
  state.lastSelfDodgeAt = 0;
  state.lockedLocalPick = false;
  penaltyToken = 0;
  api = null;
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Dodge Helper",
      description:
        "Adds a DODGE/QUIT button to champion select: DODGE with the estimated LP loss for ranked queues, QUIT for every other mode. Hidden when the client already shows its own QUIT button.",
      version,
      defaultEnabled: true,
      onEnable,
      onDisable,
    });
  };

  if (window.PerfectionistUtils) {
    registerWith(window.PerfectionistUtils);
    return;
  }
  addEventListener("perfectionist:utils-ready", (event) => registerWith(event.detail ?? window.PerfectionistUtils), {
    once: true,
  });
}
