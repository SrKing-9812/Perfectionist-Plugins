const PLUGIN_ID = "better-client";
const version = "1.2.0";

const MAX_CACHE_ENTRIES = 24;
const MAX_CACHE_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const UNGATE_MS = 1000;
const UNGATE_IDLE_MS = 5000;
const UNGATE_BACKOFF_AFTER = 20;
const PHASE_POLL_MS = 5000;
const IMAGE_BATCH = 200;

const TELEMETRY_HOST = /(^|\.)(telemetry|analytics|metrics|sentry|bugsnag|crash-?report(er)?|pulse|tracking|beacon|datadog|loggly)(\.|:|$)/i;
const TELEMETRY_PATH = /(^|\/)(lol-telemetry|lol-analytics|lol-metrics|lol-rms|rms|lol-sentry|lol-crash|telemetry|analytics|metrics|sentry|bugsnag|crash-?report\w*|tracking|beacon)(\/|$)/i;
const ASSET_PATH = /^\/lol-game-data\/assets\//i;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const STATIC_ENDPOINTS = [
  ["/lol-game-data/assets/", 60 * 60 * 1000],
  ["/lol-perks/v1/perks", 60 * 60 * 1000],
  ["/performance/v1/quickstats", 5000],
];

const UNGATE_SELECTORS = [
  ".app-controls-settings",
  ".lol-settings-button",
  "[class*='social-panel']",
  ".social-panel",
  ".lol-social-panel",
  ".lol-navigation",
  ".lol-navigation-item",
  "[class*='friends-list']",
];
const BLOCK_MARKER = "[disabled], [aria-disabled='true'], [style*='pointer-events']";

let api = null;
let active = false;
let phase = "None";
let unsubscribes = [];
let restores = [];
let ungateTimer = null;
let ungateIdle = 0;
let phaseTimer = null;
let cacheBytes = 0;

const cache = new Map();
const inflight = new Map();

function baseHref() {
  try {
    return typeof location !== "undefined" ? location.href : "https://127.0.0.1/";
  } catch {
    return "https://127.0.0.1/";
  }
}

function resolveUrl(raw, base) {
  try {
    return new URL(String(raw), base ?? baseHref());
  } catch {
    return null;
  }
}

function isLocalHost(host) {
  return LOCAL_HOSTS.has(String(host ?? "").replace(/^\[|\]$/g, ""));
}

function isTelemetryUrl(raw, base) {
  const url = resolveUrl(raw, base);
  if (!url || url.protocol === "data:" || url.protocol === "blob:") return false;
  if (ASSET_PATH.test(url.pathname)) return false;
  if (isLocalHost(url.hostname)) return TELEMETRY_PATH.test(url.pathname);
  return TELEMETRY_HOST.test(url.hostname) || TELEMETRY_PATH.test(url.pathname);
}

function shouldBlockUrl(raw, base) {
  return isTelemetryUrl(raw, base);
}

function staticTtl(path) {
  if (!path) return 0;
  for (const [prefix, ttl] of STATIC_ENDPOINTS) {
    if (path.startsWith(prefix)) return ttl;
  }
  return 0;
}

function methodOf(input, init) {
  const method = init?.method ?? (input && typeof input === "object" && "method" in input ? input.method : "GET");
  return String(method ?? "GET").toUpperCase();
}

function urlOf(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    if (typeof input.url === "string") return input.url;
    if (typeof input.href === "string") return input.href;
  }
  return String(input);
}

function emptyJsonResponse(env) {
  const Ctor = env?.Response ?? (typeof Response !== "undefined" ? Response : null);
  if (!Ctor) return undefined;
  try {
    return new Ctor("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  } catch {
    return undefined;
  }
}

function evictOne(key) {
  const entry = cache.get(key);
  if (!entry) return;
  cacheBytes -= entry.bytes;
  cache.delete(key);
}

function evict(max) {
  while (cache.size >= max) evictOne(cache.keys().next().value);
}

function storeInCache(key, ttl, response) {
  const type = String(response.headers?.get?.("Content-Type") ?? "");
  if (type && !/json|javascript|plain/i.test(type)) return;
  const length = Number(response.headers?.get?.("Content-Length") ?? 0) || 0;
  if (length > MAX_CACHE_ENTRY_BYTES) return;
  evict(MAX_CACHE_ENTRIES);
  cache.set(key, { at: Date.now(), ttl, res: response.clone(), bytes: length });
  cacheBytes += length;
  while (cacheBytes > MAX_CACHE_BYTES && cache.size > 1) {
    evictOne(cache.keys().next().value);
  }
}

function clearVolatileCache() {
  for (const [key, entry] of [...cache]) {
    if (entry.ttl < 60 * 60 * 1000) evictOne(key);
  }
}

function createFetch(env) {
  const native = env.fetch.bind(env);

  function betterFetch(input, init) {
    const raw = urlOf(input);
    const method = methodOf(input, init);

    if (active && shouldBlockUrl(raw)) {
      return Promise.resolve(emptyJsonResponse(env));
    }

    const url = resolveUrl(raw);
    const local = url ? isLocalHost(url.hostname) : false;
    const cacheable = local && method === "GET";
    const key = `${method} ${url ? url.origin + url.pathname + url.search : raw}`;

    if (cacheable && active) {
      const pending = inflight.get(key);
      if (pending) {
        return pending.then((response) => (response?.clone ? response.clone() : response));
      }
    }

    if (cacheable && active) {
      const ttl = staticTtl(url?.pathname);
      const hit = ttl ? cache.get(key) : null;
      if (hit && Date.now() - hit.at < hit.ttl) {
        return Promise.resolve(hit.res.clone());
      }
    }

    const request = native(input, init);
    if (local && (method === "GET" || method === "HEAD")) {
      inflight.set(key, request);
      const done = () => inflight.delete(key);
      request.then(done, done);
      if (cacheable) {
        request.then((response) => {
          const ttl = staticTtl(url?.pathname);
          if (!response?.ok || !ttl || !active) return;
          storeInCache(key, ttl, response);
        }, () => {});
      }
    }
    return request;
  }

  betterFetch.__better = true;
  return betterFetch;
}

function emitBlockedXhr(xhr, env) {
  const reply = "{}";
  try {
    Object.defineProperty(xhr, "readyState", { configurable: true, get: () => 4 });
    Object.defineProperty(xhr, "status", { configurable: true, get: () => 200 });
    Object.defineProperty(xhr, "responseText", { configurable: true, get: () => reply });
    Object.defineProperty(xhr, "response", { configurable: true, get: () => reply });
  } catch {}
  const EventCtor = env.Event ?? (typeof Event !== "undefined" ? Event : null);
  if (!EventCtor) return;
  setTimeout(() => {
    try {
      xhr.dispatchEvent(new EventCtor("readystatechange"));
      xhr.dispatchEvent(new EventCtor("load"));
      xhr.dispatchEvent(new EventCtor("loadend"));
    } catch {}
  }, 0);
}

function installXhr(env) {
  const proto = env.XMLHttpRequest?.prototype;
  if (!proto || proto.__better) return null;
  const nativeOpen = proto.open;
  const nativeSend = proto.send;
  proto.open = function (method, url, ...rest) {
    this.__betterUrl = String(url);
    return nativeOpen.call(this, method, url, ...rest);
  };
  proto.send = function (body) {
    if (active && shouldBlockUrl(this.__betterUrl)) {
      emitBlockedXhr(this, env);
      return undefined;
    }
    return nativeSend.call(this, body);
  };
  proto.__better = true;
  return () => {
    proto.open = nativeOpen;
    proto.send = nativeSend;
    delete proto.__better;
  };
}

function installBeacon(env) {
  const nav = env.navigator;
  if (!nav?.sendBeacon || nav.sendBeacon.__better) return null;
  const native = nav.sendBeacon.bind(nav);
  const patched = function (url) {
    if (active && shouldBlockUrl(url)) return true;
    return native(url, arguments[1]);
  };
  patched.__better = true;
  nav.sendBeacon = patched;
  return () => {
    nav.sendBeacon = native;
  };
}

let imageObserver = null;
let imageQueue = [];
let imageFlushTimer = null;

function markAsyncDecode(img) {
  if (!img || img.tagName !== "IMG" || img.decoding === "async") return 0;
  try {
    img.decoding = "async";
    return 1;
  } catch {
    return 0;
  }
}

function flushImageQueue() {
  imageFlushTimer = null;
  const batch = imageQueue.splice(0, IMAGE_BATCH);
  for (const img of batch) markAsyncDecode(img);
  if (imageQueue.length > 0) scheduleImageFlush();
}

function scheduleImageFlush() {
  if (imageFlushTimer !== null) return;
  imageFlushTimer = setTimeout(flushImageQueue, 150);
}

function enqueueImages(root) {
  if (!root || root.nodeType !== 1) return 0;
  let added = 0;
  if (root.tagName === "IMG") {
    imageQueue.push(root);
    added += 1;
  }
  let list = [];
  try {
    list = root.querySelectorAll("img:not([decoding='async'])");
  } catch {
    list = [];
  }
  for (const img of list) {
    imageQueue.push(img);
    added += 1;
  }
  if (imageQueue.length > 6000) imageQueue.splice(0, imageQueue.length - 6000);
  if (added > 0) scheduleImageFlush();
  return added;
}

function installImageDecode() {
  if (typeof document === "undefined" || !document.documentElement) return () => {};
  const Obs = document.defaultView?.MutationObserver ?? MutationObserver;
  if (imageObserver || !Obs) return () => {};
  imageObserver = new Obs((records) => {
    let queued = false;
    for (const record of records) {
      if (record.type === "attributes") {
        if (enqueueImages(record.target) > 0) queued = true;
        continue;
      }
      for (const node of record.addedNodes) {
        if (node?.nodeType !== 1) continue;
        if (enqueueImages(node) > 0) queued = true;
      }
    }
    if (queued) scheduleImageFlush();
  });
  try {
    imageObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  } catch {
    imageObserver = null;
    return () => {};
  }
  enqueueImages(document.documentElement);
  const sweep = setInterval(() => enqueueImages(document.documentElement), 30000);
  return () => {
    clearInterval(sweep);
    clearTimeout(imageFlushTimer);
    imageFlushTimer = null;
    imageQueue = [];
    imageObserver?.disconnect();
    imageObserver = null;
  };
}

function ungateNode(node) {
  if (!node?.querySelectorAll) return 0;
  let changed = 0;
  const candidates = [];
  try {
    if (node.matches?.(BLOCK_MARKER)) candidates.push(node);
    candidates.push(...node.querySelectorAll(BLOCK_MARKER));
  } catch {
    return 0;
  }
  for (const element of candidates) {
    if (element.disabled === true) {
      element.disabled = false;
      changed += 1;
    }
    if (element.hasAttribute?.("disabled")) {
      element.removeAttribute("disabled");
      changed += 1;
    }
    if (element.getAttribute?.("aria-disabled") === "true") {
      element.removeAttribute("aria-disabled");
      changed += 1;
    }
    if (element.style?.pointerEvents === "none") {
      element.style.pointerEvents = "";
      changed += 1;
    }
  }
  return changed;
}

function ungatePass() {
  if (!active || phase !== "InProgress") return 0;
  let changed = 0;
  for (const selector of UNGATE_SELECTORS) {
    let nodes = [];
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      nodes = [];
    }
    for (const node of nodes) changed += ungateNode(node);
  }
  return changed;
}

function ungateDelay() {
  return ungateIdle >= UNGATE_BACKOFF_AFTER ? UNGATE_IDLE_MS : UNGATE_MS;
}

function ungateTick() {
  ungateTimer = null;
  if (!active || phase !== "InProgress") return;
  const changed = ungatePass();
  ungateIdle = changed > 0 ? 0 : ungateIdle + 1;
  ungateTimer = setTimeout(ungateTick, ungateDelay());
}

function startUngate() {
  if (ungateTimer) return;
  ungateIdle = 0;
  ungateTick();
}

function stopUngate() {
  clearTimeout(ungateTimer);
  ungateTimer = null;
  ungateIdle = 0;
}

function onPhase(next) {
  const value = typeof next === "string" ? next : next?.phase ?? phase;
  if (!value || value === phase) {
    if (value === "InProgress") startUngate();
    return;
  }
  phase = value;
  clearVolatileCache();
  if (phase === "InProgress") startUngate();
  else stopUngate();
}

async function refreshPhase() {
  if (!active) return;
  if (typeof document !== "undefined" && document.hidden) return;
  try {
    const current = await api?.lcu?.get?.("/lol-gameflow/v1/gameflow-phase");
    if (current) onPhase(current);
  } catch {}
}

function installNetwork(env) {
  const installed = [];
  try {
    const originalFetch = env.fetch;
    env.fetch = createFetch(env);
    installed.push(() => {
      env.fetch = originalFetch;
    });
  } catch {}
  const xhr = installXhr(env);
  if (xhr) installed.push(xhr);
  const beacon = installBeacon(env);
  if (beacon) installed.push(beacon);
  return () => {
    for (const restore of installed.reverse()) {
      try {
        restore();
      } catch {}
    }
  };
}

function onEnable(utils) {
  api = utils;
  active = true;
  restores = [installNetwork(window), installImageDecode()];
  unsubscribes = [];
  try {
    const off = api.subscribe("/lol-gameflow/v1/gameflow-phase", onPhase);
    if (off) unsubscribes.push(off);
  } catch {}
  try {
    api
      .lcu?.get?.("/lol-gameflow/v1/gameflow-phase")
      .then((value) => onPhase(value))
      .catch(() => {});
  } catch {}
  refreshPhase();
  clearInterval(phaseTimer);
  phaseTimer = setInterval(refreshPhase, PHASE_POLL_MS);
  if (phase === "InProgress") startUngate();
}

function onDisable() {
  active = false;
  clearInterval(phaseTimer);
  phaseTimer = null;
  stopUngate();
  for (const off of unsubscribes) {
    try {
      off();
    } catch {}
  }
  unsubscribes = [];
  for (const restore of restores.reverse()) {
    try {
      restore();
    } catch {}
  }
  restores = [];
  inflight.clear();
  for (const key of [...cache.keys()]) evictOne(key);
  cacheBytes = 0;
  api = null;
}

export function init() {
  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "BetterClient",
      description:
        "Debloats the client: blocks telemetry and analytics calls, merges duplicate requests, caches static client data, decodes images asynchronously and keeps settings, chat and friend requests usable during a game.",
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
  addEventListener("perfectionist:utils-ready", (e) => registerWith(e.detail ?? window.PerfectionistUtils), { once: true });
}
