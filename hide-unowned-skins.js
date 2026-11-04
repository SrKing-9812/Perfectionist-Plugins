export const version = "2.5.0";

const PLUGIN_ID = "hide-unowned-skins";
const STYLE_ID = "perfectionist-hide-unowned-skins-style";
const HIDDEN_CLASS = "perf-unowned-skin-hidden";
const SKIN_ITEM_SELECTOR = ".skin-selection-item";
const DOT_SELECTOR = ".skin-selection-indicator-selector";
const SELECTED_CLASS = "skin-selection-item-selected";
const SESSION_URI = "/lol-champ-select/v1/session";
const SELECTION_URI = "/lol-champ-select/v1/session/my-selection";
const CAROUSEL_URI = "/lol-champ-select/v1/skin-carousel-skins";
const CURRENT_SUMMONER_URI = "/lol-summoner/v1/current-summoner";
const SUMMONER_TTL = 10 * 60 * 1000;
const INVENTORY_TTL = 60 * 1000;
const REFRESH_DEBOUNCE_MS = 350;
const REPACK_SETTLE_MS = 120;
const RETRY_MS = 5000;
const STATE_KEY = "perfectionist-plugins:state";

const CSS = `
.${HIDDEN_CLASS} { display: none !important; margin: 0 !important; padding: 0 !important; border: none !important; pointer-events: none !important; }
[data-perf-dots] { justify-content: center !important; }
`;

const OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "style", "src"],
};

let filterActive = true;
let rawFetch = null;
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
  const ownership = skin.ownership;
  if (ownership && typeof ownership.owned === "boolean") return ownership.owned;
  return true;
}

function filterSkinList(list) {
  if (!Array.isArray(list)) return null;
  const kept = list.filter(isOwnedSkin);
  return kept.length === list.length ? null : kept;
}

function recordClientOrder(list) {
  scheduleRefresh();
  if (Array.isArray(list)) {
    clientSkinOrder = list.map((skin) => (skin && typeof skin.id === "number" ? skin.id : null)).filter((id) => id !== null);
  }
}

function rewriteWebSocketFrame(text) {
  if (!filterActive || typeof text !== "string") return null;
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
  if (!proto || proto.addEventListener.__perfSkinFilter) return;

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

  proto.addEventListener.__perfSkinFilter = true;
}

function installFetchFilter() {
  const original = window.fetch;
  if (typeof original !== "function" || original.__perfSkinFilter) return;
  if (!rawFetch) rawFetch = original;

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
    if (!filterActive || url.split("?")[0].indexOf(CAROUSEL_URI) === -1) return promise;
    return promise.then((response) => {
      if (!response || !response.ok) return response;
      return response
        .clone()
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
  wrapped.__perfSkinFilter = true;
  window.fetch = wrapped;
}

function installXhrFilter() {
  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (!proto || proto.open.__perfSkinFilter) return;

  const origOpen = proto.open;
  const origSend = proto.send;
  const textDescriptor = Object.getOwnPropertyDescriptor(proto, "responseText");
  const responseDescriptor = Object.getOwnPropertyDescriptor(proto, "response");

  proto.open = function (method, url, ...rest) {
    this.__perfSkinUrl = typeof url === "string" ? url : "";
    return origOpen.call(this, method, url, ...rest);
  };
  proto.open.__perfSkinFilter = true;

  proto.send = function (...args) {
    const url = this.__perfSkinUrl || "";
    if (textDescriptor && textDescriptor.get && url.split("?")[0].indexOf(CAROUSEL_URI) !== -1) {
      const xhr = this;
      const cache = { raw: null, filtered: null };
      const filteredText = () => {
        const raw = textDescriptor.get.call(xhr);
        if (!filterActive) return raw;
        if (cache.filtered === null || cache.raw !== raw) {
          cache.raw = raw;
          cache.filtered = raw;
          try {
            const json = JSON.parse(raw);
            const kept = filterSkinList(json);
            recordClientOrder(kept ?? json);
            if (kept) cache.filtered = JSON.stringify(kept);
          } catch {}
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
    filterActive = readDefaultEnabled();
    installWebSocketFilter();
    installFetchFilter();
    installXhrFilter();
  } catch (error) {
    logError("could not install the source filter.", error);
  }
}

function ensureSourceFilter() {
  try {
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
let currentChampionId = null;
let carouselOrder = [];
let selectedSkinId = null;
let lastServerSkinId = null;
let failure = null;
let requestToken = 0;
let refreshTimer = null;
let unsubscribe = null;
let pollInFlight = false;
let selectInFlight = false;
let sessionMisses = 0;
let championMisses = 0;
let renderObserver = null;
let repackTimer = null;
let removeStyle = null;
let lastSelectedDomIndex = -1;
let navFixAt = 0;
let lastSkipSignature = null;
let itemSkinIds = new WeakMap();
const repackOriginals = new Map();
const lastAppliedLeft = new Map();
const skinSuffixCache = new Map();
const widthCache = new Map();

function logError(scope, error) {
  console.error(`[Perfectionist] Hide Unowned Skins: ${scope}`, error);
}

function skinSuffixOf(text) {
  const numbered = text.match(/Skins\/Skin(\d+)\//i) ?? text.match(/skin(\d+)\//i);
  if (numbered) return Number(numbered[1]);
  return /Skins\/Base\//i.test(text) ? 0 : null;
}

function skinIdFromImages(item) {
  if (currentChampionId === null) return null;
  for (const img of item.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    let suffix = skinSuffixCache.get(src);
    if (suffix === undefined) {
      suffix = skinSuffixOf(src);
      skinSuffixCache.set(src, suffix);
    }
    if (suffix !== null) return currentChampionId * 1000 + suffix;
  }
  const suffix = skinSuffixOf(item.innerHTML);
  return suffix === null ? null : currentChampionId * 1000 + suffix;
}

function readSkinId(item) {
  return itemSkinIds.get(item) ?? skinIdFromImages(item);
}

function effectiveOrder() {
  return clientSkinOrder.length > 0 ? clientSkinOrder : carouselOrder;
}

function mapCarouselToItems(items) {
  const order = effectiveOrder();
  itemSkinIds = new WeakMap();
  if (order.length === 0 || order.length !== items.length) return false;
  items.forEach((item, index) => {
    const id = order[index];
    if (typeof id === "number") itemSkinIds.set(item, id);
  });
  return true;
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

function pruneRepack() {
  for (const item of [...repackOriginals.keys()]) {
    if (item.isConnected) continue;
    repackOriginals.delete(item);
    lastAppliedLeft.delete(item);
  }
}

function guardSelection(items) {
  const selectedIndex = items.findIndex((item) => item.classList.contains(SELECTED_CLASS));
  if (selectedIndex < 0) return false;
  const previous = lastSelectedDomIndex;
  lastSelectedDomIndex = selectedIndex;
  const selected = items[selectedIndex];
  const hidden = selected.classList.contains(HIDDEN_CLASS) || Boolean(selected.parentElement?.classList.contains(HIDDEN_CLASS));
  if (!hidden) {
    lastSkipSignature = null;
    return false;
  }

  const visible = items.map((item, index) => (item.classList.contains(HIDDEN_CLASS) ? -1 : index)).filter((index) => index >= 0);
  if (visible.length === 0) return false;

  const forward = previous < 0 ? true : selectedIndex >= previous;
  const target = forward
    ? (visible.find((index) => index > selectedIndex) ?? visible[0])
    : ([...visible].reverse().find((index) => index < selectedIndex) ?? visible[visible.length - 1]);
  const skinId = readSkinId(items[target]);
  if (skinId === null) return false;

  const signature = `${selectedIndex}:${skinId}`;
  if (lastSkipSignature === signature) return true;
  const now = Date.now();
  if (now < navFixAt) return true;
  navFixAt = now + 150;
  lastSkipSignature = signature;
  lastSelectedDomIndex = target;
  selectSkin(skinId).catch((error) => logError("could not skip the unowned skin.", error));
  return true;
}

function leftToPx(item, raw) {
  if (!raw) return 0;
  if (raw.endsWith("px")) return parseFloat(raw);
  if (raw.endsWith("%")) return (parseFloat(raw) / 100) * (item.parentElement?.offsetWidth || 468);
  return 0;
}

function originalLeftOf(item) {
  const original = repackOriginals.get(item);
  return leftToPx(item, original ? original.value : item.style.getPropertyValue("left"));
}

function refreshOriginal(item) {
  const current = item.style.getPropertyValue("left");
  const priority = item.style.getPropertyPriority("left");
  const last = lastAppliedLeft.get(item);
  if (last !== undefined && current === last && priority === "important") return;
  repackOriginals.set(item, { value: current, priority });
  lastAppliedLeft.delete(item);
}

function widthOf(item, anchor) {
  if (item.offsetWidth > 0) {
    widthCache.set(item, item.offsetWidth);
    return item.offsetWidth;
  }
  const measured = item.getBoundingClientRect().width;
  if (measured > 0) {
    widthCache.set(item, measured);
    return measured;
  }
  return widthCache.get(item) ?? (item === anchor ? 117 : 73);
}

function repackVisibleItems(items) {
  pruneRepack();
  const visible = items.filter((item) => !item.classList.contains(HIDDEN_CLASS));
  if (visible.length < 2) {
    restoreRepack();
    return;
  }

  const selectedIndex = items.findIndex((item) => item.classList.contains(SELECTED_CLASS));
  let anchor = selectedIndex >= 0 ? items[selectedIndex] : null;
  if (!anchor && selectedSkinId !== null) {
    anchor = visible.find((item) => readSkinId(item) === selectedSkinId) ?? null;
  }
  if (!anchor) anchor = visible[Math.floor(visible.length / 2)];
  const anchorDomIndex = items.indexOf(anchor);
  refreshOriginal(anchor);
  const anchorLeft = originalLeftOf(anchor);

  const setLeft = (item, x) => {
    const want = `${x}px`;
    const current = item.style.getPropertyValue("left");
    const priority = item.style.getPropertyPriority("left");
    const last = lastAppliedLeft.get(item);
    const clientMoved = last !== undefined && (current !== last || priority !== "important");
    if (clientMoved || !repackOriginals.has(item)) {
      repackOriginals.set(item, { value: current, priority });
    }
    if (current !== want || priority !== "important") {
      item.style.setProperty("left", want, "important");
    }
    lastAppliedLeft.set(item, want);
  };

  let rightX = anchorLeft + widthOf(anchor, anchor);
  for (let index = anchorDomIndex + 1; index < items.length; index++) {
    const item = items[index];
    if (item.classList.contains(HIDDEN_CLASS)) continue;
    const width = widthOf(item, anchor);
    setLeft(item, rightX);
    rightX += width;
  }

  let leftX = anchorLeft;
  for (let index = anchorDomIndex - 1; index >= 0; index--) {
    const item = items[index];
    if (item.classList.contains(HIDDEN_CLASS)) continue;
    const width = widthOf(item, anchor);
    leftX -= width;
    setLeft(item, leftX);
  }
}

function restoreRepack() {
  for (const [item, original] of repackOriginals) {
    if (!item.isConnected) continue;
    const current = item.style.getPropertyValue("left");
    const last = lastAppliedLeft.get(item);
    if (last !== undefined && (current !== last || item.style.getPropertyPriority("left") !== "important")) continue;
    if (original.value) item.style.setProperty("left", original.value, original.priority || undefined);
    else item.style.removeProperty("left");
  }
  repackOriginals.clear();
  lastAppliedLeft.clear();
}

function applyAll() {
  const items = [...document.querySelectorAll(SKIN_ITEM_SELECTOR)];
  mapCarouselToItems(items);
  let hidden = 0;
  items.forEach((item) => {
    const skinId = currentChampionId === null ? null : readSkinId(item);
    const hide = ownedSkinIds !== null && skinId !== null && allSkinIds !== null && allSkinIds.has(skinId) && !ownedSkinIds.has(skinId);
    if (hide) hidden++;
    item.classList.toggle(HIDDEN_CLASS, hide);
    hideTargetFor(item).classList.toggle(HIDDEN_CLASS, hide);
  });

  const dots = [...document.querySelectorAll(DOT_SELECTOR)];
  let dotsHidden = 0;
  const dotOrder = effectiveOrder();
  const dotsMapped = dotOrder.length > 0 && dots.length === dotOrder.length;
  dots.forEach((dot, index) => {
    const skinId = dotsMapped ? dotOrder[index] : undefined;
    const hide = ownedSkinIds !== null && skinId !== undefined && allSkinIds !== null && allSkinIds.has(skinId) && !ownedSkinIds.has(skinId);
    if (hide) dotsHidden++;
    dot.classList.toggle(HIDDEN_CLASS, hide);
  });
  const dotList = dots[0]?.parentElement;
  if (dotList) {
    if (dotsHidden > 0 && !dotList.hasAttribute("data-perf-dots")) dotList.setAttribute("data-perf-dots", "");
    else if (dotsHidden === 0 && dotList.hasAttribute("data-perf-dots")) dotList.removeAttribute("data-perf-dots");
  }

  if (ownedSkinIds !== null && hidden > 0) {
    if (guardSelection(items)) runRepack();
    else scheduleRepack();
  } else if (hidden === 0) restoreRepack();
}

function scheduleRepack() {
  clearTimeout(repackTimer);
  repackTimer = setTimeout(runRepack, REPACK_SETTLE_MS);
}

function runRepack() {
  repackTimer = null;
  renderObserver?.disconnect();
  try {
    const items = [...document.querySelectorAll(SKIN_ITEM_SELECTOR)];
    const hidden = items.some((item) => item.classList.contains(HIDDEN_CLASS));
    if (ownedSkinIds !== null && hidden) repackVisibleItems(items);
    else restoreRepack();
  } finally {
    renderObserver?.observe(document.documentElement ?? document, OBSERVER_OPTIONS);
  }
}

function applyAllGuarded() {
  renderObserver?.disconnect();
  try {
    applyAll();
  } finally {
    renderObserver?.observe(document.documentElement ?? document, OBSERVER_OPTIONS);
  }
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
  const order = skins
    .map((skin) => skin?.id)
    .filter((id) => typeof id === "number")
    .sort((a, b) => a - b);
  return { owned: new Set(skins.filter((skin) => skin.ownership?.owned).map((skin) => skin.id)), order };
}

async function loadCarouselOrder() {
  if (clientSkinOrder.length > 0) return [...clientSkinOrder];
  try {
    let skins;
    if (rawFetch) {
      let timer = null;
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
    if (!Array.isArray(skins)) return [];
    return skins.map((skin) => skin?.id).filter((id) => typeof id === "number");
  } catch {
    return [];
  }
}

function nextOwnedSkin(owned, fromId, direction) {
  const ids = [...owned].sort((a, b) => a - b);
  if (ids.length === 0) return null;
  if (direction > 0) return ids.find((id) => id > fromId) ?? ids[0];
  return [...ids].reverse().find((id) => id < fromId) ?? ids[ids.length - 1];
}

async function selectSkin(skinId) {
  selectedSkinId = skinId;
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
  currentChampionId = null;
  selectedSkinId = null;
  carouselOrder = [];
  clientSkinOrder = [];
  failure = null;
  sessionMisses = 0;
  championMisses = 0;
  applyAllGuarded();
}

function loadChampion(championId) {
  currentChampionId = championId;
  ownedSkinIds = null;
  allSkinIds = null;
  failure = null;
  clientSkinOrder = [];
  const token = ++requestToken;

  Promise.all([loadOwnedSkins(championId), loadCarouselOrder()]).then(
    ([{ owned, order: inventoryOrder }, carouselIds]) => {
      if (token !== requestToken) return;
      ownedSkinIds = owned;
      allSkinIds = new Set(inventoryOrder);
      carouselOrder = carouselIds.length > 0 ? carouselIds : inventoryOrder;
      applyAllGuarded();
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
  const belongsToChampion = serverSkinId !== null && Math.floor(serverSkinId / 1000) === championId;
  if (!selectInFlight && belongsToChampion) selectedSkinId = serverSkinId;

  const knownUnownedSkin = allSkinIds !== null && allSkinIds.has(serverSkinId) && !ownedSkinIds.has(serverSkinId);
  if (!selectInFlight && knownUnownedSkin) {
    const direction = lastServerSkinId !== null && serverSkinId !== null && serverSkinId < lastServerSkinId ? -1 : 1;
    const fallback = nextOwnedSkin(ownedSkinIds, serverSkinId ?? 0, direction) ?? nextOwnedSkin(ownedSkinIds, 0, 1);
    if (fallback !== null) {
      selectSkin(fallback).catch((error) => logError("could not correct the selected skin.", error));
    }
  }
  if (!selectInFlight && belongsToChampion && ownedSkinIds.has(serverSkinId)) lastServerSkinId = serverSkinId;

  applyAllGuarded();
}

function onWindowResize() {
  scheduleRepack();
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
  filterActive = true;
  removeStyle = api.addStyle(STYLE_ID, CSS);

  renderObserver = new MutationObserver(() => {
    ensureSourceFilter();
    const item = document.querySelector(SKIN_ITEM_SELECTOR);
    if (!item && !document.querySelector(DOT_SELECTOR)) return;
    applyAllGuarded();
    if (item) scheduleRefresh();
  });
  renderObserver.observe(document.documentElement ?? document, OBSERVER_OPTIONS);

  window.addEventListener("resize", onWindowResize);
  unsubscribe = api.subscribe(SESSION_URI, onSessionPush);
  pollSession();
}

function onDisable() {
  window.removeEventListener("resize", onWindowResize);
  unsubscribe?.();
  unsubscribe = null;
  clearTimeout(refreshTimer);
  refreshTimer = null;
  clearTimeout(repackTimer);
  repackTimer = null;
  renderObserver?.disconnect();
  removeStyle?.();
  renderObserver = null;
  removeStyle = null;
  filterActive = false;

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
      defaultEnabled: true,
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
