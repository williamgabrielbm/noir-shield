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
  var requestUrl = Object.getOwnPropertyDescriptor(Request.prototype, "url")?.get;
  var urlHref = Object.getOwnPropertyDescriptor(URL.prototype, "href")?.get;
  function requestAddress(input) {
    if (typeof input === "string") return input;
    try {
      if (requestUrl) return Reflect.apply(requestUrl, input, []);
    } catch {
    }
    try {
      if (urlHref) return Reflect.apply(urlHref, input, []);
    } catch {
    }
    return void 0;
  }
  function playerEndpoint(input, base, allowedOrigin) {
    try {
      const address = requestAddress(input);
      if (address === void 0) return false;
      const url = new URL(address, base);
      return url.origin === (allowedOrigin ?? new URL(base).origin) && (url.pathname === "/youtubei/v1/player" || url.pathname === "/youtubei/v1/get_watch" || url.pathname === "/youtubei/v1/reel/reel_watch_sequence");
    } catch {
      return false;
    }
  }

  // src/youtube/response.ts
  var MAX_BYTES = 4e6;
  async function filterPlayerResponse(response, active, ResponseType = Response, HeadersType = Headers) {
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
      const headers = new HeadersType(response.headers);
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
      return decorate(new ResponseType(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers }));
    } catch {
      void reader.cancel().catch(() => {
      });
      return response;
    } finally {
      reader.releaseLock();
    }
  }

  // src/youtube/frames.ts
  function blankFrameHooks(root, active, wrapFetch) {
    let realms = /* @__PURE__ */ new WeakMap();
    const records = /* @__PURE__ */ new Set();
    let frames = /* @__PURE__ */ new WeakMap();
    const frameRecords = /* @__PURE__ */ new Set();
    let started = false;
    function protectRealm(realm, top = false) {
      try {
        if (!started || !active()) return;
        const address = new URL(realm.location.href);
        if (!top && (address.protocol !== "about:" || !["blank", "srcdoc"].includes(address.pathname))) return;
        const prototype = realm.HTMLIFrameElement.prototype;
        if (realms.get(realm)?.prototype === prototype) return;
        const entry = { realm, prototype, active, restore: [] };
        realms.set(realm, entry);
        for (const ref of records) if (!ref.deref()) records.delete(ref);
        records.add(new WeakRef(entry));
        if (!top) {
          const descriptor = Object.getOwnPropertyDescriptor(realm, "fetch");
          if (descriptor && "value" in descriptor && descriptor.writable && typeof descriptor.value === "function") {
            const wrapped = wrapFetch(realm, descriptor.value, () => entry.active());
            Object.defineProperty(realm, "fetch", { ...descriptor, value: wrapped });
            entry.restore.push(() => {
              if (Object.getOwnPropertyDescriptor(realm, "fetch")?.value === wrapped) Object.defineProperty(realm, "fetch", descriptor);
            });
          }
        }
        const windowGetter = Object.getOwnPropertyDescriptor(prototype, "contentWindow")?.get;
        const protectFrame = (frame) => {
          if (!entry.active() || !windowGetter) return;
          try {
            if (!frames.has(frame)) {
              const listener = () => protectFrame(frame);
              const record2 = { frame, listener, remove: realm.EventTarget.prototype.removeEventListener };
              Reflect.apply(realm.EventTarget.prototype.addEventListener, frame, ["load", listener, true]);
              frames.set(frame, record2);
              for (const ref of frameRecords) if (!ref.deref()) frameRecords.delete(ref);
              frameRecords.add(new WeakRef(record2));
            }
            const child = Reflect.apply(windowGetter, frame, []);
            if (child) protectRealm(child);
          } catch {
          }
        };
        for (const key of ["contentWindow", "contentDocument"]) {
          const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
          if (!descriptor?.configurable || !descriptor.get) continue;
          const wrapped = new Proxy(descriptor.get, { apply(target, receiver, args) {
            const value = Reflect.apply(target, receiver, args);
            protectFrame(receiver);
            return value;
          } });
          Object.defineProperty(prototype, key, { ...descriptor, get: wrapped });
          entry.restore.push(() => {
            if (Object.getOwnPropertyDescriptor(prototype, key)?.get === wrapped) Object.defineProperty(prototype, key, descriptor);
          });
        }
        const nodeType = Object.getOwnPropertyDescriptor(realm.Node.prototype, "nodeType")?.get;
        const localName = Object.getOwnPropertyDescriptor(realm.Element.prototype, "localName")?.get;
        const elementQuery = realm.Element.prototype.querySelectorAll;
        const fragmentQuery = realm.DocumentFragment.prototype.querySelectorAll;
        const framesIn = (value) => {
          try {
            const type = nodeType && Reflect.apply(nodeType, value, []);
            if (type === 1) {
              if (localName && Reflect.apply(localName, value, []) === "iframe") return [value];
              return Array.from(Reflect.apply(elementQuery, value, ["iframe"]));
            }
            if (type === 11) return Array.from(Reflect.apply(fragmentQuery, value, ["iframe"]));
          } catch {
          }
          return [];
        };
        const parentNode = Object.getOwnPropertyDescriptor(realm.Node.prototype, "parentNode")?.get;
        const insertionMethods = [
          ...["appendChild", "insertBefore", "replaceChild"].map((key) => [realm.Node.prototype, key]),
          ...["append", "prepend", "replaceChildren", "insertAdjacentElement", "before", "after", "replaceWith", "insertAdjacentHTML"].map((key) => [realm.Element.prototype, key])
        ];
        for (const [owner, key] of insertionMethods) {
          const descriptor = Object.getOwnPropertyDescriptor(owner, key);
          if (!descriptor?.configurable || typeof descriptor.value !== "function") continue;
          const wrapped = new Proxy(descriptor.value, { apply(target, receiver, args) {
            const frames2 = entry.active() ? args.flatMap(framesIn) : [];
            const value = Reflect.apply(target, receiver, args);
            if (entry.active() && key === "insertAdjacentHTML") {
              let parent;
              try {
                if (parentNode) parent = Reflect.apply(parentNode, receiver, []);
              } catch {
              }
              frames2.push(...framesIn(parent ?? receiver));
            }
            for (const frame of frames2) protectFrame(frame);
            return value;
          } });
          Object.defineProperty(owner, key, { ...descriptor, value: wrapped });
          entry.restore.push(() => {
            if (Object.getOwnPropertyDescriptor(owner, key)?.value === wrapped) Object.defineProperty(owner, key, descriptor);
          });
        }
        for (const key of ["innerHTML", "outerHTML"]) {
          const owner = realm.Element.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(owner, key);
          if (!descriptor?.configurable || !descriptor.set) continue;
          const wrapped = new Proxy(descriptor.set, { apply(target, receiver, args) {
            let parent;
            if (entry.active() && key === "outerHTML") try {
              if (parentNode) parent = Reflect.apply(parentNode, receiver, []);
            } catch {
            }
            const value = Reflect.apply(target, receiver, args);
            if (entry.active() && (typeof args[0] !== "string" || /<iframe[\s>]/i.test(args[0]))) {
              for (const frame of framesIn(key === "outerHTML" ? parent : receiver)) protectFrame(frame);
            }
            return value;
          } });
          Object.defineProperty(owner, key, { ...descriptor, set: wrapped });
          entry.restore.push(() => {
            if (Object.getOwnPropertyDescriptor(owner, key)?.set === wrapped) Object.defineProperty(owner, key, descriptor);
          });
        }
        for (const frame of Array.from(realm.document.querySelectorAll("iframe"))) protectFrame(frame);
      } catch {
      }
    }
    return {
      start() {
        if (!started) {
          started = true;
          protectRealm(root, true);
        }
      },
      stop() {
        started = false;
        for (const ref of records) {
          const record2 = ref.deref();
          if (record2) for (const restore of record2.restore.reverse()) {
            try {
              restore();
            } catch {
            }
          }
        }
        records.clear();
        realms = /* @__PURE__ */ new WeakMap();
        for (const ref of frameRecords) {
          const record2 = ref.deref();
          if (record2) try {
            Reflect.apply(record2.remove, record2.frame, ["load", record2.listener, true]);
          } catch {
          }
        }
        frameRecords.clear();
        frames = /* @__PURE__ */ new WeakMap();
      }
    };
  }

  // src/youtube/main.ts
  (() => {
    const scope = window;
    const eventName = "noir-youtube-config-v1";
    const pageOrigin = location.origin;
    const MainResponse = Response, MainHeaders = Headers;
    const hasInstance = Function.prototype[Symbol.hasInstance];
    let enabled = false, lease = 0;
    let originalFetch, wrappedFetch;
    let originalDescriptor;
    let initialValue;
    let initialView;
    let getter;
    const xhrHooks = [];
    const active = () => enabled && Date.now() <= lease;
    const wrapFetch = (realm, original, usable = active) => {
      const ResponseType = realm.Response, HeadersType = realm.Headers;
      const sourceDocument = realm.document;
      return new Proxy(original, { apply(target, receiver, args) {
        const promise = Reflect.apply(target, receiver, args);
        if (!usable()) return promise;
        try {
          if (!playerEndpoint(args[0], sourceDocument.baseURI, pageOrigin)) return promise;
        } catch {
          return promise;
        }
        return promise.then((response) => {
          if (Reflect.apply(hasInstance, MainResponse, [response])) return filterPlayerResponse(response, usable, MainResponse, MainHeaders);
          if (Reflect.apply(hasInstance, ResponseType, [response])) return filterPlayerResponse(response, usable, ResponseType, HeadersType);
          return response;
        });
      } });
    };
    const frameHooks = blankFrameHooks(window, active, wrapFetch);
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
      wrappedFetch = wrapFetch(window, originalFetch);
      window.fetch = wrappedFetch;
      frameHooks.start();
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
      frameHooks.stop();
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
