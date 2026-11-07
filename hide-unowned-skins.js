export const version = "2.4.5";

const PLUGIN_ID = "hide-unowned-skins";
const STYLE_ID = "perfectionist-hide-unowned-skins-style";
const HIDDEN_CLASS = "perf-unowned-skin-hidden";
const SKIN_ITEM_SELECTOR = ".skin-selection-item";
const DOT_SELECTOR = ".skin-selection-indicator-selector";
const SESSION_URI = "/lol-champ-select/v1/session";
const SELECTION_URI = "/lol-champ-select/v1/session/my-selection";
const CAROUSEL_URI = "/lol-champ-select/v1/skin-carousel-skins";
const CURRENT_SUMMONER_URI = "/lol-summoner/v1/current-summoner";
const SUMMONER_TTL = 10 * 60 * 1000;
const INVENTORY_TTL = 60 * 1000;
const REFRESH_DEBOUNCE_MS = 350;
const RETRY_MS = 5000;
const STATE_KEY = "perfectionist-plugins:state";

const CSS = `
.${HIDDEN_CLASS} { display: none !important; margin: 0 !important; padding: 0 !important; border: none !important; }
.perf-native-hidden { display: none !important; }
`;

const OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src"],
};

const FILTER_VERSION = "2.4.5";
const FILTER_STATE_KEY = "__perfSkinFilterState";
const filterState = (globalThis[FILTER_STATE_KEY] ??= { active: true });

let skinShapeKeys = null;

function learnSkinShape(list) {
  if (!Array.isArray(list) || list.length === 0) return;
  const keys = new Set(skinShapeKeys || []);
  for (const item of list.slice(0, 4)) {
    if (item && typeof item === "object") for (const key of Object.keys(item)) keys.add(key);
  }
  if (keys.size >= 2) skinShapeKeys = keys;
}

function isSkinLike(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "number") return false;
  if (skinShapeKeys) {
    let hits = 0;
    for (const key of Object.keys(item)) if (skinShapeKeys.has(key)) hits++;
    return hits >= 2;
  }
  return (
    "ownership" in item ||
    "tilePath" in item ||
    "splashPath" in item ||
    "unlocked" in item ||
    Array.isArray(item.chromas)
  );
}

function isSkinCollection(list) {
  if (!Array.isArray(list) || list.length < 2) return false;
  return isSkinLike(list[0]) && isSkinLike(list[list.length - 1]);
}

function installArrayFilter() {
  const proto = Array.prototype;
  if (!proto || proto.filter.__perfSkinFilter === FILTER_VERSION) return;
  const nativeFilter = proto.filter;
  const wrapped = function (callback, thisArg) {
    const result = nativeFilter.call(this, callback, thisArg);
    if (!filterState.active || currentChampionId === null || !isSkinCollection(result)) return result;
    let changed = false;
    if (!skinShapeKeys) learnSkinShape(result);
    const kept = nativeFilter.call(result, (skin) => {
      const owned = isOwnedSkin(skin);
      if (!owned) changed = true;
      return owned;
    });
    if (!changed) return result;
    return kept;
  };
  wrapped.__perfSkinFilter = FILTER_VERSION;
  proto.filter = wrapped;
}
let rawFetch = (typeof window !== "undefined" && window.fetch && window.fetch.__perfOriginalFetch) || null;
let clientSkinOrder = [];

function readDefaultEnabled() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    return saved.enabled?.[PLUGIN_ID] !== false;
  } catch {
    return true;
  }
}

function isOwnedSkin(skin) {
  if (!skin || typeof skin !== "object") return true;
  const id = typeof skin.id === "number" ? skin.id : null;
  if (id === null) return true;
  if (id % 1000 === 0) return true;
  if (ownedSkinIds && allSkinIds && allSkinIds.has(id)) return ownedSkinIds.has(id);
  const ownership = skin.ownership;
  if (ownership && typeof ownership.owned === "boolean") return ownership.owned;
  if (typeof skin.owned === "boolean") return skin.owned;
  if (typeof skin.unlocked === "boolean") return skin.unlocked;
  return true;
}

function filterSkinList(list) {
  if (!Array.isArray(list) || currentChampionId === null) return null;
  if (!skinShapeKeys && isSkinCollection(list)) learnSkinShape(list);
  let changed = false;
  const filtered = list
    .map((skin) => {
      if (!skin || !Array.isArray(skin.childSkins)) return skin;
      const childSkins = skin.childSkins.filter(isOwnedSkin);
      if (childSkins.length === skin.childSkins.length) return skin;
      changed = true;
      return Object.assign({}, skin, { childSkins });
    })
    .filter(isOwnedSkin);
  if (filtered.length !== list.length) changed = true;
  return changed ? filtered : null;
}

function recordClientOrder(list) {
  scheduleRefresh();
  if (Array.isArray(list)) {
    clientSkinOrder = list.map((skin) => (skin && typeof skin.id === "number" ? skin.id : null)).filter((id) => id !== null);
  }
}

function rewriteWebSocketFrame(text) {
  if (!filterState.active || currentChampionId === null || typeof text !== "string") return null;
  if (text.indexOf("skin-carousel-skins") === -1) return null;
  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(frame) || frame.length < 3) return null;
  const payload = frame[2];
  if (!payload || typeof payload !== "object" || typeof payload.uri !== "string") return null;
  if (payload.uri.split("?")[0] !== CAROUSEL_URI) return null;
  const kept = filterSkinList(payload.data);
  recordClientOrder(kept ?? payload.data);
  if (!kept) return null;
  return JSON.stringify([frame[0], frame[1], Object.assign({}, payload, { data: kept })]);
}

function wrapMessageListener(listener) {
  if (typeof listener !== "function" || listener.__perfSkinWrap) return listener;
  const wrapped = function (event) {
    if (event && typeof event.data === "string") {
      const rewritten = rewriteWebSocketFrame(event.data);
      if (rewritten !== null) {
        const fresh = new MessageEvent("message", {
          data: rewritten,
          origin: event.origin,
          lastEventId: event.lastEventId,
          ports: event.ports ? [...event.ports] : [],
          source: event.source ?? null,
        });
        return listener.call(this, fresh);
      }
    }
    return listener.call(this, event);
  };
  wrapped.__perfSkinWrap = true;
  wrapped.__perfOriginal = listener;
  return wrapped;
}

function installWebSocketFilter() {
  const proto = window.WebSocket && window.WebSocket.prototype;
  if (!proto || proto.addEventListener.__perfSkinFilter === FILTER_VERSION) return;

  const origAdd = proto.addEventListener;
  const origRemove = proto.removeEventListener;
  const origDispatch = proto.dispatchEvent;

  proto.addEventListener = function (type, listener, options) {
    return origAdd.call(this, type, type === "message" ? wrapMessageListener(listener) : listener, options);
  };
  proto.removeEventListener = function (type, listener, options) {
    return origRemove.call(this, type, (listener && listener.__perfOriginal) || listener, options);
  };
  proto.dispatchEvent = function (event) {
    if (event && event.type === "message" && typeof event.data === "string") {
      const rewritten = rewriteWebSocketFrame(event.data);
      if (rewritten !== null) {
        return origDispatch.call(
          this,
          new MessageEvent("message", {
            data: rewritten,
            origin: event.origin,
            lastEventId: event.lastEventId,
            ports: event.ports ? [...event.ports] : [],
            source: event.source ?? null,
          }),
        );
      }
    }
    return origDispatch.call(this, event);
  };

  const descriptor = Object.getOwnPropertyDescriptor(proto, "onmessage");
  if (descriptor && descriptor.set && descriptor.get) {
    Object.defineProperty(proto, "onmessage", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        descriptor.set.call(this, typeof value === "function" ? wrapMessageListener(value) : value);
      },
    });
  }

  proto.addEventListener.__perfSkinFilter = FILTER_VERSION;
}

function installFetchFilter() {
  const original = window.fetch;
  if (typeof original !== "function" || original.__perfSkinFilter === FILTER_VERSION) return;
  if (!rawFetch) rawFetch = original.__perfOriginalFetch || original;

  const wrapped = function (input, init) {
    const url =
    typeof input === "string"
      ? input
      : typeof input?.url === "string"
        ? input.url
        : typeof input?.href === "string"
          ? input.href
          : "";
    const promise = original.call(this, input, init);
    if (!filterState.active || currentChampionId === null || url.split("?")[0].indexOf(CAROUSEL_URI) === -1) return promise;
    return promise.then((response) => {
      if (!response || !response.ok) return response;
      let body;
      try {
        body = response.clone();
      } catch {
        return response;
      }
      return body
        .json()
        .catch(() => null)
        .then((json) => {
          const kept = filterSkinList(json);
          recordClientOrder(kept ?? json);
          if (!kept) return response;
          return new Response(JSON.stringify(kept), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        });
    });
  };
  wrapped.__perfSkinFilter = FILTER_VERSION;
  wrapped.__perfOriginalFetch = rawFetch;
  window.fetch = wrapped;
}

function installXhrFilter() {
  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (!proto || proto.open.__perfSkinFilter === FILTER_VERSION) return;

  const origOpen = proto.open;
  const origSend = proto.send;
  const textDescriptor = Object.getOwnPropertyDescriptor(proto, "responseText");
  const responseDescriptor = Object.getOwnPropertyDescriptor(proto, "response");

  proto.open = function (method, url, ...rest) {
    this.__perfSkinUrl = typeof url === "string" ? url : "";
    return origOpen.call(this, method, url, ...rest);
  };
  proto.open.__perfSkinFilter = FILTER_VERSION;

  proto.send = function (...args) {
    const url = this.__perfSkinUrl || "";
    if (textDescriptor && textDescriptor.get && url.split("?")[0].indexOf(CAROUSEL_URI) !== -1) {
      const xhr = this;
      const cache = { raw: null, filtered: null };
      const filteredText = () => {
        const raw = textDescriptor.get.call(xhr);
        if (!filterState.active || currentChampionId === null) return raw;
        if (cache.filtered === null || cache.raw !== raw) {
          cache.raw = raw;
          cache.filtered = raw;
          try {
            const json = JSON.parse(raw);
            const kept = filterSkinList(json);
            recordClientOrder(kept ?? json);
            if (kept) cache.filtered = JSON.stringify(kept);
          } catch {
          }
        }
        return cache.filtered;
      };
      Object.defineProperty(xhr, "responseText", { configurable: true, get: filteredText });
      if (responseDescriptor && responseDescriptor.get) {
        Object.defineProperty(xhr, "response", {
          configurable: true,
          get() {
            return xhr.responseType === "" || xhr.responseType === "text" ? filteredText() : responseDescriptor.get.call(xhr);
          },
        });
      }
    }
    return origSend.apply(this, args);
  };
}

function installSourceFilter() {
  try {
    filterState.active = readDefaultEnabled();
    installArrayFilter();
    installWebSocketFilter();
    installFetchFilter();
    installXhrFilter();
  } catch (error) {
    logError("could not install the source filter.", error);
  }
}

function ensureSourceFilter() {
  try {
    installArrayFilter();
    installWebSocketFilter();
    installFetchFilter();
    installXhrFilter();
  } catch (error) {
    logError("could not refresh the source filter.", error);
  }
}

let api = null;
let summonerId = null;
let ownedSkinIds = null;
let allSkinIds = null;
let topLevelOrder = [];
let ownedTopLevelIds = null;
let currentChampionId = null;
let carouselOrder = [];
let failure = null;
let requestToken = 0;
let refreshTimer = null;
let unsubscribe = null;
let pollInFlight = false;
let selectInFlight = false;
let sessionMisses = 0;
let championMisses = 0;
let renderObserver = null;
let removeStyle = null;

function logError(scope, error) {
  console.error(`[Perfectionist] Hide Unowned Skins: ${scope}`, error);
}

function skinSuffixOf(text) {
  const numbered = text.match(/Skins\/Skin(\d+)\//i) ?? text.match(/skin(\d+)\//i);
  if (numbered) return Number(numbered[1]);
  return /Skins\/Base\//i.test(text) ? 0 : null;
}

const skinIdCache = new WeakMap();

function readSkinId(item) {
  const img = item.querySelector("img[src]");
  const src = img ? img.getAttribute("src") || "" : "";
  const art = item.querySelector('[style*="background-image"]');
  const background = art ? art.style.backgroundImage || "" : "";
  const key = src + "|" + background;
  const cached = skinIdCache.get(item);
  if (cached && cached.key === key) return cached.id;
  let suffix = src ? skinSuffixOf(src) : null;
  if (suffix === null && background) suffix = skinSuffixOf(background);
  if (suffix === null) suffix = skinSuffixOf(item.getAttribute("style") || "");
  const id = suffix === null || currentChampionId === null ? null : currentChampionId * 1000 + suffix;
  skinIdCache.set(item, { key, id });
  return id;
}

function hideTargetFor(item) {
  let target = item;
  for (let depth = 0; depth < 2; depth++) {
    const parent = target.parentElement;
    if (!parent || parent.children.length !== 1) break;
    target = parent;
  }
  return target;
}

function setHidden(element, hide) {
  if (element.classList.contains(HIDDEN_CLASS) !== hide) element.classList.toggle(HIDDEN_CLASS, hide);
}

function applyAll() {
  const items = [...document.querySelectorAll(SKIN_ITEM_SELECTOR)];
  let hidden = 0;
  items.forEach((item) => {
    const skinId = currentChampionId === null ? null : readSkinId(item);
    const hide = ownedSkinIds !== null && skinId !== null && allSkinIds !== null && allSkinIds.has(skinId) && !ownedSkinIds.has(skinId);
    if (hide) hidden++;
    setHidden(item, hide);
    setHidden(hideTargetFor(item), hide);
  });

  const dots = [...document.querySelectorAll(DOT_SELECTOR)];
  const dotOrder =
    topLevelOrder.length === dots.length
      ? topLevelOrder
      : carouselOrder.length === dots.length
        ? carouselOrder
        : [];
  let dotsHidden = 0;
  const dotsMapped = dotOrder.length > 0;
  dots.forEach((dot, index) => {
    const skinId = dotsMapped ? dotOrder[index] : undefined;
    const hide = ownedTopLevelIds !== null && skinId !== undefined && !ownedTopLevelIds.has(skinId);
    if (hide) dotsHidden++;
    setHidden(dot, hide);
  });
}

let applyQueued = false;

function scheduleApply() {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => {
    applyQueued = false;
    ensureSourceFilter();
    if (currentChampionId === null) return;
    const item = document.querySelector(SKIN_ITEM_SELECTOR);
    if (!item && !document.querySelector(DOT_SELECTOR)) return;
    applyAll();
    if (item) scheduleRefresh();
  });
}

async function loadOwnedSkins(championId) {
  if (summonerId === null) {
    const summoner = await api.lcu.get(CURRENT_SUMMONER_URI, { ttl: SUMMONER_TTL });
    summonerId = summoner.summonerId;
  }
  const skins = await api.lcu.get(
    `/lol-champions/v1/inventories/${summonerId}/champions/${championId}/skins`,
    { ttl: INVENTORY_TTL },
  );
  if (!Array.isArray(skins) || skins.length === 0) {
    throw new Error(`no skin inventory returned for champion ${championId}`);
  }
  const all = new Set();
  const owned = new Set();
  const topLevel = [];
  const ownedTopLevel = new Set();
  for (const skin of skins) {
    if (typeof skin?.id === "number") {
      topLevel.push(skin.id);
      if (skin.ownership?.owned) ownedTopLevel.add(skin.id);
    }
    const variants = [
      skin,
      ...(Array.isArray(skin.chromas) ? skin.chromas : []),
      ...(Array.isArray(skin.questSkinInfo?.tiers) ? skin.questSkinInfo.tiers : []),
    ];
    for (const variant of variants) {
      if (typeof variant?.id !== "number") continue;
      all.add(variant.id);
      if (variant.ownership?.owned) owned.add(variant.id);
    }
  }
  const order = [...all].sort((a, b) => a - b);
  return { owned, order, topLevel, ownedTopLevel };
}

async function loadCarouselOrder() {
  const preferred = clientSkinOrder.length > 0 ? [...clientSkinOrder] : null;
  try {
    let skins;
    if (typeof rawFetch === "function") {
      let timer;
      try {
        const response = await Promise.race([
          rawFetch(CAROUSEL_URI, { headers: { Accept: "application/json" } }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("carousel request timed out")), 8000);
          }),
        ]);
        skins = response.ok ? await response.json() : null;
      } finally {
        clearTimeout(timer);
      }
    } else {
      skins = await api.lcu.get(CAROUSEL_URI);
    }
    learnSkinShape(skins);
    if (preferred) return preferred;
    if (!Array.isArray(skins)) return [];
    return skins.map((skin) => skin?.id).filter((id) => typeof id === "number");
  } catch {
    return preferred ?? [];
  }
}

function nextOwnedSkin(owned, fromId, direction) {
  const ids = [...owned].sort((a, b) => a - b);
  if (ids.length === 0) return null;
  if (direction > 0) return ids.find((id) => id > fromId) ?? ids[0];
  return [...ids].reverse().find((id) => id < fromId) ?? ids[ids.length - 1];
}

async function selectSkin(skinId) {
  selectInFlight = true;
  const guard = setTimeout(() => {
    selectInFlight = false;
  }, 8000);
  try {
    await api.lcu.send("PATCH", SELECTION_URI, { selectedSkinId: skinId });
  } finally {
    clearTimeout(guard);
    selectInFlight = false;
  }
}

function resetState() {
  requestToken++;
  ownedSkinIds = null;
  allSkinIds = null;
  topLevelOrder = [];
  ownedTopLevelIds = null;
  currentChampionId = null;
  carouselOrder = [];
  clientSkinOrder = [];
  failure = null;
  sessionMisses = 0;
  championMisses = 0;
  applyAll();
}

function loadChampion(championId) {
  currentChampionId = championId;
  ownedSkinIds = null;
  allSkinIds = null;
  topLevelOrder = [];
  ownedTopLevelIds = null;
  failure = null;
  clientSkinOrder = [];
  const token = ++requestToken;

  Promise.all([loadOwnedSkins(championId), loadCarouselOrder()]).then(
    ([{ owned, order: inventoryOrder, topLevel, ownedTopLevel }, carouselIds]) => {
      if (token !== requestToken) return;
      ownedSkinIds = owned;
      allSkinIds = new Set(inventoryOrder);
      topLevelOrder = topLevel;
      ownedTopLevelIds = ownedTopLevel;
      carouselOrder = carouselIds.length > 0 ? carouselIds : inventoryOrder;
      applyAll();
    },
    (error) => {
      if (token !== requestToken) return;
      logError(`could not load owned skins for champion ${championId}.`, error);
      failure = { championId, message: error.message, retryAt: Date.now() + RETRY_MS };
      currentChampionId = null;
    },
  );
}

function updateForSession(session, selection) {
  const me = session?.myTeam?.find((player) => player.cellId === session.localPlayerCellId);
  const championId = me?.championId || me?.championPickIntent || null;

  if (!championId) {
    championMisses++;
    if (championMisses >= 2) resetState();
    return;
  }
  championMisses = 0;

  if (championId !== currentChampionId) {
    if (failure?.championId === championId && Date.now() < failure.retryAt) return;
    loadChampion(championId);
  }

  if (ownedSkinIds === null) return;

  const serverSkinId = selection?.selectedSkinId || me.selectedSkinId || null;

  const knownUnownedSkin = allSkinIds !== null && allSkinIds.has(serverSkinId) && !ownedSkinIds.has(serverSkinId);
  if (!selectInFlight && knownUnownedSkin) {
    const fallback = nextOwnedSkin(ownedTopLevelIds ?? ownedSkinIds, 0, 1);
    if (fallback !== null) {
      selectSkin(fallback).catch((error) => logError("could not correct the selected skin.", error));
    }
  }

  applyAll();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(pollSession, REFRESH_DEBOUNCE_MS);
}

function onSessionPush(raw) {
  const msg = raw ?? {};
  if (msg.eventType === "Delete") {
    resetState();
    return;
  }
  const s = msg.data ?? msg;
  if (!s?.myTeam) return;
  updateForSession(s, null);
}

async function pollSession() {
  if (pollInFlight || !api) return;
  ensureSourceFilter();
  pollInFlight = true;
  try {
    const session = await api.lcu.get(SESSION_URI);
    sessionMisses = 0;
    const selection = await api.lcu.get(SELECTION_URI).catch(() => null);
    updateForSession(session, selection);
  } catch {
    sessionMisses++;
    if (sessionMisses >= 3) resetState();
  } finally {
    pollInFlight = false;
  }
}

function onEnable(utils) {
  api = utils;
  filterState.active = true;
  removeStyle = api.addStyle(STYLE_ID, CSS);

  renderObserver = new MutationObserver(scheduleApply);
  renderObserver.observe(document.documentElement ?? document, OBSERVER_OPTIONS);

  unsubscribe = api.subscribe(SESSION_URI, onSessionPush);
  pollSession();
}

function onDisable() {
  unsubscribe?.();
  unsubscribe = null;
  clearTimeout(refreshTimer);
  refreshTimer = null;
  renderObserver?.disconnect();
  removeStyle?.();
  renderObserver = null;
  removeStyle = null;
  filterState.active = false;

  resetState();
  document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((item) => item.classList.remove(HIDDEN_CLASS));
  api = null;
}

export function init() {
  installSourceFilter();

  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Hide Unowned Skins",
      description: "In champion select, only shows the skins you own for the picked champion.",
      version,
      onEnable,
      onDisable,
    });
  };

  if (window.PerfectionistUtils) {
    registerWith(window.PerfectionistUtils);
  } else {
    addEventListener("perfectionist:utils-ready", (event) => registerWith(event.detail), { once: true });
  }
}