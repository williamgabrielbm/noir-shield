"use strict";
(() => {
  // src/youtube/data.ts
  var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  function sanitizePlayer(value) {
    if (!record(value) || !record(value.videoDetails) || typeof value.videoDetails.videoId !== "string" || !record(value.playabilityStatus) || value.playabilityStatus.status !== "OK" || !record(value.streamingData) || value.videoDetails.isLiveContent === true) return value;
    let result = value;
    for (const key of ["adPlacements", "playerAds", "adSlots"]) {
      const entries = value[key];
      if (!Array.isArray(entries) || entries.length === 0) continue;
      const expected = key === "adPlacements" ? "adPlacementRenderer" : key === "playerAds" ? "playerLegacyDesktopWatchAdsRenderer" : "adSlotRenderer";
      if (!entries.every((entry) => record(entry) && record(entry[expected]))) continue;
      if (result === value) result = { ...value };
      result[key] = [];
    }
    return result;
  }
  function sanitizePlayerPayload(value) {
    const direct = sanitizePlayer(value);
    if (direct !== value) return direct;
    const envelope = (entry) => {
      if (!record(entry) || !record(entry.playerResponse)) return entry;
      const next2 = sanitizePlayer(entry.playerResponse);
      return next2 === entry.playerResponse ? entry : { ...entry, playerResponse: next2 };
    };
    if (!Array.isArray(value)) {
      const result = envelope(value);
      if (!record(result) || !Array.isArray(result.entries)) return result;
      const entries = result.entries.filter((entry) => {
        if (!record(entry) || !record(entry.command) || !record(entry.command.reelWatchEndpoint)) return true;
        const params = entry.command.reelWatchEndpoint.adClientParams;
        return !record(params) || params.isAd !== true;
      });
      return entries.length === result.entries.length ? result : { ...result, entries };
    }
    let changed = false;
    const next = value.map((entry) => {
      const result = envelope(entry);
      changed ||= result !== entry;
      return result;
    });
    return changed ? next : value;
  }
  function playerEndpoint(input, base) {
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : "", base);
      return url.origin === new URL(base).origin && (url.pathname === "/youtubei/v1/player" || url.pathname === "/youtubei/v1/get_watch" || url.pathname === "/youtubei/v1/reel/reel_watch_sequence");
    } catch {
      return false;
    }
  }

  // src/youtube/response.ts
  var MAX_BYTES = 4e6;
  async function filterPlayerResponse(response, active) {
    if (!active() || !response.ok || !response.headers.get("content-type")?.includes("application/json")) return response;
    if (Number(response.headers.get("content-length")) > MAX_BYTES) return response;
    const copy = response.clone();
    const reader = copy.body?.getReader();
    if (!reader) return response;
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (!active() || size > MAX_BYTES) {
          void reader.cancel().catch(() => {
          });
          return response;
        }
        chunks.push(part.value);
      }
      if (!active()) return response;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const data = JSON.parse(new TextDecoder().decode(bytes));
      const next = sanitizePlayerPayload(data);
      if (next === data || !active()) return response;
      const headers = new Headers(response.headers);
      for (const name of ["content-length", "content-encoding", "etag", "content-md5", "digest"]) headers.delete(name);
      const decorate = (item) => {
        const clone = item.clone;
        Object.defineProperties(item, {
          url: { configurable: true, value: response.url },
          redirected: { configurable: true, value: response.redirected },
          type: { configurable: true, value: response.type },
          clone: { configurable: true, value: function() {
            return decorate(clone.call(this));
          } }
        });
        return item;
      };
      return decorate(new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers }));
    } catch {
      void reader.cancel().catch(() => {
      });
      return response;
    } finally {
      reader.releaseLock();
    }
  }

  // src/youtube/main.ts
  (() => {
    const scope = window;
    const eventName = "noir-youtube-config-v1";
    let enabled = false, lease = 0;
    let originalFetch, wrappedFetch;
    let originalDescriptor;
    let initialValue;
    let initialView;
    let getter;
    const xhrHooks = [];
    const clean = (value) => {
      if (!enabled || Date.now() > lease) return value;
      try {
        return sanitizePlayerPayload(value);
      } catch {
        return value;
      }
    };
    function install() {
      if (wrappedFetch) return;
      originalFetch = window.fetch;
      wrappedFetch = new Proxy(originalFetch, {
        apply(target, receiver, args) {
          const promise = Reflect.apply(target, receiver, args);
          if (!enabled || !playerEndpoint(args[0], location.href)) return promise;
          return promise.then((response) => filterPlayerResponse(response, () => enabled && Date.now() <= lease));
        }
      });
      window.fetch = wrappedFetch;
      for (const key of ["response", "responseText"]) {
        const original = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, key);
        if (!original?.configurable || !original.get) continue;
        const cache = /* @__PURE__ */ new WeakMap();
        const get = function() {
          const raw = original.get.call(this);
          if (!enabled || Date.now() > lease || this.readyState !== 4 || !playerEndpoint(this.responseURL, location.href)) return raw;
          if (this.responseType !== "" && this.responseType !== "text" && this.responseType !== "json") return raw;
          const previous = cache.get(this);
          if (previous && previous.raw === raw) return previous.next;
          let next = raw;
          if (typeof raw === "string" && raw.length <= 4e6) {
            try {
              const data = JSON.parse(raw), cleaned = clean(data);
              if (cleaned !== data) next = JSON.stringify(cleaned);
            } catch {
            }
          } else if (this.responseType === "json") next = clean(raw);
          cache.set(this, { raw, next });
          return next;
        };
        Object.defineProperty(XMLHttpRequest.prototype, key, { ...original, get });
        xhrHooks.push({ key, original, get });
      }
      originalDescriptor = Object.getOwnPropertyDescriptor(scope, "ytInitialPlayerResponse");
      if (!originalDescriptor || originalDescriptor.configurable && "value" in originalDescriptor && originalDescriptor.writable) {
        initialValue = originalDescriptor?.value;
        initialView = clean(initialValue);
        getter = () => enabled ? initialView : initialValue;
        Object.defineProperty(scope, "ytInitialPlayerResponse", {
          configurable: true,
          enumerable: originalDescriptor?.enumerable ?? true,
          get: getter,
          set(value) {
            initialValue = value;
            initialView = clean(value);
          }
        });
      }
    }
    function uninstall() {
      enabled = false;
      if (window.fetch === wrappedFetch && originalFetch) window.fetch = originalFetch;
      for (const hook of xhrHooks) {
        if (Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, hook.key)?.get === hook.get) Object.defineProperty(XMLHttpRequest.prototype, hook.key, hook.original);
      }
      xhrHooks.length = 0;
      if (getter && Object.getOwnPropertyDescriptor(scope, "ytInitialPlayerResponse")?.get === getter) {
        Object.defineProperty(scope, "ytInitialPlayerResponse", { ...originalDescriptor || { configurable: true, enumerable: true, writable: true }, value: initialValue });
      }
      getter = void 0;
      wrappedFetch = void 0;
      originalFetch = void 0;
    }
    document.addEventListener(eventName, (event) => {
      const raw = event.detail;
      if (typeof raw !== "string" || raw.length > 160) return;
      try {
        const data = JSON.parse(raw);
        if (data?.version !== 1 || typeof data.enabled !== "boolean" || Object.keys(data).length !== 2) return;
        lease = Date.now() + 15e3;
        if (!data.enabled) {
          uninstall();
          return;
        }
        enabled = true;
        try {
          install();
        } catch {
          uninstall();
        }
      } catch {
      }
    });
    setInterval(() => {
      if (enabled && Date.now() > lease) uninstall();
    }, 5e3);
    window.addEventListener("pagehide", uninstall);
  })();
})();
