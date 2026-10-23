/*
 * ban-blocker.js
 * Ban Blocker (Perfectionism, Pengu Loader).
 *
 * Every teammate except you gets a small BLOCK button on their champion circle in champ select.
 * While a teammate is blocked, the plugin instantly prepicks the champion they are about to ban
 * on your own pick action: the client won't let a team ban a champion one of its players is
 * hovering, so their ban never lands. The claim hover is held for the rest of the ban phase.
 *
 * Requires perfectionist-utils.js. Toggle it in the "Perfectionism" settings tab.
 */

export const version = "3.4.0";

const PLUGIN_ID = "ban-blocker";
const STYLE_ID = "perfectionist-ban-blocker-style";
const BTN_CLASS = "bb-toggle";
const SESSION_URI = "/lol-champ-select/v1/session";

// ---- engine constants ----

const RESEND_AFTER_MS = 150; // re-assert cadence against their lock attempts
const RESCHEDULE_MS = RESEND_AFTER_MS + 20; // re-arm even if a request never settles
const MAX_IN_FLIGHT = 3;
const FAIL_COOLDOWN_MS = 1200;
const FAIL_COOLDOWN_MAX_MS = 30000;
const POLL_MS = 40; // fast hover detection; pushes keep it working when timers get throttled
const ENSURE_MS = 300; // badge re-attach backstop
const DETECT_RETRY_MS = 2000;

// Ban symbol (ring with a slash) used as the icon mask; vector so it stays crisp when scaled down.
const BAN_GLYPH_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'>" +
  "<g fill='none' stroke='white' stroke-width='2.4'>" +
  "<circle cx='10' cy='10' r='7'/><path d='M5.1 14.9 14.9 5.1'/></g></svg>";
const BAN_GLYPH = `data:image/svg+xml,${encodeURIComponent(BAN_GLYPH_SVG)}`;

/* The shared swap-button classes draw the ring, centre and hover glow; position, glyph and the "on" state are ours. */
const CSS = `
.swap-button-component.${BTN_CLASS} {
  position: absolute !important;
  top: -2px !important;
  right: -2px !important;
  left: auto !important;
  bottom: auto !important;
  z-index: 2 !important;
}
.swap-button-component.${BTN_CLASS} .icon {
  -webkit-mask-image: url("${BAN_GLYPH}") !important;
  mask-image: url("${BAN_GLYPH}") !important;
  -webkit-mask-size: 70% 70% !important;
  mask-size: 70% 70% !important;
}
.swap-button-component.${BTN_CLASS}.on .frame-color {
  background-color: rgb(200, 170, 110) !important;
}
.swap-button-component.${BTN_CLASS}.on .icon {
  background-color: rgb(1, 10, 19) !important;
}
.swap-button-component.${BTN_CLASS}.on .frame-color:hover {
  background-color: rgb(240, 230, 210) !important;
}
.swap-button-component.${BTN_CLASS}.unresolved {
  opacity: 0.35 !important;
  cursor: default !important;
}
`;

// ---- state ----

let api = null;
let removeStyle = null;
let unsubscribe = null;
let pollTimer = null;
let ensureTimer = null;
let detectTimer = null;
let refreshTimer = null;
let pumpTimer = null;
let observer = null;
let pollInFlight = false;
let uiScheduled = false;

const enabled = new Map(); // player id -> blocked
const playerNames = new Map(); // player id -> normalized names (empty array = lookup pending)
const cellToPlayer = new Map(); // champ select cell id -> player id (rebuilt from every session)
const buttons = new Map(); // row slot -> badge element
const failedUntil = new Map(); // championId -> retry time after a rejected hover
const failCount = new Map(); // championId -> consecutive rejections
let rows = [];
let uiVisible = false;
let goneAway = true; // champ select is over (or never started): never attach badges
let lastSession = null;

// ---- engine state ----

let myActionId = null; // my pick action id
let target = undefined; // the champion my pick action must hover (undefined = nothing to do)
let sent = 0; // championId last sent to my pick action
let sentAt = -Infinity;
let inFlight = 0;

function logError(scope, error) {
  console.error(`[Ban Blocker] ${scope}`, error);
}

// ---- session helpers ----

function norm(v) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function champOf(a) {
  return a && a.championId > 0 ? a.championId : 0;
}

function isPicked(members, champ) {
  if (!champ) return false;
  return (members ?? []).some((p) => p.championId === champ && p.completed);
}

function isBlocked(id) {
  return enabled.get(id) === true;
}

function playerId(p) {
  if (typeof p === "number") return p;
  return p?.summonerId ?? p?.puuid ?? null;
}

/** The ban phase is live while any ban action is still open — or before any exists yet. */
function banPending(s) {
  const bans = (s?.actions?.flat?.() ?? []).filter((a) => a.type === "ban");
  if (!bans.length) return true;
  return bans.some((a) => !a.completed);
}

// ---- the claim engine ----

/** Re-asserts my pick hover: immediately on target change, otherwise at most every RESEND_AFTER_MS. */
function pump() {
  if (target === undefined || myActionId == null) return;
  if (inFlight >= MAX_IN_FLIGHT) return;
  if (sent === target && performance.now() - sentAt < RESEND_AFTER_MS) return;
  fire(myActionId, target);
}

function fire(id, champ) {
  const send = api?.lcu?.send;
  if (!send || id == null) return;
  sent = champ;
  sentAt = performance.now();
  inFlight++;
  clearTimeout(pumpTimer);
  pumpTimer = setTimeout(pump, RESCHEDULE_MS);
  send("PATCH", `${SESSION_URI}/actions/${id}`, { championId: champ })
    .then(() => {
      failCount.delete(champ);
    })
    .catch(() => {
      // the server rejected the hover (banned/locked champion): back off exponentially
      const n = failCount.get(champ) ?? 0;
      failCount.set(champ, n + 1);
      failedUntil.set(champ, performance.now() + Math.min(FAIL_COOLDOWN_MS * 2 ** n, FAIL_COOLDOWN_MAX_MS));
      if (target === champ) target = undefined;
      if (sent === champ) sent = 0;
    })
    .finally(() => {
      inFlight--;
      pump();
    });
}

/** Pure session work, no DOM: what a blocked teammate is about to ban becomes my pick hover. Prepicks are ignored. */
function decide(s) {
  const m = s?.myTeam ?? [];
  const actions = s?.actions?.flat?.() ?? [];
  const me = s?.localPlayerCellId;

  cellToPlayer.clear();
  for (const p of m) cellToPlayer.set(p.cellId, playerId(p));

  let myPick = null;
  for (const a of actions) {
    if (a.type === "pick" && a.actorCellId === me && !a.completed) {
      myPick = a;
      break;
    }
  }
  myActionId = myPick ? myPick.id : null;

  const blockedCells = new Set(m.filter((p) => isBlocked(playerId(p))).map((p) => p.cellId));

  // only a ban action is a threat: that hover is what they are about to ban
  let threat = 0;
  for (const a of actions) {
    if (a.type !== "ban" || a.completed || a.actorCellId === me) continue;
    if (!blockedCells.has(a.actorCellId)) continue;
    const champ = champOf(a);
    if (!champ || isPicked(m, champ)) continue;
    if ((failedUntil.get(champ) ?? 0) > performance.now()) continue;
    threat = champ;
  }

  // The claim hover is held, never withdrawn: while my pick hovers the champion the server
  // refuses every ban of it. Withdrawing it, even briefly, opens a window for their next attempt.
  if (threat && champOf(myPick) === threat) {
    target = undefined; // my pick already holds it: unbannable
    sent = threat;
  } else if (threat) {
    target = threat;
  } else {
    target = undefined;
  }
}

function onSessionGone() {
  sent = 0;
  target = undefined;
  clearTimeout(pumpTimer);
  failedUntil.clear();
  failCount.clear();
  cellToPlayer.clear();
  lastSession = null;
  goneAway = true;
  uiVisible = false;
  removeButtons();
}

function onSession(raw) {
  try {
    const msg = raw ?? {};
    if (msg.eventType === "Delete") {
      onSessionGone();
      return;
    }
    let s = msg.data ?? msg;
    // timer pushes carry only the timer: a free pump heartbeat, nothing else
    if (s && !s.myTeam && typeof s.phase === "string") {
      pump();
      return;
    }
    // partial pushes (a session shell before myTeam fills in) must never wipe our state
    if (!s?.myTeam) return;
    goneAway = false;
    lastSession = s;

    // hot path: session scan and claim, synchronously
    decide(s);
    pump();
    scheduleUi();
  } catch (err) {
    logError("session handling failed.", err);
  }
}

// ---- row detection (ally roster) ----

/**
 * The ally roster rows are div.summoner-object elements; their slot-id-N class is the champ
 * select cell id. The BLOCK button lives in the row's .champion-icon-container, next to the
 * swap button, so it rides the row's own animations.
 */
function detectRows() {
  try {
    const nodes = document.querySelectorAll("div.summoner-array.your-party div.summoner-object");
    const list = nodes.length ? nodes : document.querySelectorAll("div.summoner-object.left");
    const found = [];
    for (const e of list) {
      const slot = /slot-id-(\d+)/.exec(String(e.className));
      const nameNode = e.querySelector(".summoner-name");
      found.push({
        el: e,
        slotId: slot ? Number(slot[1]) : null,
        name: (nameNode?.textContent ?? "").trim(),
        circle: e.querySelector(".champion-icon-container"),
      });
    }
    if (!found.length) return [];
    // document order is visual order; no rect reads here, they would force layout
    return found.map((r, i) => ({
      ...r,
      index: i,
      player: rows[i]?.player ?? null, // keep the binding until the session re-binds it
    }));
  } catch (err) {
    logError("row detection failed.", err);
    return [];
  }
}

function getRows() {
  const found = detectRows();
  if (found.length) rows = found;
  else if (!document.querySelector("div.summoner-object")) rows = []; // champ select is gone
  // otherwise the roster is briefly detached mid re-render: keep the last good layout
  clearTimeout(detectTimer);
  detectTimer = setTimeout(getRows, DETECT_RETRY_MS);
  return rows;
}

// ---- player names (so identity follows players through position swaps) ----

function ensureName(cell) {
  const id = playerId(cell);
  if (id == null || playerNames.has(id)) return;
  playerNames.set(id, []);
  const get = api?.lcu?.get;
  if (!get) {
    playerNames.delete(id);
    return;
  }
  const byPuuid = typeof id === "string" && id.length > 20;
  const path = byPuuid ? `/lol-summoner/v2/summoners/puuid/${id}` : `/lol-summoner/v1/summoners/${id}`;
  get(path)
    .then((data) => {
      const names = [norm(data?.displayName), norm(data?.gameName)].filter(Boolean);
      if (names.length) playerNames.set(id, names);
      else playerNames.delete(id);
    })
    .catch(() => playerNames.delete(id));
}

function nameMatches(rowName, id) {
  const rn = norm(rowName);
  if (!rn) return false;
  return (playerNames.get(id) ?? []).some(
    (n) => n === rn || (n.length >= 3 && rn.length >= 3 && (n.startsWith(rn) || rn.startsWith(n))),
  );
}

/** Maps roster rows onto myTeam cells via the slot-id-N class; name matching is the fallback without slot ids. */
function bindRowsToTeam(session) {
  const cells = session?.myTeam ?? [];
  const list = getRows();
  if (!list.length || !cells.length) return;
  for (const c of cells) ensureName(c);

  for (const r of list) {
    const cell =
      (r.slotId != null ? cells.find((c) => c.cellId === r.slotId) : null) ??
      cells.find((c) => nameMatches(r.name, playerId(c)));
    r.player = cell ? playerId(cell) : null;
  }
}

// ---- badges ----

function stopEvent(e) {
  if (!e) return;
  e.stopPropagation();
  e.preventDefault();
}

function toggle(btn) {
  // the badge carries its champ select cell id, which maps straight to the player
  let id = btn.dataset.cell ? (cellToPlayer.get(Number(btn.dataset.cell)) ?? null) : null;
  if (id == null) {
    // fall back to the row binding (clients without slot ids)
    if (lastSession) bindRowsToTeam(lastSession);
    const list = getRows();
    const rowEl = btn.closest(".summoner-object");
    const r = list.find((x) => x.el === rowEl) ?? list[Number(btn.dataset.slot)];
    id = r?.player ?? null;
  }
  if (id == null) return;
  // never block myself
  const myCell = lastSession?.localPlayerCellId;
  if (myCell != null && btn.dataset.cell && Number(btn.dataset.cell) === myCell) return;
  enabled.set(id, !isBlocked(id));
  renderButtons();
  // arm (or release) the claim immediately, without waiting for the next push
  if (lastSession) {
    decide(lastSession);
    pump();
  }
  queueRefresh();
}

/** A copy of champ select's own swap button, so the client's stylesheet draws it exactly like the original. */
function buildBadge(slot) {
  const btn = document.createElement("div");
  btn.className = `swap-button-component ${BTN_CLASS}`;
  btn.dataset.slot = String(slot);
  btn.dataset.bb = "1"; // ownership marker: teardown only ever sweeps our own clones
  btn.innerHTML =
    '<div class="swap-button--btn uikit-framed-icon">' +
    '<div class="outer-mask interactive">' +
    '<div class="frame-color" style="padding: 2px;">' +
    '<div class="icon"></div>' +
    "</div></div></div>";
  for (const type of ["mouseenter", "mouseleave", "mousedown", "mouseup", "click"]) {
    btn.addEventListener(type, (e) => {
      stopEvent(e);
      if (type === "click") toggle(btn);
    });
  }
  return btn;
}

function isSelfRow(r) {
  if (r.el.classList.contains("is-self")) return true;
  return lastSession?.localPlayerCellId != null && r.slotId === lastSession.localPlayerCellId;
}

/** champ select's own swap button on this circle (ours carries data-bb and is not one) */
function nativeSwapIn(circle) {
  return !!circle.querySelector(".swap-button-component:not([data-bb])");
}

function ensureButtons() {
  const list = getRows();
  for (const r of list) {
    if (!r.circle || !r.circle.isConnected) continue;
    let btn = buttons.get(r.index);
    // The badge rides the client's own swap button and never sits on my own row.
    if (isSelfRow(r) || !nativeSwapIn(r.circle)) {
      if (btn) {
        btn.remove();
        buttons.delete(r.index);
      }
      continue;
    }
    if (!btn || !btn.isConnected || btn.parentElement !== r.circle) {
      if (btn) btn.remove();
      // a stale clone may survive inside the circle after an Ember re-render
      for (const orphan of r.circle.querySelectorAll(`:scope > .${BTN_CLASS}`)) orphan.remove();
      btn = buildBadge(r.index);
      r.circle.appendChild(btn);
      buttons.set(r.index, btn);
    }
    btn.dataset.slot = String(r.index);
    btn.dataset.cell = r.slotId == null ? "" : String(r.slotId);
  }
  for (const [slot, btn] of [...buttons]) {
    if (!list[slot] || !btn.isConnected) {
      btn.remove();
      buttons.delete(slot);
    }
  }
}

function renderButtons() {
  const hasSession = !!lastSession?.myTeam;
  for (const [, btn] of buttons) {
    const id = btn.dataset.cell ? (cellToPlayer.get(Number(btn.dataset.cell)) ?? null) : null;
    const on = id != null && isBlocked(id);
    btn.classList.toggle("on", on);
    btn.classList.toggle("unresolved", id == null && hasSession);
    const title = on ? "Blocked — click to allow their bans" : "Block this teammate's bans";
    if (btn.title !== title) btn.title = title;
  }
}

function removeButtons() {
  for (const btn of buttons.values()) btn.remove();
  buttons.clear();
  for (const el of document.querySelectorAll(`.${BTN_CLASS}[data-bb]`)) el.remove();
}

function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(poll, 80);
}

/** UI work only, off the claim hot path. Runs as a microtask so badges land in the same paint as the rows. */
function scheduleUi() {
  if (uiScheduled) return;
  uiScheduled = true;
  queueMicrotask(() => {
    uiScheduled = false;
    try {
      update();
    } catch (err) {
      logError("ui update failed.", err);
    }
  });
}

function update() {
  if (goneAway) return;
  const s = lastSession;
  if (s?.myTeam) bindRowsToTeam(s);
  // badges follow the client's own swap button on each circle; the session decides their on/off state
  const visible = !s?.myTeam ? true : banPending(s);
  if (visible) {
    uiVisible = true;
    ensureButtons();
    renderButtons();
  } else if (uiVisible) {
    uiVisible = false;
    removeButtons();
  }
}

async function poll() {
  const get = api?.lcu?.get;
  if (!get || pollInFlight) return;
  // outside champ select there is no roster and nothing to poll for
  if (goneAway && !document.querySelector(".summoner-object")) return;
  pollInFlight = true;
  try {
    onSession(await get(SESSION_URI));
  } catch {
    // outside champion select the session endpoint errors: hide immediately
    onSessionGone();
  } finally {
    pollInFlight = false;
  }
}

// ---- lifecycle ----

function onEnable(utils) {
  api = utils;
  // one failing piece must not take the rest down
  try {
    removeStyle = api.addStyle(STYLE_ID, CSS);
  } catch (err) {
    logError("style setup failed.", err);
  }

  pollTimer = setInterval(poll, POLL_MS);
  ensureTimer = setInterval(() => {
    if (uiVisible) update();
  }, ENSURE_MS);

  try {
    // the observer callback is a microtask, so badges land in the same paint as the rows
    observer = new MutationObserver(() => {
      try {
        update();
      } catch (err) {
        logError("ui update failed.", err);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (err) {
    logError("observer setup failed.", err);
  }

  const onPush = (msg) => onSession(msg);
  let offs = [];
  for (const uri of [SESSION_URI, `${SESSION_URI}/timer`]) {
    try {
      const off = api.subscribe(uri, onPush);
      if (off) offs.push(off);
    } catch (err) {
      logError(`subscribe failed for ${uri}.`, err);
    }
  }
  unsubscribe = () => {
    for (const off of offs) {
      try {
        off();
      } catch (err) {
        logError("unsubscribe failed.", err);
      }
    }
  };

  poll();
}

function onDisable() {
  unsubscribe?.();
  unsubscribe = null;
  clearInterval(pollTimer);
  clearInterval(ensureTimer);
  clearTimeout(refreshTimer);
  clearTimeout(detectTimer);
  clearTimeout(pumpTimer);
  pollTimer = ensureTimer = refreshTimer = detectTimer = pumpTimer = null;
  observer?.disconnect();
  observer = null;

  uiVisible = false;
  goneAway = true;
  target = undefined;
  sent = 0;
  failedUntil.clear();
  failCount.clear();
  cellToPlayer.clear();
  enabled.clear();
  playerNames.clear();
  lastSession = null;
  rows = [];
  removeButtons();

  removeStyle?.();
  removeStyle = null;
  api = null;
}

/** Pengu entry point. Registers with the Perfectionism core. */
export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Ban Blocker",
      description: "During bans, blocking a teammate instantly claims the champion they hover to ban.",
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
  addEventListener(
    "perfectionist:utils-ready",
    (e) => registerWith(e.detail ?? window.PerfectionistUtils),
    { once: true },
  );
}
