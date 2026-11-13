const PLUGIN_ID = "better-client";
const version = "2.0.0";

const PHASE_URI = "/lol-gameflow/v1/gameflow-phase";

// The client reports UI events, metrics and traces through these local endpoints and through Datadog RUM.
// None of it is needed for the client to work; blocked calls get an empty 200 so callers carry on.
const TELEMETRY_LOCAL = /^\/(?:telemetry\/|lol-telemetry\/|tracing\/v1\/|riotclient\/addorupdatemetric|lol-rms\/v1\/telemetry|error-monitor\/v1\/ux-logs)/i;
const TELEMETRY_HOST = /(^|\.)(?:datadoghq\.(?:com|eu)|datadog-?intake\.\w+|sentry\.io|bugsnag\.com|browser-intake[\w.-]*|google-analytics\.com|googletagmanager\.com|doubleclick\.net|segment\.io|mixpanel\.com|amplitude\.com)$/i;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DECISION_LIMIT = 512;
const SWEEP_MS = 60 * 1000;

const BACKGROUND_CLASS = "perf-bc-background";
const LITE_CLASS = "perf-bc-lite";
const STYLE_ID = "perfectionist-better-client";
const CSS = `
html.${BACKGROUND_CLASS} *, html.${BACKGROUND_CLASS} *::before, html.${BACKGROUND_CLASS} *::after {
  animation-play-state: paused !important;
}
html.${LITE_CLASS} *, html.${LITE_CLASS} *::before, html.${LITE_CLASS} *::after {
  animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
  transition-duration: 0s !important; transition-delay: 0s !important;
  backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
}`;

const OPTIONS = [
  {
    key: "backgroundMode",
    label: "Pause the client while you play",
    description:
      "While a game is running and the client is not focused, pauses the client's videos and animations. They resume the moment you open the client.",
    default: true,
  },
  {
    key: "performanceMode",
    label: "Performance mode",
    description:
      "For weaker PCs: stops looping background videos and animated effects, skips UI animations and turns off background blur.",
    default: false,
  },
];

let api = null;
let active = false;
let phase = "None";
let backgroundMode = false;
let liteMode = false;
let unsubscribe = null;
let restores = [];

function option(key) {
  return api?.getOption?.(PLUGIN_ID, key) === true;
}

/* Telemetry */

const decisions = new Map();

function isBlocked(raw) {
  const text = typeof raw === "string" ? raw : raw?.url ?? raw?.href ?? String(raw ?? "");
  const known = decisions.get(text);
  if (known !== undefined) return known;
  let verdict = false;
  if (text.startsWith("/") && !text.startsWith("//")) {
    verdict = TELEMETRY_LOCAL.test(text);
  } else {
    try {
      const url = new URL(text, location.href);
      if (url.protocol === "http:" || url.protocol === "https:") {
        verdict = LOCAL_HOSTS.has(url.hostname) ? TELEMETRY_LOCAL.test(url.pathname) : TELEMETRY_HOST.test(url.hostname);
      }
    } catch {}
  }
  if (decisions.size >= DECISION_LIMIT) decisions.clear();
  decisions.set(text, verdict);
  return verdict;
}

function installFetch() {
  const native = window.fetch;
  const patched = function (input, init) {
    if (active && isBlocked(typeof input === "string" ? input : input?.url ?? "")) {
      return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return native.call(this, input, init);
  };
  window.fetch = patched;
  return () => {
    if (window.fetch === patched) window.fetch = native;
  };
}

function finishBlockedXhr(xhr) {
  try {
    Object.defineProperty(xhr, "readyState", { configurable: true, get: () => 4 });
    Object.defineProperty(xhr, "status", { configurable: true, get: () => 200 });
    Object.defineProperty(xhr, "statusText", { configurable: true, get: () => "OK" });
    Object.defineProperty(xhr, "responseText", { configurable: true, get: () => "{}" });
    Object.defineProperty(xhr, "response", { configurable: true, get: () => (xhr.responseType === "json" ? {} : "{}") });
    Object.defineProperty(xhr, "getAllResponseHeaders", { configurable: true, value: () => "content-type: application/json\r\n" });
    Object.defineProperty(xhr, "getResponseHeader", { configurable: true, value: (name) => (/content-type/i.test(name) ? "application/json" : null) });
  } catch {}
  setTimeout(() => {
    for (const type of ["readystatechange", "load", "loadend"]) {
      try {
        xhr.dispatchEvent(new Event(type));
      } catch {}
    }
  }, 0);
}

function installXhr() {
  const proto = XMLHttpRequest.prototype;
  const nativeOpen = proto.open;
  const nativeSend = proto.send;
  const open = function (method, url, ...rest) {
    this.__perfBcUrl = url;
    return nativeOpen.call(this, method, url, ...rest);
  };
  const send = function (body) {
    if (active && this.__perfBcUrl !== undefined && isBlocked(String(this.__perfBcUrl))) {
      finishBlockedXhr(this);
      return undefined;
    }
    return nativeSend.call(this, body);
  };
  proto.open = open;
  proto.send = send;
  return () => {
    if (proto.open === open) proto.open = nativeOpen;
    if (proto.send === send) proto.send = nativeSend;
  };
}

function installBeacon() {
  const nav = window.navigator;
  if (typeof nav?.sendBeacon !== "function") return () => {};
  const native = nav.sendBeacon;
  const patched = function (url, data) {
    if (active && isBlocked(String(url))) return true;
    return native.call(this, url, data);
  };
  nav.sendBeacon = patched;
  return () => {
    if (nav.sendBeacon === patched) nav.sendBeacon = native;
  };
}

// Riot samples some sessions into Datadog RUM, which then records every interaction, resource and long task.
function quietDatadog() {
  try {
    window.DD_RUM?.setTrackingConsent?.("not-granted");
  } catch {}
  return () => {
    try {
      window.DD_RUM?.setTrackingConsent?.("granted");
    } catch {}
  };
}

/* Media governor
 *
 * The client keeps looping videos and lottie animations running while they are not rendered at all (the
 * home screen's activity tabs alone keep ~20 videos decoding forever). Media is held while nobody can see it
 * (not rendered, or the client is in the background during a game, or it is a decorative loop in performance
 * mode) and resumed as soon as that stops being true. Only media held here is ever resumed. */

const held = new WeakSet();
const tracked = new Set();
let observer = null;

function inBackground() {
  return backgroundMode && phase === "InProgress" && !document.hasFocus();
}

function lottieOf(element) {
  return element.tagName === "LOL-UIKIT-LOTTIE" ? element.animation ?? null : null;
}

function isLoop(element) {
  return element.tagName === "VIDEO" ? element.loop : lottieOf(element)?.loop === true;
}

function isPlaying(element) {
  if (element.tagName === "VIDEO") return !element.paused;
  const animation = lottieOf(element);
  return Boolean(animation) && animation.isPaused === false;
}

function rendered(element) {
  return element.isConnected && element.getClientRects().length > 0;
}

function shouldHold(element, visible = rendered(element)) {
  return !visible || inBackground() || (liteMode && isLoop(element));
}

function hold(element) {
  if (!isPlaying(element)) return;
  try {
    if (element.tagName === "VIDEO") element.pause();
    else lottieOf(element)?.pause();
    held.add(element);
  } catch {}
}

function release(element) {
  if (!held.has(element)) return;
  held.delete(element);
  if (!element.isConnected) return;
  try {
    if (element.tagName === "VIDEO") {
      if (element.loop || !element.ended) element.play()?.catch?.(() => {});
    } else {
      lottieOf(element)?.play();
    }
  } catch {}
}

function settle(element, visible) {
  if (shouldHold(element, visible)) hold(element);
  else release(element);
}

function onMediaPlay(event) {
  const element = event.target;
  if (shouldHold(element)) queueMicrotask(() => shouldHold(element) && hold(element));
}

function track(element) {
  if (tracked.has(element)) return;
  tracked.add(element);
  if (element.tagName === "VIDEO") element.addEventListener("play", onMediaPlay);
  observer?.observe(element);
}

function untrack(element) {
  observer?.unobserve(element);
  element.removeEventListener("play", onMediaPlay);
  tracked.delete(element);
}

function settleAll() {
  for (const element of tracked) {
    if (element.isConnected) settle(element);
  }
}

function installMediaGovernor() {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) settle(entry.target, entry.isIntersecting);
    },
    { rootMargin: "64px" },
  );
  const unwatch = api.watch("video, lol-uikit-lottie", track);
  // Lottie animations start after their JSON loads, which the observer does not see; re-check periodically.
  const sweeper = setInterval(() => {
    for (const element of tracked) {
      if (!element.isConnected) untrack(element);
      else if (element.tagName !== "VIDEO" && isPlaying(element) && shouldHold(element)) hold(element);
    }
  }, SWEEP_MS / 4);
  return () => {
    clearInterval(sweeper);
    unwatch();
    observer?.disconnect();
    observer = null;
    for (const element of [...tracked]) {
      untrack(element);
      if (rendered(element)) release(element);
    }
  };
}

/* Background and performance modes */

function applyModes() {
  const root = document.documentElement;
  root.classList.toggle(BACKGROUND_CLASS, active && inBackground());
  root.classList.toggle(LITE_CLASS, active && liteMode);
  settleAll();
}

function installModes() {
  const removeStyle = api.addStyle(STYLE_ID, CSS);
  window.addEventListener("focus", applyModes);
  window.addEventListener("blur", applyModes);
  document.addEventListener("visibilitychange", applyModes);
  return () => {
    window.removeEventListener("focus", applyModes);
    window.removeEventListener("blur", applyModes);
    document.removeEventListener("visibilitychange", applyModes);
    document.documentElement.classList.remove(BACKGROUND_CLASS, LITE_CLASS);
    removeStyle();
  };
}

function onPhase(raw) {
  const next = typeof raw === "string" ? raw : raw?.data;
  if (typeof next !== "string" || !next || next === phase) return;
  phase = next;
  applyModes();
}

function onEnable(utils) {
  api = utils;
  active = true;
  backgroundMode = option("backgroundMode");
  liteMode = option("performanceMode");
  restores = [installFetch(), installXhr(), installBeacon(), quietDatadog(), installModes(), installMediaGovernor()];
  unsubscribe = utils.subscribe(PHASE_URI, onPhase);
  utils.lcu
    .get(PHASE_URI)
    .then(onPhase)
    .catch(() => {});
  applyModes();
}

function onDisable() {
  active = false;
  unsubscribe?.();
  unsubscribe = null;
  for (const restore of restores.reverse()) {
    try {
      restore();
    } catch {}
  }
  restores = [];
  decisions.clear();
  phase = "None";
  api = null;
}

function onOptionChange(key, value) {
  if (key === "backgroundMode") backgroundMode = value === true;
  if (key === "performanceMode") liteMode = value === true;
  applyModes();
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "BetterClient",
      description:
        "Makes the client lighter without changing how it looks: pauses videos and animations nobody can see, blocks telemetry, and pauses the client while you are in a game.",
      version,
      options: OPTIONS,
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
