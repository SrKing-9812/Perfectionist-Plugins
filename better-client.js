const PLUGIN_ID = "better-client";
const version = "1.7.0";

const MAX_CACHE_ENTRIES = 24;
const MAX_CACHE_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const UNGATE_MS = 1000;
const UNGATE_IDLE_MS = 5000;
const UNGATE_BACKOFF_AFTER = 20;
const PHASE_POLL_FALLBACK_MS = 15000;
const IMAGE_BATCH = 160;
const IMAGE_QUEUE_LIMIT = 4000;
const DECISION_CACHE_LIMIT = 256;
const DIAGNOSTICS_HEAP_MS = 30000;
const DIAGNOSTICS_QUIET_MS = 600;
const DIAGNOSTICS_MAX_SETTLE_MS = 6000;
const DIAGNOSTICS_SAMPLE_LIMIT = 240;

const TELEMETRY_HOST = /(^|\.)(telemetry|analytics|metrics|sentry|bugsnag|crash-?report(er)?|pulse|tracking|beacon|datadog|loggly)(\.|:|$)/i;
const TELEMETRY_PATH = /(^|\/)(lol-telemetry|lol-analytics|lol-metrics|lol-rms|rms|lol-sentry|lol-crash|telemetry|analytics|metrics|sentry|bugsnag|crash-?report\w*|tracking|beacon|tracing)(\/|\?|$)/i;
const ASSET_PATH = /^\/lol-game-data\/assets\//i;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const CHAMP_SELECT_DATA = /^\/lol-champ-select\/v1\/(session|all-grid-champions|pickable-champion-ids|bannable-champion-ids)$/i;
const CHAMP_SELECT_RETRY_MS = [120, 260, 520];

const STATIC_ENDPOINTS = [
  ["/lol-game-data/assets/", 60 * 60 * 1000],
  ["/lol-perks/v1/perks", 60 * 60 * 1000],
  ["/riotclient/region-locale", 60 * 1000],
  ["/lol-summoner/v1/current-summoner", 10 * 1000],
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
const UNGATE_SELECTOR = UNGATE_SELECTORS.join(",");
const BLOCK_MARKER = "[disabled], [aria-disabled='true'], [style*='pointer-events']";

const PERF_STYLE_ID = "perfectionist-better-client-performance";
const PERFORMANCE_CSS = `
[class*="blur"], [class*="Blur"], [class*="backdrop"], [class*="Backdrop"] {
  filter: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
[class*="particle"], [class*="Particle"], [class*="parallax"], [class*="Parallax"],
[class*="animated-background"], [class*="animatedBackground"], [class*="glow"], [class*="Glow"] {
  animation: none !important;
  transition: none !important;
}
[class*="background"] video, [class*="Background"] video { display: none !important; }
`;

const OPTIONS = [
  {
    key: "performanceMode",
    label: "Performance mode",
    description: "Turns off background blur, decorative animation and looping background video to save GPU and CPU on weaker machines.",
    default: false,
  },
  {
    key: "diagnostics",
    label: "Diagnostics",
    description: "Records long tasks, screen settle times, request counts and heap samples in memory only. Nothing is sent over the network.",
    default: false,
  },
  {
    key: "copyReport",
    type: "action",
    label: "Copy report",
    description: "Copies the in-memory diagnostics summary. It contains no account, summoner, token or LCU data.",
    onClick: () => copyDiagnosticsReport(),
  },
  {
    key: "blocked",
    type: "info",
    label: "Blocked telemetry",
    description: "Requests dropped at the client UI layer and answered with an empty success.",
    lines: () => blockedSummary(),
  },
];

let api = null;
let active = false;
let phase = "None";
let unsubscribes = [];
let restores = [];
let ungateTimer = null;
let ungateIdle = 0;
let phaseTimer = null;
let phaseWatchListener = null;
let performanceMode = false;
let removePerformanceStyle = null;
let cacheBytes = 0;

let diagnosticsOn = false;
let diagnosticsStartedAt = 0;
let diagnosticsLongCount = 0;
let diagnosticsLongMs = 0;
let diagnosticsLongMax = 0;
let diagnosticsRequests = 0;
let diagnosticsBytes = 0;
let diagnosticsHeap = [];
let diagnosticsNavSamples = [];
let diagnosticsObservers = [];
let diagnosticsHeapTimer = null;
let diagnosticsNavStart = null;
let diagnosticsNavName = "";
let diagnosticsNavActivity = 0;
let diagnosticsNavFrames = 0;
let diagnosticsLastReport = "";
let diagnosticsClickListener = null;

const cache = new Map();
const inflight = new Map();
const blockDecisions = new Map();
const blockedStats = new Map();

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
  const text = typeof raw === "string" ? raw : urlOf(raw);
  const memo = blockDecisions.get(text);
  if (memo !== undefined) return memo;

  let verdict;
  if (text.startsWith("/") && !text.startsWith("//")) {
    verdict = !ASSET_PATH.test(text) && TELEMETRY_PATH.test(text);
  } else {
    const url = resolveUrl(text, base);
    if (!url || url.protocol === "data:" || url.protocol === "blob:") verdict = false;
    else if (ASSET_PATH.test(url.pathname)) verdict = false;
    else if (isLocalHost(url.hostname)) verdict = TELEMETRY_PATH.test(url.pathname);
    else verdict = TELEMETRY_HOST.test(url.hostname) || TELEMETRY_PATH.test(url.pathname);
  }

  if (blockDecisions.size >= DECISION_CACHE_LIMIT) blockDecisions.clear();
  blockDecisions.set(text, verdict);
  return verdict;
}

function blockedKey(raw) {
  const url = resolveUrl(raw);
  if (!url) return String(raw).slice(0, 80);
  if (isLocalHost(url.hostname)) return url.pathname.split("/").slice(0, 3).join("/") || url.pathname;
  return url.hostname;
}

function recordBlocked(raw) {
  const key = blockedKey(raw);
  blockedStats.set(key, (blockedStats.get(key) ?? 0) + 1);
  try {
    window.__betterBlocked = Object.fromEntries(blockedStats);
  } catch {}
}

function blockedSummary() {
  const entries = [...blockedStats.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  const lines = entries.slice(0, 6).map(([key, count]) => `${key}  x${count}`);
  if (lines.length === 0) lines.push("Nothing blocked since the client started.");
  lines.push(`Total: ${total} request${total === 1 ? "" : "s"} answered locally.`);
  return lines;
}

function shouldBlockUrl(raw, base) {
  const verdict = isTelemetryUrl(raw, base);
  if (verdict) recordBlocked(raw);
  return verdict;
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

function diagnosticsScreenName(target) {
  const className = String(target?.className ?? "");
  const match = className.match(/menu_item_navbar_([a-z]+)/i);
  if (!match) return "Profile";
  const name = match[1].toLowerCase();
  return name === "league" ? "Home" : name.charAt(0).toUpperCase() + name.slice(1);
}

function diagnosticsTouch() {
  if (diagnosticsNavStart !== null) diagnosticsNavActivity = performance.now();
}

function diagnosticsFinishNavigation() {
  if (diagnosticsNavStart === null) return;
  const elapsed = Math.max(0, Math.round(performance.now() - diagnosticsNavStart));
  const screen = diagnosticsNavName;
  diagnosticsNavStart = null;
  if (!screen) return;
  diagnosticsNavSamples.push({ screen, ms: elapsed });
  if (diagnosticsNavSamples.length > DIAGNOSTICS_SAMPLE_LIMIT) diagnosticsNavSamples.shift();
}

function diagnosticsNavFrame() {
  if (!diagnosticsOn || diagnosticsNavStart === null) return;
  diagnosticsNavFrames += 1;
  const now = performance.now();
  const age = now - diagnosticsNavStart;
  const quiet = now - diagnosticsNavActivity;
  if ((age >= 800 && diagnosticsNavFrames >= 2 && quiet >= DIAGNOSTICS_QUIET_MS) || age >= DIAGNOSTICS_MAX_SETTLE_MS) {
    diagnosticsFinishNavigation();
    return;
  }
  requestAnimationFrame(diagnosticsNavFrame);
}

function diagnosticsBeginNavigation(screen) {
  if (!diagnosticsOn || !screen) return;
  if (diagnosticsNavStart !== null) diagnosticsFinishNavigation();
  diagnosticsNavStart = performance.now();
  diagnosticsNavName = screen;
  diagnosticsNavActivity = diagnosticsNavStart;
  diagnosticsNavFrames = 0;
  requestAnimationFrame(diagnosticsNavFrame);
}

function diagnosticsClick(event) {
  if (!diagnosticsOn) return;
  const target = event.target?.closest?.('[class*="menu_item_navbar_"], [class*="details-view-profile"]');
  if (!target) return;
  diagnosticsBeginNavigation(diagnosticsScreenName(target));
}

function diagnosticsSampleHeap() {
  if (!diagnosticsOn) return;
  const used = performance.memory?.usedJSHeapSize;
  if (!Number.isFinite(used)) return;
  diagnosticsHeap.push({ mb: +(used / 1048576).toFixed(1), at: Date.now() });
  if (diagnosticsHeap.length > DIAGNOSTICS_SAMPLE_LIMIT) diagnosticsHeap.shift();
}

function diagnosticsStart() {
  if (diagnosticsOn) return;
  diagnosticsOn = true;
  diagnosticsStartedAt = Date.now();
  diagnosticsLongCount = 0;
  diagnosticsLongMs = 0;
  diagnosticsLongMax = 0;
  diagnosticsRequests = 0;
  diagnosticsBytes = 0;
  diagnosticsHeap = [];
  diagnosticsNavSamples = [];
  diagnosticsLastReport = "";
  diagnosticsNavStart = null;

  try {
    const longTasks = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        diagnosticsLongCount += 1;
        diagnosticsLongMs += entry.duration;
        diagnosticsLongMax = Math.max(diagnosticsLongMax, entry.duration);
        diagnosticsTouch();
      }
    });
    longTasks.observe({ entryTypes: ["longtask"] });
    diagnosticsObservers.push(longTasks);
  } catch {}

  try {
    const resources = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        diagnosticsRequests += 1;
        diagnosticsBytes += Number(entry.transferSize || entry.encodedBodySize || 0);
        diagnosticsTouch();
      }
    });
    resources.observe({ entryTypes: ["resource"] });
    diagnosticsObservers.push(resources);
  } catch {}

  try {
    const mutations = new MutationObserver(diagnosticsTouch);
    mutations.observe(document.documentElement ?? document, { childList: true, subtree: true });
    diagnosticsObservers.push(mutations);
  } catch {}

  diagnosticsClickListener = diagnosticsClick;
  document.addEventListener("click", diagnosticsClickListener, true);
  diagnosticsSampleHeap();
  diagnosticsHeapTimer = setInterval(diagnosticsSampleHeap, DIAGNOSTICS_HEAP_MS);
}

function diagnosticsStop() {
  if (!diagnosticsOn) return;
  if (diagnosticsNavStart !== null) diagnosticsFinishNavigation();
  diagnosticsLastReport = diagnosticsReportText();
  diagnosticsOn = false;
  for (const observer of diagnosticsObservers) {
    try {
      observer.disconnect();
    } catch {}
  }
  diagnosticsObservers = [];
  clearInterval(diagnosticsHeapTimer);
  diagnosticsHeapTimer = null;
  if (diagnosticsClickListener) document.removeEventListener("click", diagnosticsClickListener, true);
  diagnosticsClickListener = null;
  diagnosticsNavStart = null;
}

function diagnosticsPlugins() {
  try {
    return api
      ?.getPlugins?.()
      .filter((plugin) => plugin.enabled)
      .map((plugin) => plugin.name)
      .join(", ") || "none";
  } catch {
    return "unknown";
  }
}

function diagnosticsDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function diagnosticsMedian(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function diagnosticsReportText() {
  if (!diagnosticsOn && diagnosticsLastReport) return diagnosticsLastReport;
  const duration = diagnosticsStartedAt ? diagnosticsDuration(Date.now() - diagnosticsStartedAt) : "0s";
  const lines = [
    "Perfectionism diagnostics",
    `Duration: ${duration}`,
    `Plugins on: ${diagnosticsPlugins()}`,
    `Long tasks: ${diagnosticsLongCount}, ${Math.round(diagnosticsLongMs)} ms total, ${Math.round(diagnosticsLongMax)} ms max`,
    `Requests: ${diagnosticsRequests}, ${(diagnosticsBytes / 1048576).toFixed(1)} MB`,
  ];

  if (diagnosticsHeap.length > 0) {
    const first = diagnosticsHeap[0].mb;
    const last = diagnosticsHeap[diagnosticsHeap.length - 1].mb;
    const peak = Math.max(...diagnosticsHeap.map((sample) => sample.mb));
    lines.push(`Heap: ${first.toFixed(1)} MB start, ${last.toFixed(1)} MB latest, ${peak.toFixed(1)} MB peak (${diagnosticsHeap.length} samples)`);
  } else {
    lines.push("Heap: unavailable");
  }

  if (diagnosticsNavSamples.length === 0) {
    lines.push("Screens: no navigation samples");
  } else {
    lines.push("Screens:");
    const order = [];
    const grouped = new Map();
    for (const sample of diagnosticsNavSamples) {
      if (!grouped.has(sample.screen)) {
        grouped.set(sample.screen, []);
        order.push(sample.screen);
      }
      grouped.get(sample.screen).push(sample.ms);
    }
    for (const screen of order) {
      const values = grouped.get(screen);
      lines.push(`  ${screen}: ${values.length}x, ${diagnosticsMedian(values)} ms median, ${Math.min(...values)}-${Math.max(...values)} ms`);
    }
  }

  lines.push("Local only. Nothing is uploaded.");
  return lines.join("\n");
}

async function copyDiagnosticsReport() {
  const text = diagnosticsOn ? diagnosticsReportText() : diagnosticsLastReport || diagnosticsReportText();
  if (!diagnosticsOn) diagnosticsLastReport = text;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return text;
    }
  } catch {}
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    area.remove();
  }
  return text;
}

function champSelectDataPath(url) {
  if (!url) return null;
  return CHAMP_SELECT_DATA.test(url.pathname) ? url.pathname.toLowerCase() : null;
}

function isEmptyChampSelect(path, json) {
  if (path.endsWith("/session")) {
    if (!json || typeof json !== "object") return true;
    return !Array.isArray(json.myTeam) || json.myTeam.length === 0;
  }
  return Array.isArray(json) && json.length === 0;
}

function champSelectPathOf(rawUrl) {
  return champSelectDataPath(resolveUrl(rawUrl));
}

async function primeChampSelect(raw, path) {
  for (const wait of [0, 120, 240]) {
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const response = await raw(path);
      if (!response?.ok) continue;
      const json = await response.json();
      if (!isEmptyChampSelect(path, json)) return;
    } catch {}
  }
}

function createFetch(env) {
  const native = env.fetch.bind(env);

  function repairChampSelect(input, init, request, path) {
    let attempt = 0;
    const step = (current) =>
      current.then((response) => {
        if (!active || phase !== "ChampSelect" || attempt >= CHAMP_SELECT_RETRY_MS.length) return response;
        if (!response || !response.ok || !response.clone) return response;
        return response.clone().json().then(
          (json) => {
            if (!isEmptyChampSelect(path, json)) return response;
            const wait = CHAMP_SELECT_RETRY_MS[attempt];
            attempt += 1;
            return new Promise((resolve) => setTimeout(resolve, wait)).then(() => step(native(input, init)));
          },
          () => response,
        );
      });
    return step(request);
  }

  function betterFetch(input, init) {
    const raw = urlOf(input);

    if (active && shouldBlockUrl(raw)) {
      return Promise.resolve(emptyJsonResponse(env));
    }

    const method = methodOf(input, init);
    if (method !== "GET" && method !== "HEAD") {
      return native(input, init);
    }

    const url = resolveUrl(raw);
    if (!url || !isLocalHost(url.hostname)) {
      return native(input, init);
    }

    const key = `${method} ${url.pathname}${url.search}`;
    const pending = inflight.get(key);
    if (pending) {
      return pending.then((response) => (response?.clone ? response.clone() : response));
    }

    const ttl = active ? staticTtl(url.pathname) : 0;
    if (ttl) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < hit.ttl) {
        return Promise.resolve(hit.res.clone());
      }
    }

    let request = native(input, init);
    const dataPath = champSelectDataPath(url);
    if (dataPath && active && phase === "ChampSelect") {
      request = repairChampSelect(input, init, request, dataPath);
    }

    inflight.set(key, request);
    const done = () => inflight.delete(key);
    request.then(done, done);

    if (ttl) {
      request.then((response) => {
        if (!response?.ok || !active) return;
        storeInCache(key, ttl, response);
      }, () => {});
    }
    return request;
  }

  betterFetch.__better = true;
  betterFetch.raw = native;
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
    const path = champSelectPathOf(this.__betterUrl);
    const raw = env.fetch?.raw;
    if (path && raw && active && phase === "ChampSelect" && !this.__betterPrimed) {
      this.__betterPrimed = true;
      primeChampSelect(raw, path).finally(() => {
        try {
          nativeSend.call(this, body);
        } catch {}
      });
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

let mediaObserver = null;
let mediaScanObserver = null;
let mediaVisibilityListener = null;
let mediaPaused = new WeakSet();

let imageObserver = null;
let imageQueue = [];
let imageFlushTimer = null;
let imageFlushIdle = false;
let imageVisibilityListener = null;

function markAsyncDecode(img) {
  if (!img || img.tagName !== "IMG" || img.decoding === "async") return 0;
  try {
    img.decoding = "async";
    return 1;
  } catch {
    return 0;
  }
}

function documentView() {
  try {
    return document.defaultView ?? null;
  } catch {
    return null;
  }
}

function pageHidden() {
  try {
    return document.hidden === true;
  } catch {
    return false;
  }
}

function scheduleImageFlush() {
  if (imageFlushTimer !== null) return;
  const view = documentView();
  if (typeof view?.requestIdleCallback === "function") {
    imageFlushIdle = true;
    imageFlushTimer = view.requestIdleCallback(flushImageQueue, { timeout: 600 });
  } else {
    imageFlushIdle = false;
    imageFlushTimer = setTimeout(flushImageQueue, 150);
  }
}

function cancelImageFlush() {
  if (imageFlushTimer === null) return;
  const view = documentView();
  if (imageFlushIdle && typeof view?.cancelIdleCallback === "function") view.cancelIdleCallback(imageFlushTimer);
  else clearTimeout(imageFlushTimer);
  imageFlushTimer = null;
}

function scanImages(root) {
  let found;
  try {
    found = root.querySelectorAll("img[src]:not([decoding='async'])");
  } catch {
    return 0;
  }
  let marked = 0;
  for (const img of found) marked += markAsyncDecode(img);
  return marked;
}

function flushImageQueue() {
  imageFlushTimer = null;
  if (pageHidden()) {
    scheduleImageFlush();
    return;
  }
  const batch = imageQueue.splice(0, IMAGE_BATCH);
  for (const root of batch) {
    if (!root?.isConnected) continue;
    markAsyncDecode(root);
    scanImages(root);
  }
  if (imageQueue.length > 0) scheduleImageFlush();
}

function enqueueImages(root) {
  if (!root || root.nodeType !== 1) return 0;
  if (imageQueue.length >= IMAGE_QUEUE_LIMIT) return 0;
  if (root.tagName !== "IMG" && root.childElementCount === 0) return 0;
  imageQueue.push(root);
  scheduleImageFlush();
  return 1;
}

function pauseDecorativeVideo(video) {
  if (!video || video.tagName !== "VIDEO" || video.paused) return;
  if (!video.autoplay && !video.muted) return;
  try {
    video.pause();
    mediaPaused.add(video);
  } catch {}
}

function resumeDecorativeVideo(video) {
  if (!video || !mediaPaused.has(video)) return;
  mediaPaused.delete(video);
  try {
    const play = video.play?.();
    if (play?.catch) play.catch(() => {});
  } catch {}
}

function installMediaIdle() {
  if (typeof document === "undefined" || !document.documentElement) return () => {};
  const Obs = document.defaultView?.IntersectionObserver ?? IntersectionObserver;
  const Mut = document.defaultView?.MutationObserver ?? MutationObserver;
  if (!Obs || !Mut) return () => {};
  mediaObserver = new Obs(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) resumeDecorativeVideo(entry.target);
        else pauseDecorativeVideo(entry.target);
      }
    },
    { rootMargin: "240px" },
  );
  const scan = () => {
    for (const video of document.querySelectorAll("video")) {
      if (video.__betterMedia) continue;
      video.__betterMedia = true;
      try {
        mediaObserver.observe(video);
      } catch {}
    }
  };
  scan();
  mediaScanObserver = new Mut(scan);
  try {
    mediaScanObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}
  mediaVisibilityListener = () => {
    if (pageHidden()) {
      for (const video of document.querySelectorAll("video")) pauseDecorativeVideo(video);
      return;
    }
    scan();
    for (const video of document.querySelectorAll("video")) {
      if (video.getClientRects().length > 0) resumeDecorativeVideo(video);
    }
  };
  document.addEventListener("visibilitychange", mediaVisibilityListener);
  return () => {
    document.removeEventListener("visibilitychange", mediaVisibilityListener);
    mediaVisibilityListener = null;
    mediaScanObserver?.disconnect();
    mediaScanObserver = null;
    mediaObserver?.disconnect();
    mediaObserver = null;
    mediaPaused = new WeakSet();
  };
}

function installImageDecode() {
  if (typeof document === "undefined" || !document.documentElement) return () => {};
  const Obs = document.defaultView?.MutationObserver ?? MutationObserver;
  if (imageObserver || !Obs) return () => {};
  imageObserver = new Obs((records) => {
    let queued = 0;
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target?.tagName === "IMG") queued += enqueueImages(record.target);
        continue;
      }
      const nodes = record.addedNodes;
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node?.nodeType === 1) queued += enqueueImages(node);
      }
      if (queued > 400) break;
    }
  });
  try {
    imageObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch {
    imageObserver = null;
    return () => {};
  }
  enqueueImages(document.documentElement);
  imageVisibilityListener = () => {
    if (pageHidden()) return;
    enqueueImages(document.documentElement);
    scheduleImageFlush();
  };
  document.addEventListener("visibilitychange", imageVisibilityListener);
  return () => {
    document.removeEventListener("visibilitychange", imageVisibilityListener);
    imageVisibilityListener = null;
    cancelImageFlush();
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
  let nodes;
  try {
    nodes = document.querySelectorAll(UNGATE_SELECTOR);
  } catch {
    return 0;
  }
  let changed = 0;
  for (const node of nodes) changed += ungateNode(node);
  return changed;
}

function ungateDelay() {
  return ungateIdle >= UNGATE_BACKOFF_AFTER ? UNGATE_IDLE_MS : UNGATE_MS;
}

function ungateTick() {
  ungateTimer = null;
  if (!active || phase !== "InProgress") return;
  if (pageHidden()) {
    ungateTimer = setTimeout(ungateTick, UNGATE_IDLE_MS);
    return;
  }
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
  if (!active || pageHidden()) return;
  try {
    const current = await api?.lcu?.get?.("/lol-gameflow/v1/gameflow-phase");
    if (current) onPhase(current);
  } catch {}
}

function startPhaseWatch() {
  stopPhaseWatch();
  if (unsubscribes.length === 0) {
    phaseTimer = setInterval(() => {
      if (!pageHidden()) refreshPhase();
    }, PHASE_POLL_FALLBACK_MS);
  }
  phaseWatchListener = () => {
    if (!pageHidden()) refreshPhase();
  };
  document.addEventListener("visibilitychange", phaseWatchListener);
}

function stopPhaseWatch() {
  clearInterval(phaseTimer);
  phaseTimer = null;
  if (phaseWatchListener) {
    document.removeEventListener("visibilitychange", phaseWatchListener);
    phaseWatchListener = null;
  }
}

function applyPerformanceMode() {
  if (!api) return;
  if (performanceMode) {
    if (!removePerformanceStyle) removePerformanceStyle = api.addStyle(PERF_STYLE_ID, PERFORMANCE_CSS);
    return;
  }
  if (removePerformanceStyle) {
    removePerformanceStyle();
    removePerformanceStyle = null;
  }
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
  restores = [installNetwork(window), installImageDecode(), installMediaIdle()];
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
  startPhaseWatch();
  performanceMode = api.getOption?.(PLUGIN_ID, "performanceMode") === true;
  applyPerformanceMode();
  if (api.getOption?.(PLUGIN_ID, "diagnostics") === true) diagnosticsStart();
  if (phase === "InProgress") startUngate();
}

function onDisable() {
  active = false;
  diagnosticsStop();
  stopPhaseWatch();
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
  if (removePerformanceStyle) {
    removePerformanceStyle();
    removePerformanceStyle = null;
  }
  performanceMode = false;
  inflight.clear();
  blockDecisions.clear();
  blockedStats.clear();
  for (const key of [...cache.keys()]) evictOne(key);
  cacheBytes = 0;
  api = null;
}

function onOptionChange(key, value) {
  if (key === "performanceMode") {
    performanceMode = value === true;
    applyPerformanceMode();
  }
  if (key === "diagnostics") {
    if (value === true) diagnosticsStart();
    else diagnosticsStop();
  }
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
