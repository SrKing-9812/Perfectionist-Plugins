const PLUGIN_ID = "auto-accept";
export const version = "1.1.2";

const PHASE_URI = "/lol-gameflow/v1/gameflow-phase";
const READY_CHECK_URI = "/lol-matchmaking/v1/ready-check";
const ACCEPT_URI = "/lol-matchmaking/v1/ready-check/accept";
const OPTION_KEY = "autoAccept";
const DELAY_KEY = "perfectionist:auto-accept:delay";
const MAX_DELAY = 15000;
const RETRY_MS = 700;
const MAX_ATTEMPTS = 4;
const GAME_SELECT_GUARD_MS = 1500;
const STYLE_ID = "perf-auto-accept-style";
const ROOT_ID = "perfAutoAccept";
const TOGGLE_ID = "perfAutoAcceptToggle";
const DELAY_INPUT_ID = "perfAutoAcceptDelay";

const CSS = `#perfAutoAccept {
  display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important;
  align-items: center !important; gap: 8px !important; width: max-content !important;
}
#perfAutoAccept > * { flex: 0 0 auto !important; }
#perfAutoAccept .auto-accept-button { display: inline-flex !important; align-items: center !important; cursor: pointer !important; }
#perfAutoAccept .auto-accept-button-text {
  font-family: var(--font-body, "LoL Body", Arial, sans-serif) !important;
  font-size: 12px !important; letter-spacing: 0.3px !important; color: #a09b8c !important;
}
#perfAutoAccept .auto-accept-button[selected] .auto-accept-button-text { color: #f0e6d2 !important; }
#perfAutoAccept .auto-accept-delay {
  display: flex !important; align-items: center !important; box-sizing: border-box !important;
  width: 82px !important; height: 24px !important; margin-left: 0 !important;
  background: #1e2328 !important; border: 1px solid #785a28 !important; border-radius: 0 !important;
  transition: border-color 0.15s ease, background-color 0.15s ease !important;
}
#perfAutoAccept .auto-accept-delay:hover { border-color: #c89b3c !important; }
#perfAutoAccept .auto-accept-delay:focus-within { border-color: #c89b3c !important; background: #0a1428 !important; }
#perfAutoAccept .auto-accept-delay input {
  width: 100% !important; height: 100% !important; box-sizing: border-box !important;
  background: transparent !important; border: none !important; outline: none !important; box-shadow: none !important;
  color: #f0e6d2 !important; font-family: var(--font-body, "LoL Body", Arial, sans-serif) !important;
  font-size: 12px !important; letter-spacing: 0.3px !important; text-align: center !important; padding: 0 6px !important;
}
#perfAutoAccept .auto-accept-delay input::placeholder { color: #5b5a56 !important; }
#perfAutoAccept .auto-accept-delay input::-webkit-outer-spin-button,
#perfAutoAccept .auto-accept-delay input::-webkit-inner-spin-button { -webkit-appearance: none !important; margin: 0 !important; }`;

let api = null;
let active = false;
let timer = null;
let accepted = false;
let sending = false;
let attempts = 0;
let unsubscribes = [];
let removeStyle = null;
let domObserver = null;
let domTimer = null;
let delayValue = readDelay();

function readDelay() {
  try {
    const raw = Number(localStorage.getItem(DELAY_KEY));
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.min(Math.floor(raw), MAX_DELAY);
  } catch {
    return 0;
  }
}

function writeDelay(value) {
  delayValue = value;
  try {
    localStorage.setItem(DELAY_KEY, String(value));
  } catch {}
}

function enabled() {
  try {
    return api?.getOption?.(PLUGIN_ID, OPTION_KEY) === true;
  } catch {
    return false;
  }
}

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

function canAccept(check) {
  if (!check || typeof check !== "object") return false;
  if (check.state !== "InProgress") return false;
  if (check.playerResponse && check.playerResponse !== "None") return false;
  return true;
}

function clearTimer() {
  clearTimeout(timer);
  timer = null;
}

function resetReadyCheck() {
  clearTimer();
  accepted = false;
  attempts = 0;
}

async function acceptNow() {
  timer = null;
  if (!active || !enabled() || accepted || sending) return;
  sending = true;
  try {
    const check = await api.lcu.get(READY_CHECK_URI).catch(() => null);
    if (!active || !enabled() || accepted || !canAccept(check)) return;
    await api.lcu.send("POST", ACCEPT_URI);
    accepted = true;
    attempts = 0;
  } catch {
    attempts += 1;
    if (active && enabled() && attempts < MAX_ATTEMPTS) timer = setTimeout(acceptNow, RETRY_MS);
  } finally {
    sending = false;
  }
}

function queueAccept() {
  if (!active || !enabled() || accepted || sending || timer) return;
  if (delayValue > 0) timer = setTimeout(acceptNow, delayValue);
  else acceptNow();
}

function onPhase(raw) {
  const phase = unwrap(raw);
  if (typeof phase !== "string") return;
  if (phase === "ReadyCheck") {
    if (!accepted) queueAccept();
    return;
  }
  resetReadyCheck();
}

function onReadyCheck(raw) {
  const check = unwrap(raw);
  if (!check || typeof check !== "object" || !check.state) return;
  if (check.playerResponse === "Accepted") {
    accepted = true;
    clearTimer();
    return;
  }
  if (check.playerResponse === "Declined" || check.state !== "InProgress") {
    resetReadyCheck();
    return;
  }
  queueAccept();
}

async function refresh() {
  const phase = unwrap(await api.lcu.get(PHASE_URI).catch(() => null));
  if (!active) return;
  if (phase === "ReadyCheck") queueAccept();
  else resetReadyCheck();
}

function syncButton() {
  const option = document.getElementById(TOGGLE_ID);
  if (!option) return;
  if (enabled()) option.setAttribute("selected", "true");
  else option.removeAttribute("selected");
  const field = document.getElementById(DELAY_INPUT_ID);
  if (field && document.activeElement !== field) field.value = String(delayValue);
}

function toggle() {
  const next = !enabled();
  try {
    api.setOption(PLUGIN_ID, OPTION_KEY, next);
  } catch {}
  syncButton();
  if (next) queueAccept();
  else resetReadyCheck();
}

function onDelayInput(event) {
  const raw = Number(event.target.value);
  const next = Math.min(Math.max(Number.isFinite(raw) ? Math.floor(raw) : 0, 0), MAX_DELAY);
  writeDelay(next);
  if (event.type === "change") event.target.value = String(next);
  if (active && enabled() && timer) {
    clearTimer();
    queueAccept();
  }
}

function buildButton() {
  const root = document.createElement("div");
  root.id = ROOT_ID;

  const option = document.createElement("lol-uikit-radio-input-option");
  option.id = TOGGLE_ID;
  option.className = "auto-accept-button";
  const label = document.createElement("div");
  label.className = "auto-accept-button-text";
  label.textContent = "Auto Accept";
  option.append(label);
  option.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });

  const input = document.createElement("lol-uikit-flat-input");
  input.className = "auto-accept-delay";
  const field = document.createElement("input");
  field.id = DELAY_INPUT_ID;
  field.type = "number";
  field.min = "0";
  field.max = String(MAX_DELAY);
  field.step = "100";
  field.placeholder = "ms";
  field.title = "Delay before accepting, in milliseconds";
  field.value = String(delayValue);
  field.addEventListener("input", onDelayInput);
  field.addEventListener("change", onDelayInput);
  field.addEventListener("click", (event) => event.stopPropagation());
  input.append(field);

  root.append(option, input);
  return root;
}

let buttonRetry = null;
let gameSelectGuardUntil = 0;
let gameSelectClickHandler = null;

function footer() {
  return (
    document.querySelector(".v2-footer-notifications.ember-view") ??
    document.querySelector(".parties-footer-notifications.ember-view")
  );
}

function gameSelectOpen() {
  if (Date.now() < gameSelectGuardUntil) return true;
  try {
    return !!document.querySelector(".parties-game-select-screen.game-select-show");
  } catch {
    return false;
  }
}

function onGameSelectClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".parties-game-select-screen, .play-button-container, .lobby-back-button")) return;
  gameSelectGuardUntil = Date.now() + GAME_SELECT_GUARD_MS;
  clearTimeout(buttonRetry);
  buttonRetry = setTimeout(ensureButton, GAME_SELECT_GUARD_MS + 100);
}

function ensureButton() {
  if (!active) return;
  clearTimeout(buttonRetry);
  buttonRetry = null;
  if (gameSelectOpen()) {
    buttonRetry = setTimeout(ensureButton, 750);
    return;
  }
  const host = footer();
  if (!host) return;
  if (!document.getElementById(ROOT_ID)) host.append(buildButton());
  syncButton();
}

function scheduleEnsure() {
  if (domTimer) return;
  domTimer = setTimeout(() => {
    domTimer = null;
    ensureButton();
  }, 250);
}

function onEnable(utils) {
  api = utils;
  active = true;
  removeStyle = utils.addStyle(STYLE_ID, CSS);

  domObserver = new MutationObserver(scheduleEnsure);
  domObserver.observe(document.documentElement ?? document, { childList: true, subtree: true });

  gameSelectClickHandler = onGameSelectClick;
  document.addEventListener("pointerdown", gameSelectClickHandler, true);
  document.addEventListener("click", gameSelectClickHandler, true);

  for (const uri of [PHASE_URI, READY_CHECK_URI]) {
    try {
      const off = utils.subscribe(uri, uri === PHASE_URI ? onPhase : onReadyCheck);
      if (off) unsubscribes.push(off);
    } catch {}
  }

  ensureButton();
  refresh();
}

function onDisable() {
  active = false;
  resetReadyCheck();
  for (const off of unsubscribes) {
    try {
      off();
    } catch {}
  }
  unsubscribes = [];
  domObserver?.disconnect();
  domObserver = null;
  clearTimeout(domTimer);
  domTimer = null;
  clearTimeout(buttonRetry);
  buttonRetry = null;
  if (gameSelectClickHandler) {
    document.removeEventListener("pointerdown", gameSelectClickHandler, true);
    document.removeEventListener("click", gameSelectClickHandler, true);
  }
  gameSelectClickHandler = null;
  gameSelectGuardUntil = 0;
  document.getElementById(ROOT_ID)?.remove();
  removeStyle?.();
  removeStyle = null;
  api = null;
}

function onOptionChange(key) {
  if (key !== OPTION_KEY) return;
  syncButton();
  if (enabled()) queueAccept();
  else resetReadyCheck();
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Auto Accept",
      description:
        "Accepts the ready check automatically, with an optional delay. The same switch is shown natively in the lobby footer.",
      version,
      options: [
        {
          key: OPTION_KEY,
          label: "Auto accept matches",
          description:
            "Accepts the ready check for you. The Auto Accept switch in the lobby footer toggles this same setting.",
          default: true,
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
  addEventListener("perfectionist:utils-ready", (event) => registerWith(event.detail ?? window.PerfectionistUtils), {
    once: true,
  });
}