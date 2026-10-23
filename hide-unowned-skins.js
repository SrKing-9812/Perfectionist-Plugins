/*
 * hide-unowned-skins.js
 * Hide Unowned Skins (Perfectionism, Pengu Loader).
 *
 * In champ select, the skin carousel only shows the skins you own for the picked champion.
 * Unowned skins are stripped from the carousel data before the client renders it (socket
 * pushes and fetch/XHR responses), with a DOM safety net for anything that slips through.
 *
 * Requires perfectionist-utils.js.
 */

export const version = "2.1.0";

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
const SESSION_POLL_MS = 1000;
const RETRY_MS = 5000;
const STATE_KEY = "perfectionist-plugins:state";

const CSS = `
.${HIDDEN_CLASS} { display: none !important; margin: 0 !important; padding: 0 !important; border: none !important; }
/* Visible dots are centred, so the hidden ones leave no gap in the row. */
[data-perf-dots] { justify-content: center !important; }
`;

const OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "style"],
};

/* ---- source filter: unowned skins never reach the client's carousel ---- */

let filterActive = true;
let rawFetch = null; // the unfiltered fetch, kept for the plugin's own reads of the carousel order
let clientSkinOrder = []; // skin ids the client actually received, in order

/** Saved plugin state decides the filter at boot; onEnable / onDisable update it afterwards. */
function readDefaultEnabled() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    return saved[PLUGIN_ID] !== false;
  } catch {
    return true;
  }
}

/** A skin is kept when owned; the base skin always is. Unknown ownership is left to the DOM net. */
function isOwnedSkin(skin) {
  if (!skin || typeof skin !== "object") return true;
  const id = typeof skin.id === "number" ? skin.id : null;
  if (id === null) return true;
  if (id % 1000 === 0) return true;
  const ownership = skin.ownership;
  if (ownership && typeof ownership.owned === "boolean") return ownership.owned;
  return true;
}

/** Returns the owned-only list, or null when nothing was removed. */
function filterSkinList(list) {
  if (!Array.isArray(list)) return null;
  const kept = list.filter(isOwnedSkin);
  return kept.length === list.length ? null : kept;
}

/** Remembers the list the client received (in order) so the DOM net can map the page dots correctly. */
function recordClientOrder(list) {
  if (Array.isArray(list)) {
    clientSkinOrder = list.map((skin) => (skin && typeof skin.id === "number" ? skin.id : null)).filter((id) => id !== null);
  }
}

/** Rewrites a CoreSocket frame ([eventId, topic, { uri, eventType, data }]) for the carousel push; null when not ours. */
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

/** Wraps a WebSocket "message" listener so it only ever sees owned skins. */
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

/** Filters matching WebSocket frames before any message listener runs. */
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

/** Filters matching fetch() responses (the data-binding may snapshot the endpoint over REST). */
function installFetchFilter() {
  const original = window.fetch;
  if (typeof original !== "function" || original.__perfSkinFilter) return;
  // Keep the first captured fetch: it is the unfiltered one, and the plugin's own reads need it.
  if (!rawFetch) rawFetch = original;

  const wrapped = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
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

/**
 * Filters matching XHR responses (jQuery ajax and getJson go through XHR). The response is
 * filtered lazily in the responseText / response getters: consumers read it the moment it arrives.
 */
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
          } catch {
            /* not JSON, leave the response alone */
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
    filterActive = readDefaultEnabled();
    installWebSocketFilter();
    installFetchFilter();
    installXhrFilter();
  } catch (error) {
    logError("could not install the source filter.", error);
  }
}

/** Re-applies the wrappers after the client's own instrumentation replaces them; double filtering is harmless. */
function ensureSourceFilter() {
  try {
    installWebSocketFilter();
    installFetchFilter();
    installXhrFilter();
  } catch (error) {
    logError("could not refresh the source filter.", error);
  }
}

/* ---- DOM safety net: hide and repack whatever the source filter misses ---- */

let api = null;
let summonerId = null;
let ownedSkinIds = null; // Set of owned skin ids for the current champion, null while unknown
let currentChampionId = null;
let carouselOrder = []; // Skin ids in carousel order, used to map the page dots
let selectedSkinId = null;
let failure = null; // { championId, message, retryAt } after a failed inventory load
let requestToken = 0;
let pollTimer = null;
let pollInFlight = false;
let selectInFlight = false;
let sessionMisses = 0; // consecutive failed session reads before state is cleared
let championMisses = 0; // consecutive polls without a champion before state is cleared
let renderObserver = null; // Re-applies the hiding whenever the client re-renders the carousel
const repackOriginals = new Map(); // item -> its native inline left, restored when nothing is hidden
let removeStyle = null;

function logError(scope, error) {
  console.error(`[Perfectionist] Hide Unowned Skins: ${scope}`, error);
}

/**
 * Reads a carousel item's skin id from its markup (thumbnails live in .../Skins/Skin<n>/).
 * Items without a readable id are left alone.
 */
function readSkinId(item) {
  const html = item.innerHTML;
  const numbered = html.match(/Skins\/Skin(\d+)\//i) ?? html.match(/Skin(\d+)\//);
  if (numbered) return currentChampionId * 1000 + Number(numbered[1]);
  if (/Skins\/Base\//i.test(html)) return currentChampionId * 1000;
  return null;
}

/** The element to hide: climbs to the wrapper when the item is its only child, so no empty slot is left. */
function hideTargetFor(item) {
  let target = item;
  for (let depth = 0; depth < 2; depth++) {
    const parent = target.parentElement;
    if (!parent || parent.children.length !== 1) break;
    target = parent;
  }
  return target;
}

/** Repacks visible items flush around the selected one so hidden items leave no gaps. */
function repackVisibleItems(items) {
  const visible = items.filter((item) => !item.classList.contains(HIDDEN_CLASS));
  if (visible.length < 2) return;

  const selectedIndex = items.findIndex((item) => item.classList.contains("skin-selection-item-selected"));
  const anchor = selectedIndex >= 0 ? items[selectedIndex] : visible[Math.floor(visible.length / 2)];
  const anchorDomIndex = items.indexOf(anchor);

  // The selected card is wider than its neighbours, so widths are read per item rather than assumed.
  const widthOf = (item) => item.getBoundingClientRect().width || (item === anchor ? 117 : 73);
  const toPx = (item) => {
    const raw = item.style.left || "0";
    if (raw.endsWith("px")) return parseFloat(raw);
    const box = item.parentElement?.getBoundingClientRect().width || 468;
    return (parseFloat(raw) / 100) * box;
  };

  // Pack outwards from the selected card: items before it go left, items after it go right.
  const anchorLeft = toPx(anchor);
  let rightX = anchorLeft + widthOf(anchor);
  let leftX = anchorLeft;

  // Only assign on change (no observer loop); the first overridden position is kept for restoreRepack.
  const setLeft = (item, x) => {
    const want = `${x}px`;
    if (item.style.getPropertyValue("left") !== want || item.style.getPropertyPriority("left") !== "important") {
      if (!repackOriginals.has(item)) {
        repackOriginals.set(item, {
          value: item.style.getPropertyValue("left"),
          priority: item.style.getPropertyPriority("left"),
        });
      }
      item.style.setProperty("left", want, "important");
    }
  };

  items.forEach((item, index) => {
    if (item === anchor || item.classList.contains(HIDDEN_CLASS)) return;

    const isRight = index > anchorDomIndex;
    const w = widthOf(item);
    if (isRight) {
      setLeft(item, rightX);
      rightX += w;
    } else {
      leftX -= w;
      setLeft(item, leftX);
    }
  });
}

/** Puts the carousel items the repack moved back at the client's own positions. */
function restoreRepack() {
  if (repackOriginals.size === 0) return;
  for (const [item, original] of repackOriginals) {
    if (original.value) item.style.setProperty("left", original.value, original.priority || undefined);
    else item.style.removeProperty("left");
  }
  repackOriginals.clear();
}

/** Shows or hides every carousel item, its wrapper and its page dot. Unknown ownership stays visible. */
function applyAll() {
  const items = [...document.querySelectorAll(SKIN_ITEM_SELECTOR)];
  let hidden = 0;
  items.forEach((item) => {
    const skinId = currentChampionId === null ? null : readSkinId(item);
    const hide = ownedSkinIds !== null && skinId !== null && !ownedSkinIds.has(skinId);
    if (hide) hidden++;
    item.classList.toggle(HIDDEN_CLASS, hide);
    hideTargetFor(item).classList.toggle(HIDDEN_CLASS, hide);
  });

  const dots = [...document.querySelectorAll(DOT_SELECTOR)];
  let dotsHidden = 0;
  // Dots are only mapped when their count matches the list the client received.
  const dotsMapped = carouselOrder.length > 0 && dots.length === carouselOrder.length;
  dots.forEach((dot, index) => {
    const skinId = dotsMapped ? carouselOrder[index] : undefined;
    const hide = ownedSkinIds !== null && skinId !== undefined && !ownedSkinIds.has(skinId);
    if (hide) dotsHidden++;
    dot.classList.toggle(HIDDEN_CLASS, hide);
  });
  const dotList = dots[0]?.parentElement;
  if (dotList) {
    if (dotsHidden > 0 && !dotList.hasAttribute("data-perf-dots")) dotList.setAttribute("data-perf-dots", "");
    else if (dotsHidden === 0 && dotList.hasAttribute("data-perf-dots")) dotList.removeAttribute("data-perf-dots");
  }

  // Only touch native positions when something was actually hidden.
  if (ownedSkinIds !== null && hidden > 0) repackVisibleItems(items);
  else if (hidden === 0) restoreRepack();
}

/** Applies the hiding without letting its own DOM changes retrigger the observer. */
function applyAllGuarded() {
  // Disconnect while applying so the changes cannot retrigger the observer.
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

/** Skin ids in carousel order; prefers the list the client received, falls back to the raw endpoint. */
async function loadCarouselOrder() {
  if (clientSkinOrder.length > 0) return [...clientSkinOrder];
  try {
    let skins;
    if (rawFetch) {
      const response = await rawFetch(CAROUSEL_URI, { headers: { Accept: "application/json" } });
      skins = response.ok ? await response.json() : null;
    } else {
      skins = await api.lcu.get(CAROUSEL_URI);
    }
    if (!Array.isArray(skins)) return [];
    return skins.map((skin) => skin?.id).filter((id) => typeof id === "number");
  } catch {
    return [];
  }
}

/** Next owned skin id in ascending order, wrapping around; null when nothing is owned. */
function nextOwnedSkin(owned, fromId, direction) {
  const ids = [...owned].sort((a, b) => a - b);
  if (ids.length === 0) return null;
  if (direction > 0) return ids.find((id) => id > fromId) ?? ids[0];
  return [...ids].reverse().find((id) => id < fromId) ?? ids[ids.length - 1];
}

/** Selects a skin through the client's own selection endpoint, so the carousel follows it. */
async function selectSkin(skinId) {
  selectedSkinId = skinId;
  selectInFlight = true;
  try {
    await api.lcu.send("PATCH", SELECTION_URI, { selectedSkinId: skinId });
  } finally {
    selectInFlight = false;
  }
}

/** Forgets the current champ select; only on real session loss, so transient errors cannot flash skins back. */
function resetState() {
  requestToken++;
  ownedSkinIds = null;
  currentChampionId = null;
  selectedSkinId = null;
  carouselOrder = [];
  clientSkinOrder = [];
  failure = null;
  sessionMisses = 0;
  championMisses = 0;
  applyAll();
}

/** Loads the owned skins for a champion. Results that arrive after a newer request are ignored. */
function loadChampion(championId) {
  currentChampionId = championId;
  ownedSkinIds = null;
  failure = null;
  // The client's list for the new champion arrives with the next carousel push.
  clientSkinOrder = [];
  const token = ++requestToken;

  Promise.all([loadOwnedSkins(championId), loadCarouselOrder()]).then(
    ([{ owned, order: inventoryOrder }, carouselIds]) => {
      if (token !== requestToken) return;
      ownedSkinIds = owned;
      // The carousel endpoint can return nothing; the inventory lists the same skins in the same order.
      carouselOrder = carouselIds.length > 0 ? carouselIds : inventoryOrder;
      applyAll();
    },
    (error) => {
      if (token !== requestToken) return;
      logError(`could not load owned skins for champion ${championId}.`, error);
      failure = { championId, message: error.message, retryAt: Date.now() + RETRY_MS };
      // Forget the champion so a later poll retries after RETRY_MS.
      currentChampionId = null;
    },
  );
}

/** Works out which champion the local player is on (locked in or hovered) and keeps the carousel in step. */
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

  // Keep the selection in step with the client. Only skins of this champion count.
  const serverSkinId = selection?.selectedSkinId || me.selectedSkinId || null;
  const belongsToChampion = serverSkinId !== null && Math.floor(serverSkinId / 1000) === championId;
  if (!selectInFlight && belongsToChampion) selectedSkinId = serverSkinId;

  // If the client selected a skin the player doesn't own, move to the first owned skin.
  if (!selectInFlight && belongsToChampion && !ownedSkinIds.has(serverSkinId)) {
    const fallback = nextOwnedSkin(ownedSkinIds, 0, 1);
    if (fallback !== null) {
      selectSkin(fallback).catch((error) => logError("could not correct the selected skin.", error));
    }
  }

  applyAll();
}

/** Reads the session and selection once a second to keep the carousel in step; errors outside champ select clear the state. */
async function pollSession() {
  if (pollInFlight || !api) return;
  ensureSourceFilter();
  pollInFlight = true;
  try {
    const [session, selection] = await Promise.all([
      api.lcu.get(SESSION_URI),
      api.lcu.get(SELECTION_URI).catch(() => null),
    ]);
    sessionMisses = 0;
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

  // The client re-creates carousel items and dots on selection changes; re-apply before the next paint.
  // document.body can still be null at Pengu boot, so observe the document element.
  renderObserver = new MutationObserver(() => applyAllGuarded());
  renderObserver.observe(document.documentElement ?? document, OBSERVER_OPTIONS);

  pollTimer = setInterval(pollSession, SESSION_POLL_MS);
  pollSession();
}

function onDisable() {
  clearInterval(pollTimer);
  pollTimer = null;
  renderObserver?.disconnect();
  removeStyle?.();
  renderObserver = null;
  removeStyle = null;
  filterActive = false;

  resetState();
  document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((item) => item.classList.remove(HIDDEN_CLASS));
  api = null;
}

/** Pengu entry point. Registers with the Perfectionism core. */
export function init() {
  // Installed before the client's bundles create their sockets and send their first requests.
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
