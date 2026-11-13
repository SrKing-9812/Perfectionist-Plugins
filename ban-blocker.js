export const version = "4.0.0";

const PLUGIN_ID = "ban-blocker";
const STYLE_ID = "perfectionist-ban-blocker-style";
const BADGE_CLASS = "bb-toggle";
const SESSION_URI = "/lol-champ-select/v1/session";
const ACTIONS_URI = "/lol-champ-select/v1/session/actions";
const PICKABLE_URI = "/lol-champ-select/v1/pickable-champion-ids";
const CHAMPION_SUMMARY_URI = "/lol-game-data/assets/v1/champion-summary.json";
const ROWS_SELECTOR = ".summoner-array.your-party";

// A PATCH that the session has not reflected yet is re-sent after this long (the server can drop an intent
// that lands while the session is mid-update). Kept short: a teammate can lock a ban in a fraction of a second.
const CONFIRM_MS = 220;
const MAX_SENDS = 4;
// Safety net only: the session WebSocket push is the fast path. Polling runs only while a block is active.
const POLL_MS = 1000;

const BAN_GLYPH_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'>" +
  "<g fill='none' stroke='white' stroke-width='2.4'>" +
  "<circle cx='10' cy='10' r='7'/><path d='M5.1 14.9 14.9 5.1'/></g></svg>";
const BAN_GLYPH = `data:image/svg+xml,${encodeURIComponent(BAN_GLYPH_SVG)}`;

const CSS = `
.swap-button-component.${BADGE_CLASS} {
  position: absolute !important; top: -2px !important; right: -2px !important; left: auto !important; bottom: auto !important;
  z-index: 50 !important; pointer-events: auto !important;
}
.swap-button-component.${BADGE_CLASS} .icon {
  -webkit-mask-image: url("${BAN_GLYPH}") !important; mask-image: url("${BAN_GLYPH}") !important;
  -webkit-mask-size: 70% 70% !important; mask-size: 70% 70% !important;
}
.swap-button-component.${BADGE_CLASS}.on .frame-color { background-color: rgb(200, 170, 110) !important; }
.swap-button-component.${BADGE_CLASS}.on .icon { background-color: rgb(1, 10, 19) !important; }
.swap-button-component.${BADGE_CLASS}.on .frame-color:hover { background-color: rgb(240, 230, 210) !important; }
.swap-button-component.${BADGE_CLASS}.on.warn .frame-color { background-color: rgb(190, 30, 55) !important; }
`;

let api = null;
let active = false;
let removeStyle = null;
let unsubscribe = null;
let unwatchRows = null;
let removeFrameHook = null;
let pollTimer = null;
let confirmTimer = null;

let session = null;
let sessionKey = null;
let pickable = null;
let pickableLoading = false;
let championNames = null;

// Blocks follow the player, not the seat: swapping positions or pick order moves players between cells.
const blocked = new Set();
const cellPlayer = new Map();
const hoverSince = new Map();
const unprotectable = new Map();
const refusedUntil = new Map();
const REFUSED_MS = 1500;
const badges = new Map();

// What we last asked the server for, and what the user had declared before we took over.
let sent = { actionId: null, championId: 0, at: 0, count: 0 };
let userIntent = null;
let ownsIntent = false;
let restoreDone = false;

function logError(scope, error) {
  console.error(`[Ban Blocker] ${scope}`, error);
}

function flatActions(s) {
  const out = [];
  for (const group of Array.isArray(s?.actions) ? s.actions : []) {
    if (Array.isArray(group)) out.push(...group);
    else if (group) out.push(group);
  }
  return out;
}

function myPickAction(s, actions) {
  const me = s?.localPlayerCellId;
  return actions.find((a) => a.type === "pick" && a.actorCellId === me && !a.completed) ?? null;
}

function banPhaseOpen(s, actions) {
  return actions.some((a) => a.type === "ban" && !a.completed);
}

function playerKey(p) {
  return p?.puuid || p?.obfuscatedPuuid || (p?.summonerId ? `s:${p.summonerId}` : "") || p?.obfuscatedSummonerId || `cell:${p?.cellId}`;
}

function isBlockedCell(cell) {
  const key = cellPlayer.get(cell);
  return key !== undefined && blocked.has(key);
}

function takenByAlly(s, championId) {
  return (s?.myTeam ?? []).some((p) => p.championId === championId && p.cellId !== s.localPlayerCellId);
}

/* ---------------------------------------------------------------------------------------------
 * Decision engine: runs synchronously on every session push and fires the PATCH in the same tick.
 * ------------------------------------------------------------------------------------------- */

function pickThreat(s, actions) {
  const me = s.localPlayerCellId;
  const now = performance.now();
  let best = null;
  for (const a of actions) {
    if (a.type !== "ban" || a.completed || a.actorCellId === me || !isBlockedCell(a.actorCellId)) continue;
    const champ = a.championId > 0 ? a.championId : 0;
    const prev = hoverSince.get(a.actorCellId);
    if (!prev || prev.championId !== champ) hoverSince.set(a.actorCellId, { championId: champ, at: now });
    if (!champ || takenByAlly(s, champ)) continue;
    if ((pickable && !pickable.has(champ)) || (refusedUntil.get(champ) ?? 0) > now) {
      unprotectable.set(a.actorCellId, champ);
      continue;
    }
    unprotectable.delete(a.actorCellId);
    const since = hoverSince.get(a.actorCellId).at;
    const candidate = { championId: champ, cell: a.actorCellId, inProgress: a.isInProgress === true, since };
    if (!best) {
      best = candidate;
      continue;
    }
    // Prefer bans that are live right now, then keep the champion we already hold (no flip-flopping),
    // then the most recent hover (the one most likely to be locked next).
    const score = (c) => (c.inProgress ? 4 : 0) + (c.championId === sent.championId ? 2 : 0);
    const diff = score(candidate) - score(best);
    if (diff > 0 || (diff === 0 && candidate.since > best.since)) best = candidate;
  }
  return best;
}

function patch(actionId, championId) {
  sent = {
    actionId,
    championId,
    at: performance.now(),
    count: sent.actionId === actionId && sent.championId === championId ? sent.count + 1 : 1,
  };
  fetch(`${ACTIONS_URI}/${actionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ championId }),
  })
    .then((response) => {
      if (response.ok || !active) return;
      // The server refused this champion for us (not owned, disabled, mid-update...). Back off briefly and
      // let the next evaluation protect another hovered champion if there is one.
      refusedUntil.set(championId, performance.now() + REFUSED_MS);
      if (session) evaluate(session);
      renderBadges();
    })
    .catch(() => {});
  scheduleConfirm();
}

function scheduleConfirm() {
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => {
    confirmTimer = null;
    if (session) evaluate(session);
  }, CONFIRM_MS);
}

function evaluate(s) {
  const actions = flatActions(s);
  const myPick = myPickAction(s, actions);
  if (!myPick || myPick.isInProgress) return;
  const current = myPick.championId > 0 ? myPick.championId : 0;

  const threat = blocked.size ? pickThreat(s, actions) : null;
  if (threat) {
    if (!ownsIntent) {
      ownsIntent = true;
      restoreDone = false;
      userIntent = current;
    }
    if (current === threat.championId) return;
    const resend = sent.actionId === myPick.id && sent.championId === threat.championId;
    if (resend && (sent.count >= MAX_SENDS || performance.now() - sent.at < CONFIRM_MS)) return;
    patch(myPick.id, threat.championId);
    return;
  }

  // Nothing to protect any more. Once the blocked teammates are done banning, give the user back the pick
  // they had declared before we stepped in.
  if (!ownsIntent || restoreDone) return;
  const blockedBansLeft = actions.some((a) => a.type === "ban" && !a.completed && isBlockedCell(a.actorCellId));
  if (blockedBansLeft && blocked.size) return;
  restoreDone = true;
  ownsIntent = false;
  if (current === sent.championId && userIntent !== null && userIntent !== current) patch(myPick.id, userIntent);
}

/* ---------------------------------------------------------------------------------------------
 * Session handling
 * ------------------------------------------------------------------------------------------- */

// Identifies one champ select. It must not change when players swap seats, or the blocks would be lost.
function keyOf(s) {
  if (Number(s?.gameId) > 0) return `game:${s.gameId}`;
  return `team:${(s?.myTeam ?? []).map(playerKey).sort().join(",")}`;
}

function resetSession() {
  blocked.clear();
  cellPlayer.clear();
  hoverSince.clear();
  unprotectable.clear();
  refusedUntil.clear();
  sent = { actionId: null, championId: 0, at: 0, count: 0 };
  userIntent = null;
  ownsIntent = false;
  restoreDone = false;
  pickable = null;
  session = null;
  sessionKey = null;
  clearTimeout(confirmTimer);
  confirmTimer = null;
  syncPolling();
  removeBadges();
}

function loadPickable() {
  if (pickableLoading || !api) return;
  pickableLoading = true;
  api.lcu
    .get(PICKABLE_URI)
    .then((ids) => {
      if (active && Array.isArray(ids) && ids.length) pickable = new Set(ids);
    })
    .catch(() => {})
    .finally(() => {
      pickableLoading = false;
    });
}

function applySession(s) {
  if (!s || !Array.isArray(s.myTeam)) return;
  const key = keyOf(s);
  if (key !== sessionKey) {
    resetSession();
    sessionKey = key;
  }
  session = s;
  cellPlayer.clear();
  for (const member of s.myTeam) cellPlayer.set(member.cellId, playerKey(member));
  if (!pickable) loadPickable();
  try {
    evaluate(s);
  } catch (error) {
    logError("decision failed.", error);
  }
  syncPolling();
  renderBadges();
}

function onSessionPush(message) {
  if (!active) return;
  if (message?.eventType === "Delete") {
    resetSession();
    return;
  }
  applySession(message?.data ?? message);
}

function syncPolling() {
  const wanted = active && session && blocked.size > 0 && banPhaseOpen(session, flatActions(session));
  if (wanted && !pollTimer) {
    pollTimer = setInterval(() => {
      api?.lcu
        .get(SESSION_URI)
        .then((s) => applySession(s))
        .catch(() => {});
    }, POLL_MS);
  } else if (!wanted && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ---------------------------------------------------------------------------------------------
 * UI: one BLOCK badge on every teammate's champion icon while bans are still open.
 * ------------------------------------------------------------------------------------------- */

// Ally rows render in myTeam order (placeholder rows are "removed"). The local player's row (.is-self)
// confirms the alignment; slot ids are the fallback for layouts where the order differs.
function allyRows(s) {
  const party = document.querySelector(ROWS_SELECTOR);
  if (!party) return [];
  const rows = [...party.querySelectorAll(".summoner-object")].filter(
    (row) => !row.closest(".summoner-wrapper")?.classList.contains("removed"),
  );
  const team = s?.myTeam ?? [];
  if (!rows.length || !team.length) return [];
  const selfRow = rows.findIndex((row) => row.classList.contains("is-self"));
  const selfCell = team.findIndex((p) => p.cellId === s.localPlayerCellId);
  if (rows.length === team.length && (selfRow < 0 || selfRow === selfCell)) {
    return rows.map((row, index) => ({ row, cell: team[index].cellId }));
  }
  const cells = new Set(team.map((p) => p.cellId));
  const offset = team.length && Math.min(...team.map((p) => p.cellId)) >= 5 ? 5 : 0;
  return rows
    .map((row) => {
      const slot = /slot-id-(\d+)/.exec(row.className);
      if (!slot) return null;
      const id = Number(slot[1]);
      const cell = cells.has(id) ? id : cells.has(id + offset) ? id + offset : null;
      return cell === null ? null : { row, cell };
    })
    .filter(Boolean);
}

function championName(id) {
  if (!championNames && api) {
    championNames = new Map();
    api.lcu
      .get(CHAMPION_SUMMARY_URI, { ttl: 60 * 60 * 1000 })
      .then((list) => {
        for (const c of Array.isArray(list) ? list : []) championNames.set(c.id, c.name);
        renderBadges();
      })
      .catch(() => {
        championNames = null;
      });
  }
  return championNames?.get(id) ?? "that champion";
}

function badgeTitle(cell) {
  if (!isBlockedCell(cell)) return "Block this teammate's bans";
  const champ = unprotectable.get(cell);
  if (champ) return `Blocked, but ${championName(champ)} can't be declared as your pick (not available to you), so this ban can't be stopped.`;
  return "Blocked: the champion they hover to ban is declared as your pick. Click to allow their bans.";
}

function buildBadge(cell) {
  const badge = document.createElement("div");
  badge.className = `swap-button-component ${BADGE_CLASS}`;
  badge.dataset.cell = String(cell);
  badge.innerHTML =
    '<div class="swap-button--btn uikit-framed-icon"><div class="outer-mask interactive">' +
    '<div class="frame-color" style="padding: 2px;"><div class="icon"></div></div></div></div>';
  const stop = (event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  for (const type of ["mouseenter", "mouseleave", "mousedown", "mouseup", "pointerdown", "pointerup"]) badge.addEventListener(type, stop);
  badge.addEventListener("click", (event) => {
    stop(event);
    toggle(Number(badge.dataset.cell));
  });
  return badge;
}

function toggle(cell) {
  if (!session || cell === session.localPlayerCellId) return;
  const key = cellPlayer.get(cell);
  if (key === undefined) return;
  if (blocked.has(key)) {
    blocked.delete(key);
    unprotectable.delete(cell);
  } else {
    blocked.add(key);
  }
  evaluate(session);
  syncPolling();
  renderBadges();
}

function removeBadges() {
  for (const badge of badges.values()) badge.remove();
  badges.clear();
  for (const stray of document.querySelectorAll(`.${BADGE_CLASS}`)) stray.remove();
}

function renderBadges() {
  if (!active) return;
  const s = session;
  if (!s || !banPhaseOpen(s, flatActions(s))) {
    if (badges.size) removeBadges();
    return;
  }
  const seen = new Set();
  for (const { row, cell } of allyRows(s)) {
    if (cell === s.localPlayerCellId) continue;
    const host = row.querySelector(".champion-icon-container");
    if (!host) continue;
    let badge = badges.get(cell);
    if (!badge || badge.parentElement !== host) {
      badge?.remove();
      badge = buildBadge(cell);
      host.appendChild(badge);
      badges.set(cell, badge);
    }
    seen.add(cell);
    const on = isBlockedCell(cell);
    badge.classList.toggle("on", on);
    badge.classList.toggle("warn", on && unprotectable.has(cell));
    const title = badgeTitle(cell);
    if (badge.title !== title) badge.title = title;
  }
  for (const [cell, badge] of badges) {
    if (!seen.has(cell)) {
      badge.remove();
      badges.delete(cell);
    }
  }
}

function onFrame() {
  // Ember re-renders rows freely; re-attach badges only when one went missing.
  if (!session) return;
  for (const badge of badges.values()) {
    if (!badge.isConnected) {
      renderBadges();
      return;
    }
  }
  if (badges.size === 0 && document.querySelector(ROWS_SELECTOR)) renderBadges();
}

/* ------------------------------------------------------------------------------------------- */

function onEnable(utils) {
  api = utils;
  active = true;
  removeStyle = utils.addStyle(STYLE_ID, CSS);
  unsubscribe = utils.subscribe(SESSION_URI, onSessionPush);
  unwatchRows = utils.watch(ROWS_SELECTOR, () => {
    if (!session) {
      utils.lcu
        .get(SESSION_URI)
        .then((s) => applySession(s))
        .catch(() => {});
    } else renderBadges();
  });
  removeFrameHook = utils.onFrame ? utils.onFrame(onFrame) : null;
  utils.lcu
    .get(SESSION_URI)
    .then((s) => applySession(s))
    .catch(() => {});
}

function onDisable() {
  active = false;
  unsubscribe?.();
  unwatchRows?.();
  removeFrameHook?.();
  unsubscribe = unwatchRows = removeFrameHook = null;
  resetSession();
  clearInterval(pollTimer);
  pollTimer = null;
  removeStyle?.();
  removeStyle = null;
  championNames = null;
  api = null;
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Ban Blocker",
      description: "During bans, blocking a teammate instantly claims the champion they hover to ban.",
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
