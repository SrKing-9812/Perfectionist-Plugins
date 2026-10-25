export const version = "3.5.0";

const PLUGIN_ID = "ban-blocker";
const STYLE_ID = "perfectionist-ban-blocker-style";
const BTN_CLASS = "bb-toggle";
const SESSION_URI = "/lol-champ-select/v1/session";

const RESEND_AFTER_MS = 150;
const RESCHEDULE_MS = RESEND_AFTER_MS + 20;
const MAX_IN_FLIGHT = 3;
const FAIL_COOLDOWN_MS = 400;
const FAIL_COOLDOWN_MAX_MS = 3000;
const POLL_MS = 500;
const ENSURE_MS = 300;
const DETECT_RETRY_MS = 250;
const GONE_RESET_MS = 1500;

const BAN_GLYPH_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'>" +
  "<g fill='none' stroke='white' stroke-width='2.4'>" +
  "<circle cx='10' cy='10' r='7'/><path d='M5.1 14.9 14.9 5.1'/></g></svg>";
const BAN_GLYPH = `data:image/svg+xml,${encodeURIComponent(BAN_GLYPH_SVG)}`;

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

let api = null;
let removeStyle = null;
let unsubscribe = null;
let pollTimer = null;
let ensureTimer = null;
let refreshTimer = null;
let pumpTimer = null;
let goneTimer = null;
let observer = null;
let pollInFlight = false;
let uiScheduled = false;
let lastDetect = -Infinity;

const enabled = new Map();
const alias = new Map();
const fetchedNames = new Set();
const playerNames = new Map();
const cellToPlayer = new Map();
const buttons = new Map();
const failedUntil = new Map();
const failCount = new Map();
let rows = [];
let uiVisible = false;
let goneAway = true;
let lastSession = null;

let myActionId = null;
let target = undefined;
let sent = 0;
let sentAt = -Infinity;
let inFlight = 0;

function logError(scope, error) {
  console.error(`[Ban Blocker] ${scope}`, error);
}

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

function canonOf(id) {
  return (id != null && alias.get(id)) || id;
}

function isBlocked(id) {
  return enabled.get(canonOf(id)) === true;
}

function isWeakKey(k) {
  return typeof k === "string" && k.startsWith("cell:");
}

function payloadName(p) {
  return norm(`${p?.gameName ?? ""}${p?.tagLine ?? ""}`) || norm(p?.summonerName) || "";
}

function keyOf(p) {
  if (typeof p === "number") return p;
  const strong = p?.summonerId || p?.puuid;
  if (strong) return strong;
  const n = payloadName(p);
  if (n) return `name:${n}`;
  return p?.cellId != null ? `cell:${p.cellId}` : null;
}

function linkPlayer(p, rowName, cellId) {
  const strong = typeof p === "number" ? p : p?.summonerId || p?.puuid;
  const pn = typeof p === "number" ? "" : payloadName(p);
  const rn = norm(rowName);
  const keys = [];
  if (strong) keys.push(strong);
  if (pn) keys.push(`name:${pn}`);
  if (rn && rn !== pn) keys.push(`name:${rn}`);
  const weak = cellId != null ? `cell:${cellId}` : null;

  let root = null;
  for (const k of keys) {
    const r = alias.get(k);
    if (r != null) {
      root = r;
      break;
    }
  }
  if (root == null && keys.length) {
    root = keys[0];
    const prev = weak ? alias.get(weak) : null;
    if (prev != null && isWeakKey(prev) && enabled.has(prev)) {
      if (!enabled.has(root)) enabled.set(root, enabled.get(prev));
      enabled.delete(prev);
    }
  }
  if (root == null) root = (weak && alias.get(weak)) || weak;
  if (root == null) return null;
  for (const k of keys) alias.set(k, root);
  if (weak) alias.set(weak, root);
  return root;
}

function banPending(s) {
  const bans = (s?.actions?.flat?.() ?? []).filter((a) => a.type === "ban");
  if (!bans.length) return true;
  return bans.some((a) => !a.completed);
}

function pump() {
  if (target === undefined || myActionId == null) return;
  if (inFlight >= MAX_IN_FLIGHT) return;
  if (sent === target && performance.now() - sentAt < RESEND_AFTER_MS) return;
  fire(myActionId, target);
}

function fire(id, champ) {
  if (id == null) return;
  sent = champ;
  sentAt = performance.now();
  inFlight++;
  clearTimeout(pumpTimer);
  pumpTimer = setTimeout(pump, RESCHEDULE_MS);
  fetch(`${SESSION_URI}/actions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ championId: champ }),
  })
    .then((r) => {
      if (r.ok) {
        failCount.delete(champ);
        return;
      }
      const n = failCount.get(champ) ?? 0;
      failCount.set(champ, n + 1);
      failedUntil.set(champ, performance.now() + Math.min(FAIL_COOLDOWN_MS * 2 ** n, FAIL_COOLDOWN_MAX_MS));
      if (target === champ) target = undefined;
      if (sent === champ) sent = 0;
    })
    .catch(() => {})
    .finally(() => {
      inFlight--;
      pump();
    });
}

function decide(s) {
  const m = s?.myTeam ?? [];
  const actions = s?.actions?.flat?.() ?? [];
  const me = s?.localPlayerCellId;

  cellToPlayer.clear();
  for (const p of m) {
    const row = rows.find((r) => r.slotId === p.cellId);
    cellToPlayer.set(p.cellId, linkPlayer(p, row?.name, p.cellId));
  }

  let myPick = null;
  for (const a of actions) {
    if (a.type === "pick" && a.actorCellId === me && !a.completed) {
      myPick = a;
      break;
    }
  }
  myActionId = myPick ? myPick.id : null;

  const blockedCells = new Set(m.filter((p) => isBlocked(cellToPlayer.get(p.cellId))).map((p) => p.cellId));

  let threat = 0;
  for (const a of actions) {
    if (a.type !== "ban" || a.completed || a.actorCellId === me) continue;
    if (!blockedCells.has(a.actorCellId)) continue;
    const champ = champOf(a);
    if (!champ || isPicked(m, champ)) continue;
    if ((failedUntil.get(champ) ?? 0) > performance.now()) continue;
    threat = champ;
  }

  if (threat && champOf(myPick) === threat) {
    target = undefined;
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
  if (!goneTimer) {
    goneTimer = setTimeout(() => {
      goneTimer = null;
      enabled.clear();
      alias.clear();
      playerNames.clear();
      fetchedNames.clear();
    }, GONE_RESET_MS);
  }
}

function onSession(raw) {
  try {
    const msg = raw ?? {};
    if (msg.eventType === "Delete") {
      onSessionGone();
      return;
    }
    let s = msg.data ?? msg;
    if (s && !s.myTeam && typeof s.phase === "string") {
      pump();
      return;
    }
    if (!s?.myTeam) return;
    clearTimeout(goneTimer);
    goneTimer = null;
    goneAway = false;
    lastSession = s;

    decide(s);
    pump();
    scheduleUi();
  } catch (err) {
    logError("session handling failed.", err);
  }
}

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
    return found.map((r, i) => ({
      ...r,
      index: i,
      player: rows[i]?.player ?? null,
    }));
  } catch (err) {
    logError("row detection failed.", err);
    return [];
  }
}

function getRows() {
  const connected = rows.length > 0 && rows.every((r) => r.el.isConnected);
  if (connected) return rows;
  const now = performance.now();
  if (rows.length === 0 && now - lastDetect < DETECT_RETRY_MS) return rows;
  lastDetect = now;
  const found = detectRows();
  if (found.length) rows = found;
  else if (!document.querySelector("div.summoner-object")) rows = [];
  return rows;
}

function ensureName(cell) {
  const strong = cell?.summonerId || cell?.puuid;
  if (!strong || fetchedNames.has(strong)) return;
  const get = api?.lcu?.get;
  if (!get) return;
  fetchedNames.add(strong);
  const byPuuid = typeof strong === "string" && strong.length > 20;
  const path = byPuuid ? `/lol-summoner/v2/summoners/puuid/${strong}` : `/lol-summoner/v1/summoners/${strong}`;
  get(path)
    .then((data) => {
      const names = [norm(data?.displayName), norm(data?.gameName)].filter(Boolean);
      if (!names.length) return;
      const root = canonOf(strong);
      playerNames.set(root, [...new Set([...(playerNames.get(root) ?? []), ...names])]);
    })
    .catch(() => fetchedNames.delete(strong));
}

function nameMatches(rowName, id) {
  const rn = norm(rowName);
  if (!rn) return false;
  return (playerNames.get(canonOf(id)) ?? []).some(
    (n) => n === rn || (n.length >= 3 && rn.length >= 3 && (n.startsWith(rn) || rn.startsWith(n))),
  );
}

function bindRowsToTeam(session) {
  const cells = session?.myTeam ?? [];
  const list = getRows();
  if (!list.length || !cells.length) return;
  for (const c of cells) ensureName(c);

  for (const r of list) {
    const cell =
      (r.slotId != null ? cells.find((c) => c.cellId === r.slotId) : null) ??
      cells.find((c) => nameMatches(r.name, keyOf(c)));
    if (cell) {
      r.player = linkPlayer(cell, r.name, cell.cellId);
      cellToPlayer.set(cell.cellId, r.player);
    } else {
      r.player = null;
    }
  }
}

function stopEvent(e) {
  if (!e) return;
  e.stopPropagation();
  e.preventDefault();
}

function playerForBadge(btn) {
  const rowEl = btn.closest(".summoner-object");
  const r = rowEl ? rows.find((x) => x.el === rowEl) : rows[Number(btn.dataset.slot)];
  const byCell = btn.dataset.cell ? cellToPlayer.get(Number(btn.dataset.cell)) ?? null : null;
  return canonOf(byCell ?? r?.player ?? null);
}

function toggle(btn) {
  let id = playerForBadge(btn);
  if (id == null && lastSession) {
    bindRowsToTeam(lastSession);
    id = playerForBadge(btn);
  }
  if (id == null) return;
  const myCell = lastSession?.localPlayerCellId;
  if (myCell != null && btn.dataset.cell && Number(btn.dataset.cell) === myCell) return;
  enabled.set(id, !isBlocked(id));
  renderButtons();
  if (lastSession) {
    decide(lastSession);
    pump();
  }
  queueRefresh();
}

function buildBadge(slot) {
  const btn = document.createElement("div");
  btn.className = `swap-button-component ${BTN_CLASS}`;
  btn.dataset.slot = String(slot);
  btn.dataset.bb = "1";
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

function nativeSwapIn(circle) {
  return !!circle.querySelector(".swap-button-component:not([data-bb])");
}

function ensureButtons() {
  const list = getRows();
  for (const r of list) {
    if (!r.circle || !r.circle.isConnected) continue;
    let btn = buttons.get(r.index);
    if (isSelfRow(r) || !nativeSwapIn(r.circle)) {
      if (btn) {
        btn.remove();
        buttons.delete(r.index);
      }
      continue;
    }
    if (!btn || !btn.isConnected || btn.parentElement !== r.circle) {
      if (btn) btn.remove();
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
    const id = playerForBadge(btn);
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
  if (goneAway && !document.querySelector(".summoner-object")) return;
  pollInFlight = true;
  try {
    onSession(await get(SESSION_URI));
  } catch {
    onSessionGone();
  } finally {
    pollInFlight = false;
  }
}

function onEnable(utils) {
  api = utils;
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
    observer = new MutationObserver(() => scheduleUi());
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
  clearTimeout(pumpTimer);
  clearTimeout(goneTimer);
  pollTimer = ensureTimer = refreshTimer = pumpTimer = goneTimer = null;
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
  alias.clear();
  fetchedNames.clear();
  lastSession = null;
  rows = [];
  lastDetect = -Infinity;
  removeButtons();

  removeStyle?.();
  removeStyle = null;
  api = null;
}

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
