export const version = "1.2.0";

const PLUGIN_ID = "unlock-profile-skins";
const PICKER_BUTTON_SELECTOR = ".style-profile-skin-picker-button";
const CURRENT_SUMMONER_URI = "/lol-summoner/v1/current-summoner";
const INVENTORY_PATH = /^\/lol-champions\/v1\/inventories\/(\d+)\/champions$/;
const AUGMENT_INVENTORY_PATH = /^\/lol-inventory\/v2\/inventory\/SKIN_AUGMENT$/i;
const SUMMONER_TTL = 10 * 60 * 1000;
const STATE_KEY = "perfectionist-plugins:state";
const FAKE_PURCHASE_DATE = 1577836800000;
const FAKE_RENTAL_END = 4102444800000;
const TIER_LABEL = "tier";
const GROUPING_OPTIONS = "lol-uikit-dropdown-option";
const HARVEST_WAIT_MS = 2000;

let filterActive = true;
let api = null;
let summonerId = null;
let summonerPending = false;
let rawFetch = null;
let harvestPromise = null;
const augmentIds = new Set();
const pendingTargetLoads = new Set();
const variantIdRemap = new Map();

function readDefaultEnabled() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    return saved.enabled?.[PLUGIN_ID] !== false;
  } catch {
    return true;
  }
}

function logError(scope, error) {
  console.error(`[Perfectionist] Unlock Profile Skins: ${scope}`, error);
}

function isPickerOpen() {
  return document.querySelector(PICKER_BUTTON_SELECTOR) !== null;
}

function cleanPath(url) {
  let path = String(url ?? "").split("?")[0];
  const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i.exec(path);
  if (origin) path = path.slice(origin[0].length) || "/";
  return path;
}

function pathIdOf(url) {
  const match = INVENTORY_PATH.exec(cleanPath(url));
  return match ? Number(match[1]) : null;
}

function isTargetUrl(url) {
  const id = pathIdOf(url);
  return id !== null && summonerId !== null && id === summonerId;
}

function isAugmentUrl(url) {
  return AUGMENT_INVENTORY_PATH.test(cleanPath(url));
}

function unlockOwnership(ownership) {
  if (!ownership || typeof ownership !== "object") return false;
  let changed = false;
  const needsFakeDate = ownership.owned !== true || ownership.rental?.rented === true;
  if (ownership.owned !== true) {
    ownership.owned = true;
    changed = true;
  }
  if (needsFakeDate) {
    const rental = ownership.rental;
    if (rental && typeof rental === "object") {
      if (rental.purchaseDate !== FAKE_PURCHASE_DATE) {
        rental.purchaseDate = FAKE_PURCHASE_DATE;
        changed = true;
      }
      if (rental.endDate !== undefined && rental.endDate !== FAKE_RENTAL_END) {
        rental.endDate = FAKE_RENTAL_END;
        changed = true;
      }
    }
    if (ownership.purchaseDate !== undefined && ownership.purchaseDate !== FAKE_PURCHASE_DATE) {
      ownership.purchaseDate = FAKE_PURCHASE_DATE;
      changed = true;
    }
  }
  return changed;
}

function synthesizedOwnership() {
  return {
    owned: true,
    loyaltyReward: false,
    xboxGPReward: false,
    rental: { rented: false, purchaseDate: 0, endDate: 0, winCountRemaining: 0 },
  };
}

function harvestFromPayload(node) {
  if (!node || typeof node !== "object") return;
  const list = node.skinAugments?.augments;
  if (Array.isArray(list)) {
    for (const aug of list) {
      if (aug && typeof aug.contentId === "string") augmentIds.add(aug.contentId);
    }
  }
  const values = Array.isArray(node) ? node : Object.values(node);
  for (const value of values) {
    if (value && typeof value === "object") harvestFromPayload(value);
  }
}

function variantLabelFromOverlays(overlays) {
  for (const overlay of overlays || []) {
    const match = /splash_tile_([a-z0-9]+)\.png$/i.exec(String(overlay?.tileLCOverlayPath || ""));
    if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  return "Variant";
}

function splitVariantTiers(skin) {
  const tiers = skin.questSkinInfo.tiers;
  const parent = typeof skin.id === "number" ? skin.id : null;
  const taken = new Set(tiers.map((tier) => tier?.id));
  const out = [];
  let changed = false;
  let sibling = 0;
  for (const tier of tiers) {
    out.push(tier);
    const augments = tier?.skinAugments?.augments;
    if (!Array.isArray(augments) || augments.length < 2) continue;
    const withOverlays = augments.filter((aug) => Array.isArray(aug?.overlays) && aug.overlays.some((o) => o && o.tileLCOverlayPath));
    const plain = augments.filter((aug) => withOverlays.indexOf(aug) === -1);
    if (withOverlays.length === 0 || plain.length === 0) continue;
    tier.skinAugments = { ...tier.skinAugments, augments: plain };
    for (const aug of withOverlays) {
      let id = parent !== null ? parent + 1000000 * sibling : -(tier.id ?? 0) * 10 - sibling;
      while (taken.has(id)) id += parent !== null ? 1000000 : -1;
      taken.add(id);
      sibling++;
      variantIdRemap.set(id, tier.id);
      out.push({
        ...tier,
        id,
        name: `${tier.name ?? ""} ${variantLabelFromOverlays(aug.overlays)}`.trim(),
        skinAugments: { ...tier.skinAugments, augments: [aug] },
      });
      changed = true;
    }
  }
  if (changed) skin.questSkinInfo.tiers = out;
  return changed;
}

function remapVariantIds(body) {
  if (typeof body !== "string" || variantIdRemap.size === 0) return body;
  let out = body;
  for (const [from, to] of variantIdRemap) {
    out = out.replace(new RegExp(`(["'\\[,:\\s])${from}(?![0-9])`, "g"), `$1${to}`);
  }
  return out;
}

function isShadowEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (Array.isArray(entry.skins)) return typeof entry.id === "number" && entry.id >= 60000;
  return typeof entry.championId === "number" && entry.championId >= 60000 && typeof entry.id === "number";
}

function unlockDeep(node) {
  if (!node || typeof node !== "object") return false;
  let changed = false;
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      if (isShadowEntry(node[i])) {
        node.splice(i, 1);
        changed = true;
      }
    }
  }
  if (!Array.isArray(node) && node.questSkinInfo && Array.isArray(node.questSkinInfo.tiers)) {
    changed = splitVariantTiers(node) || changed;
  }
  const augList = node.skinAugments?.augments;
  if (Array.isArray(augList)) {
    for (const aug of augList) {
      if (!aug || typeof aug !== "object") continue;
      if (typeof aug.contentId === "string") augmentIds.add(aug.contentId);
      if (aug.ownership && typeof aug.ownership === "object") {
        changed = unlockOwnership(aug.ownership) || changed;
      } else {
        aug.ownership = synthesizedOwnership();
        changed = true;
      }
    }
  }
  if (node.ownership && typeof node.ownership === "object") {
    changed = unlockOwnership(node.ownership) || changed;
  } else if (typeof node.contentId === "string" && Array.isArray(node.overlays)) {
    node.ownership = synthesizedOwnership();
    changed = true;
  }
  if (node.owned === false) {
    node.owned = true;
    changed = true;
  }
  const values = Array.isArray(node) ? node : Object.values(node);
  for (const value of values) {
    if (value && typeof value === "object") changed = unlockDeep(value) || changed;
  }
  return changed;
}

function unlockAugmentInventory(items) {
  if (!Array.isArray(items)) return false;
  let changed = false;
  const present = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.uuid === "string") present.add(item.uuid);
    if (item.owned !== true) {
      item.owned = true;
      changed = true;
    }
    if (item.ownershipType !== undefined && item.ownershipType !== "OWNED") {
      item.ownershipType = "OWNED";
      changed = true;
    }
  }
  for (const id of augmentIds) {
    if (present.has(id)) continue;
    items.push({
      uuid: id,
      inventoryType: "SKIN_AUGMENT",
      ownershipType: "OWNED",
      owned: true,
      quantity: 1,
      purchaseDate: FAKE_PURCHASE_DATE,
    });
    changed = true;
  }
  return changed;
}

function ensureAugmentIds() {
  if (augmentIds.size > 0) return Promise.resolve();
  if (harvestPromise) return harvestPromise;
  harvestPromise = (async () => {
    const waits = [...pendingTargetLoads];
    if (waits.length > 0) {
      await Promise.race([
        Promise.allSettled(waits),
        new Promise((resolve) => setTimeout(resolve, HARVEST_WAIT_MS)),
      ]);
    }
    if (augmentIds.size > 0) return;
    try {
      const get = rawFetch || ((...args) => window.fetch(...args));
      let id = summonerId;
      if (id === null) {
        const response = await get(CURRENT_SUMMONER_URI);
        const summoner = await response.json().catch(() => null);
        id = typeof summoner?.summonerId === "number" ? summoner.summonerId : null;
        if (id !== null) summonerId = id;
      }
      if (id === null) return;
      const response = await get(`/lol-champions/v1/inventories/${id}/champions`);
      const json = await response.json().catch(() => null);
      if (json) harvestFromPayload(json);
    } catch {}
  })().finally(() => {
    harvestPromise = null;
  });
  return harvestPromise;
}

let tierObserver = null;
let tierAppliedForOpen = false;
let tierDropdown = null;

function findGroupingDropdown() {
  for (const dd of document.querySelectorAll("lol-uikit-framed-dropdown")) {
    const labels = [...dd.querySelectorAll(GROUPING_OPTIONS)].map((o) => o.textContent.trim().toLowerCase());
    if (labels.includes("my collection") && labels.includes(TIER_LABEL)) return dd;
  }
  return null;
}

function applyTierGrouping() {
  if (tierDropdown && !tierDropdown.isConnected) {
    tierDropdown = null;
    tierAppliedForOpen = false;
  }
  if (tierAppliedForOpen) return;
  const dd = tierDropdown ?? findGroupingDropdown();
  if (!dd) {
    tierAppliedForOpen = false;
    return;
  }
  tierDropdown = dd;
  const options = [...dd.querySelectorAll(GROUPING_OPTIONS)];
  const tier = options.find((o) => o.textContent.trim().toLowerCase() === TIER_LABEL);
  if (!tier) return;
  const current = options.find((o) => o.hasAttribute("selected"));
  if (current !== tier) tier.click();
  tierAppliedForOpen = true;
}

function startTierGrouping() {
  if (tierObserver) return;
  tierObserver = new MutationObserver(() => {
    try {
      applyTierGrouping();
    } catch (error) {
      logError("tier grouping failed.", error);
    }
  });
  tierObserver.observe(document.documentElement ?? document, { childList: true, subtree: true });
  applyTierGrouping();
}

function stopTierGrouping() {
  tierObserver?.disconnect();
  tierObserver = null;
  tierAppliedForOpen = false;
  tierDropdown = null;
}

function maybeRefreshSummoner() {
  if (summonerId !== null || summonerPending || !isPickerOpen()) return;
  ensureSummonerId();
}

function ensureSummonerId() {
  if (summonerId !== null || summonerPending) return;
  const get = api?.lcu?.get;
  if (!get) return;
  summonerPending = true;
  get(CURRENT_SUMMONER_URI, { ttl: SUMMONER_TTL })
    .then((summoner) => {
      summonerId = typeof summoner?.summonerId === "number" ? summoner.summonerId : null;
    })
    .catch(() => {})
    .finally(() => {
      summonerPending = false;
    });
}

function rewriteWebSocketFrame(text) {
  if (!filterActive || typeof text !== "string") return null;
  const targetFrame = text.indexOf("lol-champions/v1/inventories") !== -1;
  const augmentFrame = text.indexOf("SKIN_AUGMENT") !== -1;
  if (!targetFrame && !augmentFrame) return null;
  if (!isPickerOpen()) return null;
  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(frame) || frame.length < 3) return null;
  const payload = frame[2];
  if (!payload || typeof payload !== "object" || typeof payload.uri !== "string") return null;
  let changed;
  if (isTargetUrl(payload.uri)) {
    changed = unlockDeep(payload.data);
  } else if (isAugmentUrl(payload.uri)) {
    changed = unlockAugmentInventory(payload.data);
  } else {
    return null;
  }
  if (!changed) return null;
  return JSON.stringify(frame);
}

function wrapMessageListener(listener) {
  if (typeof listener !== "function" || listener.__perfProfileWrap) return listener;
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
  wrapped.__perfProfileWrap = true;
  wrapped.__perfProfileOriginal = listener;
  return wrapped;
}

function installWebSocketFilter() {
  const proto = window.WebSocket && window.WebSocket.prototype;
  if (!proto || proto.addEventListener.__perfProfileFilter) return;

  const origAdd = proto.addEventListener;
  const origRemove = proto.removeEventListener;
  const origDispatch = proto.dispatchEvent;

  proto.addEventListener = function (type, listener, options) {
    return origAdd.call(this, type, type === "message" ? wrapMessageListener(listener) : listener, options);
  };
  proto.removeEventListener = function (type, listener, options) {
    return origRemove.call(this, type, (listener && listener.__perfProfileOriginal) || listener, options);
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

  proto.addEventListener.__perfProfileFilter = true;
}

function installFetchFilter() {
  const original = window.fetch;
  if (typeof original !== "function" || original.__perfProfileFilter) return;
  rawFetch = (...args) => original.call(window, ...args);

  const wrapped = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const target = isTargetUrl(url);
    const augment = !target && isAugmentUrl(url);
    if (filterActive && pathIdOf(url) !== null) maybeRefreshSummoner();
    if (filterActive && init && typeof init.body === "string") {
      const mapped = remapVariantIds(init.body);
      if (mapped !== init.body) init = { ...init, body: mapped };
    }
    const promise = original.call(this, input, init);
    if (filterActive && target && augmentIds.size === 0) {
      const latch = (async () => {
        try {
          const response = await promise;
          if (response && response.ok && augmentIds.size === 0) {
            const json = await response.clone().json().catch(() => null);
            if (json) harvestFromPayload(json);
          }
        } catch {}
        pendingTargetLoads.delete(latch);
      })();
      pendingTargetLoads.add(latch);
    }
    if (!filterActive || (!target && !augment) || !isPickerOpen()) return promise;
    const ready = augment && augmentIds.size === 0 ? ensureAugmentIds() : Promise.resolve();
    return ready
      .then(() => promise)
      .then((response) => {
        if (!response || !response.ok) return response;
        return response
          .clone()
          .json()
          .catch(() => null)
          .then((json) => {
            if (!json) return response;
            const changed = augment ? unlockAugmentInventory(json) : unlockDeep(json);
            if (!changed) return response;
            return new Response(JSON.stringify(json), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          });
      });
  };
  wrapped.__perfProfileFilter = true;
  window.fetch = wrapped;
}

function installXhrFilter() {
  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (!proto || proto.open.__perfProfileFilter) return;

  const origOpen = proto.open;
  const origSend = proto.send;
  const textDescriptor = Object.getOwnPropertyDescriptor(proto, "responseText");
  const responseDescriptor = Object.getOwnPropertyDescriptor(proto, "response");

  proto.open = function (method, url, ...rest) {
    this.__perfProfileUrl = typeof url === "string" ? url : "";
    return origOpen.call(this, method, url, ...rest);
  };
  proto.open.__perfProfileFilter = true;

  proto.send = function (...args) {
    const url = this.__perfProfileUrl || "";
    const target = isTargetUrl(url);
    const augment = !target && isAugmentUrl(url);
    if (filterActive && pathIdOf(url) !== null) maybeRefreshSummoner();
    if (filterActive && typeof args[0] === "string") {
      const mapped = remapVariantIds(args[0]);
      if (mapped !== args[0]) args = [mapped, ...args.slice(1)];
    }
    const xhr = this;
    if (target && filterActive && augmentIds.size === 0 && textDescriptor && textDescriptor.get) {
      const latch = new Promise((resolve) => {
        const finish = () => {
          if (augmentIds.size === 0) {
            try {
              harvestFromPayload(JSON.parse(textDescriptor.get.call(xhr)));
            } catch {}
          }
          pendingTargetLoads.delete(latch);
          resolve();
        };
        xhr.addEventListener("load", finish, { once: true });
        xhr.addEventListener("error", finish, { once: true });
        xhr.addEventListener("abort", finish, { once: true });
      });
      pendingTargetLoads.add(latch);
    }
    if (textDescriptor && textDescriptor.get && (target || augment)) {
      const cache = { raw: null, gate: null, filtered: null };
      const gateOpen = () => filterActive && isPickerOpen();
      const rewriteBody = (json) => (augment ? unlockAugmentInventory(json) : unlockDeep(json));
      const filteredText = () => {
        const raw = textDescriptor.get.call(xhr);
        const gate = gateOpen();
        if (cache.filtered === null || cache.raw !== raw || cache.gate !== gate) {
          cache.raw = raw;
          cache.gate = gate;
          cache.filtered = raw;
          if (gate) {
            try {
              const json = JSON.parse(raw);
              const rewritten = rewriteBody(json) ? JSON.stringify(json) : null;
              if (rewritten !== null) cache.filtered = rewritten;
            } catch {}
          }
        }
        return cache.filtered;
      };
      Object.defineProperty(xhr, "responseText", { configurable: true, get: filteredText });
      if (responseDescriptor && responseDescriptor.get) {
        Object.defineProperty(xhr, "response", {
          configurable: true,
          get() {
            const type = xhr.responseType;
            if (type === "" || type === "text") return filteredText();
            const value = responseDescriptor.get.call(xhr);
            if (type === "json" && gateOpen() && value && typeof value === "object") rewriteBody(value);
            return value;
          },
        });
      }
    }
    if (augment && filterActive && isPickerOpen() && augmentIds.size === 0) {
      const sendArgs = args;
      ensureAugmentIds().finally(() => {
        try {
          origSend.apply(xhr, sendArgs);
        } catch {}
      });
      return;
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

function onEnable(utils) {
  api = utils;
  filterActive = true;
  ensureSourceFilter();
  ensureSummonerId();
  startTierGrouping();
}

function onDisable() {
  filterActive = false;
  stopTierGrouping();
  api = null;
}

export function init() {
  installSourceFilter();

  const registerWith = (utils) => {
    utils.registerPlugin({
      id: PLUGIN_ID,
      name: "Unlock Profile Skins",
      description: "Unlocks every skin in the Set profile background window.",
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
