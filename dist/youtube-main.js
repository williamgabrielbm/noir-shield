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
  function playerEndpoint(input, base) {
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : "", base);
      return url.origin === new URL(base).origin && url.pathname === "/youtubei/v1/player";
    } catch {
      return false;
    }
  }

  // src/youtube/main.ts
  (() => {
    const scope = window;
    if (scope.__noirMain) return;
    scope.__noirMain = true;
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
        return sanitizePlayer(value);
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
          return promise.then((response) => {
            if (!enabled || !response.ok || !response.headers.get("content-type")?.includes("application/json")) return response;
            const decorate = (item) => {
              const json = item.json, text = item.text, clone = item.clone;
              Object.defineProperties(item, {
                json: { configurable: true, writable: true, value: async function() {
                  return clean(await json.call(this));
                } },
                text: { configurable: true, writable: true, value: async function() {
                  const raw = await text.call(this);
                  if (!enabled || raw.length > 4e6) return raw;
                  try {
                    const data = JSON.parse(raw), next = clean(data);
                    return next === data ? raw : JSON.stringify(next);
                  } catch {
                    return raw;
                  }
                } },
                clone: { configurable: true, writable: true, value: function() {
                  return decorate(clone.call(this));
                } }
              });
              return item;
            };
            try {
              return decorate(response);
            } catch {
              return response;
            }
          });
        }
      });
      window.fetch = wrappedFetch;
      for (const key of ["response", "responseText"]) {
        const original = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, key);
        if (!original?.configurable || !original.get) continue;
        const cache = /* @__PURE__ */ new WeakMap();
        const get = function() {
          const raw = original.get.call(this);
          if (!enabled || this.readyState !== 4 || !playerEndpoint(this.responseURL, location.href)) return raw;
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
