const PLUGIN_ID = "dodge-helper";
export const version = "1.4.14";

const PHASE_URI = "/lol-gameflow/v1/gameflow-phase";
const SESSION_URI = "/lol-gameflow/v1/session";
const CHAMP_SELECT_URI = "/lol-champ-select/v1/session";
const TIMER_URI = "/lol-champ-select/v1/session/timer";
const SUMMONER_URI = "/lol-summoner/v1/current-summoner";
const RANKED_STATS_URI = "/lol-ranked/v1/current-ranked-stats";
const QUIT_V2_URI = '/lol-login/v1/session/invoke?destination=lcdsServiceProxy&method=call&args=["","teambuilder-draft","quitV2",""]';
const CUSTOM_CANCEL_URI = "/lol-lobby/v1/lobby/custom/cancel-champ-select";
const STORE_KEY = "perfectionist:dodge-helper:accounts:v1";
const PENDING_KEY = "perfectionist:dodge-helper:pending:v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const STYLE_ID = "perf-dodge-helper-style";
const LAYER_ID = "perfDodgeHelperLayer";
const ROOT_ID = "perfDodgeHelper";
const BUTTON_ID = "perfDodgeHelperButton";
const COST_ID = "perfDodgeHelperCost";
const FOOTER_SELECTOR = ".bottom-right-buttons";
const SCREEN_SELECTOR = ".champion-select";

const RANKED_QUEUES = new Map([
  [420, "RANKED_SOLO_5x5"],
  [440, "RANKED_FLEX_SR"],
]);
const ARAM_QUEUES = new Set([450, 2400, 2401, 2402]);
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const PENALTY_TIERS = {
  1: { lp: 5, lockout: 6 },
  2: { lp: 15, lockout: 30 },
  3: { lp: 15, lockout: 720 },
};
const GAME_PHASES = new Set([
  "GameStart",
  "InProgress",
  "Reconnect",
  "WaitingForStats",
  "PreEndOfGame",
  "EndOfGame",
]);

const CSS = `
#${LAYER_ID} {
  position: fixed !important; inset: 0 !important; z-index: 100 !important;
  pointer-events: none !important;
}
#${ROOT_ID} {
  position: fixed !important; display: flex !important; align-items: flex-end !important;
  justify-content: center !important; width: 114px !important; height: 32px !important;
  pointer-events: auto !important; z-index: 1 !important;
}
#${ROOT_ID} .perf-dodge-button {
  width: 100% !important; height: 32px !important; box-sizing: border-box !important;
  appearance: none !important; -webkit-appearance: none !important; border-radius: 0 !important;
  padding: 0 !important; border: 1px solid #785a28 !important;
  background: linear-gradient(to bottom, #1e2328 0%, #11161c 55%, #0a0e12 100%) !important;
  color: #cdbe91 !important; font-family: var(--font-display, "Beaufort for LOL", serif) !important;
  font-size: 13px !important; font-weight: 700 !important; letter-spacing: 1px !important;
  text-transform: uppercase !important; cursor: pointer !important;
  text-shadow: 0 1px 2px #000 !important;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(240, 230, 210, 0.12) !important;
}
#${ROOT_ID} .perf-dodge-button:hover {
  color: #f0e6d2 !important; border-color: #c89b3c !important;
  background: linear-gradient(to bottom, #2a3038 0%, #192027 55%, #0e141a 100%) !important;
}
#${ROOT_ID} .perf-dodge-button:disabled { opacity: 0.6 !important; cursor: default !important; }
#${ROOT_ID} .perf-dodge-cost {
  position: absolute !important; left: 50% !important; bottom: calc(100% + 4px) !important;
  transform: translateX(-50%) !important; box-sizing: border-box !important;
  max-width: 245px !important; padding: 3px 7px !important;
  background: rgba(1, 10, 19, 0.88) !important; border: 1px solid #785a28 !important;
  color: #cdbe91 !important; font-family: var(--font-body, "LoL Body", Arial, sans-serif) !important;
  font-size: 10px !important; font-weight: 700 !important; letter-spacing: 0.3px !important;
  line-height: 1.25 !important; text-align: center !important; white-space: nowrap !important;
  pointer-events: none !important;
}
`;

let api = null;
let active = false;
let dodging = false;
let unsubscribes = [];
let unwatchers = [];
let removeStyle = null;
let resizeObserver = null;
let mountFrame = 0;
let positionFrame = 0;
let networkWatch = null;
let penaltyToken = 0;
let pendingWriteAt = 0;
let accountPromise = null;
const state = {
  phase: null,
  queueId: 0,
  isCustom: false,
  showQuitButton: false,
  gameMode: "",
  account: null,
  penalty: null,
  lastSelfDodgeAt: 0,
  selfDodgeRecorded: false,
  lockedLocalPick: false,
  localActionSeen: false,
  localActionActive: false,
  localActionDeadline: 0,
  pageHiding: false,
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

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

function readPending() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePending(pending) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {}
}

function clearPending() {
  pendingWriteAt = 0;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
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
  const drops = Math.max(0, Math.floor((Date.now() - record.at) / DAY_MS));
  return Math.max(0, Math.min(record.tier - drops, 3));
}

async function loadAccount() {
  if (state.account) return state.account;
  if (!accountPromise) {
    accountPromise = api.lcu
      .get(SUMMONER_URI)
      .then((summoner) => {
        if (!active) return null;
        if (summoner) {
          state.account = { puuid: summoner.puuid || "", summonerId: summoner.summonerId || 0 };
        }
        return state.account;
      })
      .catch(() => null)
      .finally(() => {
        accountPromise = null;
      });
  }
  return accountPromise;
}

function isCustomQueue(queueId = state.queueId) {
  return state.isCustom || state.gameMode === "PRACTICETOOL" || Number(queueId) === 0;
}

function isAramQueue(queueId = state.queueId) {
  const id = Number(queueId);
  if (RANKED_QUEUES.has(id)) return false;
  return ARAM_QUEUES.has(id) || /ARAM/i.test(state.gameMode);
}

function isGamePhase(phase) {
  return GAME_PHASES.has(phase);
}

async function recordDodge(options = {}) {
  if (!active) return false;
  const queueId = Number(options.queueId ?? state.queueId) || 0;
  if (!options.force && isCustomQueue(queueId)) return false;
  const now = Date.now();
  if (now - state.lastSelfDodgeAt < 1500) return false;
  state.lastSelfDodgeAt = now;
  await loadAccount();
  const key = accountKey();
  if (!key) return false;
  const store = readStore();
  const tier = Math.min(currentTier() + 1, 3);
  store[key] = { tier, at: now };
  writeStore(store);
  clearPending();
  state.selfDodgeRecorded = true;
  return true;
}

function lockoutText(minutes) {
  if (minutes >= 720) return "12 hr queue";
  if (minutes >= 30) return "30 min queue";
  return `${minutes} min queue`;
}

function computePenalty(queueId = state.queueId) {
  const tier = Math.min(currentTier() + 1, 3);
  const aram = isAramQueue(queueId);
  const lockout = aram && tier === 1 ? 15 : PENALTY_TIERS[tier].lockout;
  const rankedKey = RANKED_QUEUES.get(Number(queueId));
  if (!rankedKey) {
    return Promise.resolve({ ranked: false, tier, lp: 0, lockout, apex: false, aram });
  }
  return api.lcu
    .get(RANKED_STATS_URI)
    .catch(() => null)
    .then((stats) => {
      const tierName = String(stats?.queueMap?.[rankedKey]?.tier ?? "").toUpperCase();
      const rated = Boolean(tierName) && tierName !== "UNRANKED";
      const apex = rated && APEX_TIERS.has(tierName);
      return {
        ranked: true,
        rated,
        tier,
        lp: rated ? (apex && tier === 1 ? 20 : PENALTY_TIERS[tier].lp) : 0,
        lockout,
        apex,
        aram,
      };
    });
}

function penaltyLabel(penalty) {
  if (!penalty) return "";
  const parts = [];
  if (penalty.ranked) parts.push(penalty.lp > 0 ? `\u2212${penalty.lp} LP` : "No LP");
  else parts.push("No LP");
  parts.push(lockoutText(penalty.lockout));
  if (penalty.apex) parts.push("MMR impact");
  return parts.join(" \u00b7 ");
}

function penaltyTitle(penalty) {
  const lines = [
    "Queue dodge penalty",
    "1st dodge: -5 LP and a 6-minute queue lockout.",
    "2nd dodge: -15 LP and a 30-minute queue lockout.",
    "3rd+ dodge: -15 LP and a 12-hour queue lockout.",
    "Apex (Master+): the first dodge costs 20 LP instead of 5, and Apex dodges affect MMR.",
    "Your dodge tier drops one step 24 hours after your last dodge.",
  ];
  if (penalty) {
    lines.unshift(`Next dodge (tier ${penalty.tier}): ${penaltyLabel(penalty)}.`);
    if (!penalty.ranked) lines.push("No LP is lost outside ranked queues; the queue lockout still applies.");
    if (penalty.aram) lines.push("ARAM: the first dodge has a 15-minute queue lockout.");
    if (penalty.ranked && !penalty.rated) lines.push("This ranked queue is still unranked, so no LP is lost.");
  }
  return lines.join("\n");
}

function render() {
  const button = document.getElementById(BUTTON_ID);
  const cost = document.getElementById(COST_ID);
  if (!button || !cost) return;
  const ranked = RANKED_QUEUES.has(Number(state.queueId));
  const label = ranked ? "DODGE" : "QUIT";
  if (button.textContent !== label) button.textContent = label;
  button.disabled = dodging;
  const penalty = state.penalty;
  const text = penaltyLabel(penalty);
  if (cost.textContent !== text) cost.textContent = text;
  cost.style.display = text ? "" : "none";
  const title = penalty ? penaltyTitle(penalty) : "Loading the current dodge penalty...";
  button.title = title;
  cost.title = title;
  button.setAttribute("aria-label", `${label}. ${title}`);
}

async function refreshPenalty() {
  if (!active || state.phase !== "ChampSelect" || !state.queueId || isCustomQueue() || state.showQuitButton) return;
  const queueId = state.queueId;
  const token = ++penaltyToken;
  const penalty = await computePenalty(queueId);
  if (!active || token !== penaltyToken || queueId !== state.queueId) return;
  state.penalty = penalty;
  render();
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
  syncWatching();
  savePending();
}

function syncLocalPick(session) {
  const cellId = Number(session?.localPlayerCellId);
  if (!Number.isFinite(cellId)) return;
  const actions = Array.isArray(session.actions) ? session.actions.flat() : [];
  const picks = actions.filter((action) => Number(action?.actorCellId) === cellId && action?.type === "pick");
  if (!picks.length) return;
  const locked = picks.some((action) => action?.completed === true);
  if (locked) {
    state.lockedLocalPick = true;
    state.localActionSeen = false;
    state.localActionActive = false;
    state.localActionDeadline = 0;
    return;
  }
  state.lockedLocalPick = false;
  const active = picks.find((action) => action?.isInProgress === true);
  state.localActionActive = Boolean(active);
  if (active) {
    state.localActionSeen = true;
    const timeLeft = Number(session?.timer?.timeLeft);
    if (Number.isFinite(timeLeft)) {
      state.localActionDeadline = Date.now() + Math.max(0, timeLeft) * 1000;
    }
  }
}

function syncTimer(raw) {
  const timer = unwrap(raw);
  if (!timer || typeof timer !== "object") return;
  if (!state.localActionActive || state.lockedLocalPick) return;
  const timeLeft = Number(timer.timeLeft);
  if (!Number.isFinite(timeLeft) || timeLeft < 0) return;
  state.localActionSeen = true;
  state.localActionDeadline = Date.now() + timeLeft * 1000;
}

function applyChampSelect(raw) {
  const session = unwrap(raw);
  if (!session) return;
  state.showQuitButton = Boolean(session.showQuitButton);
  const queueId = Number(session.queueId ?? 0) || 0;
  if (queueId > 0 && queueId !== state.queueId) {
    state.queueId = queueId;
    state.penalty = null;
  }
  if (typeof session.isCustomGame === "boolean") state.isCustom = session.isCustomGame;
  syncLocalPick(session);
  if (state.localActionActive && !state.localActionDeadline) {
    api.lcu
      .get(TIMER_URI)
      .catch(() => null)
      .then((timer) => {
        if (active && timer) syncTimer(timer);
      });
  }
  ensureMount();
  syncWatching();
  savePending();
}

function build() {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  const cost = document.createElement("div");
  cost.id = COST_ID;
  cost.className = "perf-dodge-cost";
  const button = document.createElement("button");
  button.type = "button";
  button.id = BUTTON_ID;
  button.className = "perf-dodge-button";
  button.textContent = "DODGE";
  bindButton(button);
  root.append(cost, button);
  return root;
}

function bindButton(button) {
  if (!button || button.__perfClickBound) return;
  button.__perfClickBound = true;
  button.addEventListener("click", onButtonClick);
}

function onButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();
  quitOrDodge();
}

function ensureLayer() {
  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    document.body.append(layer);
  }
  return layer;
}

function ensureMount() {
  if (state.phase !== "ChampSelect" || isCustomQueue() || state.showQuitButton) {
    unmount();
    return;
  }
  const layer = ensureLayer();
  let root = document.getElementById(ROOT_ID);
  const created = !root;
  if (!root) root = build();
  if (root.parentElement !== layer) layer.append(root);
  bindButton(document.getElementById(BUTTON_ID));
  render();
  schedulePosition();
  if (created) observeLayout();
}

function unmount() {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(LAYER_ID)?.remove();
}

function visibleFooter() {
  const footer = document.querySelector(FOOTER_SELECTOR);
  if (!footer) return null;
  const rect = footer.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 10) return null;
  if (rect.top < window.innerHeight * 0.5) return null;
  return rect;
}

function positionRoot() {
  positionFrame = 0;
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const footer = visibleFooter();
  const height = root.offsetHeight || 32;
  if (footer) {
    const footerElement = document.querySelector(FOOTER_SELECTOR);
    const chat = footerElement?.querySelector("lol-social-chat-toggle-button");
    const voice = footerElement?.querySelector(".champ-select-voice-button-wrapper");
    const chatRect = chat?.getBoundingClientRect();
    const voiceRect = voice?.getBoundingClientRect();
    const left = chatRect?.left;
    const rightEdge = voiceRect?.right ?? footer.right;
    const width = left && rightEdge > left ? Math.round(rightEdge - left) : 114;
    const right = Math.round(Math.max(8, window.innerWidth - rightEdge));
    const top = Math.round(Math.max(8, footer.top - height - 8));
    root.style.width = `${width}px`;
    root.style.left = "auto";
    root.style.right = `${right}px`;
    root.style.top = `${top}px`;
    root.style.bottom = "auto";
    return;
  }
  root.style.width = "114px";
  root.style.left = "auto";
  root.style.top = "auto";
  root.style.right = "20px";
  root.style.bottom = "76px";
}

function schedulePosition() {
  if (positionFrame) return;
  positionFrame = requestAnimationFrame(positionRoot);
}

function scheduleMount() {
  if (mountFrame) return;
  mountFrame = requestAnimationFrame(() => {
    mountFrame = 0;
    ensureMount();
  });
}

function observeLayout() {
  if (typeof ResizeObserver !== "function" || !resizeObserver) return;
  resizeObserver.disconnect();
  const footer = document.querySelector(FOOTER_SELECTOR);
  if (footer) resizeObserver.observe(footer);
  const screen = document.querySelector(SCREEN_SELECTOR);
  if (screen) resizeObserver.observe(screen);
}

function onWindowResize() {
  schedulePosition();
  observeLayout();
}

function onPageHide() {
  if (!active || state.phase !== "ChampSelect" || isCustomQueue()) return;
  state.pageHiding = true;
  savePending(true);
}

function syncWatching() {
  if (state.phase === "ChampSelect" && !isCustomQueue()) startDodgeWatcher();
  else removeDodgeWatcher();
}

function isDodgeUrl(url) {
  return /(?:lol-gameflow\/v1\/session\/dodge|lol-(?:champ-select|lobby-team-builder)\/.*\/session\/quit)(?:\?|$)/i.test(
    String(url),
  );
}

function startDodgeWatcher() {
  if (networkWatch) return;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  const ourFetch = function (...args) {
    const url = String(args[0]?.url ?? args[0] ?? "");
    const method = String(args[1]?.method ?? args[0]?.method ?? "GET").toUpperCase();
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

function savePending(closed = false) {
  if (!active || state.phase !== "ChampSelect" || isCustomQueue()) return;
  const now = Date.now();
  if (!closed && now - pendingWriteAt < 1000) return;
  pendingWriteAt = now;
  writePending({
    key: accountKey(),
    seenAt: now,
    queueId: state.queueId,
    locked: state.lockedLocalPick === true,
    closed: Boolean(closed),
  });
}

async function reconcilePending(phase) {
  const pending = readPending();
  if (!pending) return;
  if (phase === "ChampSelect" || isGamePhase(phase)) {
    clearPending();
    return;
  }
  const age = Date.now() - Number(pending.seenAt || 0);
  if (!Number.isFinite(age) || age < 0 || age > PENDING_MAX_AGE_MS) {
    clearPending();
    return;
  }
  const key = accountKey();
  if (pending.key && key && pending.key !== key) {
    clearPending();
    return;
  }
  if (pending.closed === true && pending.locked !== true) {
    await recordDodge({ force: true, queueId: Number(pending.queueId) || 0 });
  }
  clearPending();
}

async function handleChampSelectEnd(nextPhase) {
  if (isGamePhase(nextPhase)) {
    clearPending();
    resetSession();
    return;
  }
  if (!isCustomQueue() && !state.selfDodgeRecorded && !state.lockedLocalPick) {
    const timedOut =
      state.localActionSeen &&
      state.localActionDeadline > 0 &&
      Date.now() >= state.localActionDeadline - 900;
    if (timedOut) await recordDodge();
  }
  clearPending();
  resetSession();
}

function resetSession() {
  state.lockedLocalPick = false;
  state.localActionSeen = false;
  state.localActionActive = false;
  state.localActionDeadline = 0;
  state.penalty = null;
  penaltyToken += 1;
  render();
}

async function handlePhase(raw) {
  if (!active) return;
  const previous = state.phase;
  const phase = typeof raw === "string" ? raw : unwrap(raw);
  if (typeof phase !== "string" || !phase) return;
  state.phase = phase;

  if (previous === "ChampSelect" && phase !== "ChampSelect") {
    await handleChampSelectEnd(phase);
  }

  if (phase === "ChampSelect") {
    if (previous !== "ChampSelect") {
      state.selfDodgeRecorded = false;
      state.pageHiding = false;
      resetSession();
    }
    await loadAccount();
    const [session, champSelect, timer] = await Promise.all([
      api.lcu.get(SESSION_URI).catch(() => null),
      api.lcu.get(CHAMP_SELECT_URI).catch(() => null),
      api.lcu.get(TIMER_URI).catch(() => null),
    ]);
    if (!active) return;
    if (session) applySession(session);
    if (champSelect) applyChampSelect(champSelect);
    if (timer) syncTimer(timer);
    ensureMount();
    refreshPenalty();
    savePending();
  } else {
    syncWatching();
    unmount();
    state.penalty = null;
    state.showQuitButton = false;
    if (isGamePhase(phase) || phase === "Lobby" || phase === "None") clearPending();
  }
}

function handleSession(raw) {
  applySession(raw);
}

function handleChampSelect(raw) {
  applyChampSelect(raw);
  if (state.phase === "ChampSelect") refreshPenalty();
}

function handleTimer(raw) {
  syncTimer(raw);
}

async function requestDodge(uri) {
  const options = { method: "POST" };
  if (uri === QUIT_V2_URI) options.body = '["","teambuilder-draft","quitV2",""]';
  const response = await fetch(uri, options);
  if (!response.ok) throw new Error(`LCU ${uri} responded ${response.status}`);
  return response;
}

async function quitOrDodge() {
  if (!active || dodging || !state.queueId || isCustomQueue() || state.showQuitButton) return;
  dodging = true;
  render();
  try {
    let sent = false;
    let lastError = null;
    for (const uri of [QUIT_V2_URI, CUSTOM_CANCEL_URI]) {
      try {
        await requestDodge(uri);
        sent = true;
      } catch (error) {
        lastError = error;
      }
    }
    if (!sent) throw lastError ?? new Error("No dodge endpoint accepted the request");
    await recordDodge();
  } catch (error) {
    console.warn("[Dodge Helper] quit failed:", error);
  } finally {
    dodging = false;
    render();
  }
}

function clearLegacyAnchor() {
  for (const element of document.querySelectorAll(".perf-dodge-anchor")) {
    element.classList.remove("perf-dodge-anchor");
  }
}

async function onEnable(utils) {
  api = utils;
  active = true;
  unmount();
  clearLegacyAnchor();
  removeStyle = utils.addStyle(STYLE_ID, CSS);
  resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(schedulePosition) : null;
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);

  const handlers = {
    [PHASE_URI]: handlePhase,
    [SESSION_URI]: handleSession,
    [CHAMP_SELECT_URI]: handleChampSelect,
    [TIMER_URI]: handleTimer,
  };
  for (const [uri, handler] of Object.entries(handlers)) {
    try {
      const off = utils.subscribe(uri, handler);
      if (off) unsubscribes.push(off);
    } catch {}
  }

  for (const selector of [FOOTER_SELECTOR, SCREEN_SELECTOR]) {
    try {
      const off = utils.watch(selector, () => {
        observeLayout();
        scheduleMount();
      });
      if (off) unwatchers.push(off);
    } catch {}
  }

  await loadAccount();
  const phase = unwrap(await utils.lcu.get(PHASE_URI).catch(() => null));
  if (!active || typeof phase !== "string" || !phase) return;
  await reconcilePending(phase);
  if (active) await handlePhase(phase);
  observeLayout();
}

function onDisable() {
  active = false;
  for (const off of unsubscribes) {
    try {
      off();
    } catch {}
  }
  unsubscribes = [];
  for (const off of unwatchers) {
    try {
      off();
    } catch {}
  }
  unwatchers = [];
  window.removeEventListener("resize", onWindowResize);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("beforeunload", onPageHide);
  resizeObserver?.disconnect();
  resizeObserver = null;
  cancelAnimationFrame(mountFrame);
  mountFrame = 0;
  cancelAnimationFrame(positionFrame);
  positionFrame = 0;
  removeDodgeWatcher();
  unmount();
  if (!state.pageHiding) clearPending();
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
  state.selfDodgeRecorded = false;
  state.lockedLocalPick = false;
  state.localActionSeen = false;
  state.localActionActive = false;
  state.localActionDeadline = 0;
  state.pageHiding = false;
  dodging = false;
  pendingWriteAt = 0;
  penaltyToken = 0;
  accountPromise = null;
  api = null;
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Dodge Helper",
      description:
        "Adds a DODGE/QUIT button to champion select, showing the LP and queue penalty for the next dodge. It also counts accidental dodges from a missed lock-in or closing the client.",
      version,
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