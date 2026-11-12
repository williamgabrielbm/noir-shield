import {playerEndpoint, sanitizePlayerPayload} from './data';
import {filterPlayerResponse} from './response';
import {blankFrameHooks, type FetchRealm} from './frames';

(() => {
  const scope = window as Window & {ytInitialPlayerResponse?: unknown};
  const eventName = 'noir-youtube-config-v1';
  const pageOrigin = location.origin;
  const MainResponse = Response, MainHeaders = Headers;
  const hasInstance = Function.prototype[Symbol.hasInstance];
  let enabled = false, lease = 0;
  let originalFetch: typeof fetch | undefined, wrappedFetch: typeof fetch | undefined;
  let originalDescriptor: PropertyDescriptor | undefined;
  let initialValue: unknown;
  let initialView: unknown;
  let getter: (() => unknown) | undefined;
  const xhrHooks: {key:'response'|'responseText'; original:PropertyDescriptor; get:()=>unknown}[] = [];
  const active = () => enabled && Date.now() <= lease;
  const wrapFetch = (realm:FetchRealm, original:typeof fetch, usable:()=>boolean = active):typeof fetch => {
    const ResponseType = realm.Response, HeadersType = realm.Headers;
    const sourceDocument = realm.document;
    return new Proxy(original, {apply(target, receiver, args) {
      const promise = Reflect.apply(target, receiver, args) as Promise<Response>;
      if (!usable()) return promise;
      try {
        if (!playerEndpoint(args[0], sourceDocument.baseURI, pageOrigin)) return promise;
      } catch {return promise;}
      return promise.then(response => {
        // A fetch borrowed from a frame and bound to the parent returns a parent-realm Response.
        // Rebuilding it in a removed iframe realm makes subsequent body reads fail in Chromium.
        if (Reflect.apply(hasInstance, MainResponse, [response])) return filterPlayerResponse(response, usable, MainResponse, MainHeaders);
        if (Reflect.apply(hasInstance, ResponseType, [response])) return filterPlayerResponse(response, usable, ResponseType, HeadersType);
        return response;
      });
    }});
  };
  const frameHooks = blankFrameHooks(window, active, wrapFetch);
  const clean = (value: unknown) => {
    if (!enabled || Date.now() > lease) return value;
    try { return sanitizePlayerPayload(value); } catch { return value; }
  };
  function install() {
    if (wrappedFetch) return;
    originalFetch = window.fetch;
    wrappedFetch = wrapFetch(window, originalFetch);
    window.fetch = wrappedFetch;
    frameHooks.start();
    for (const key of ['response', 'responseText'] as const) {
      const original = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, key);
      if (!original?.configurable || !original.get) continue;
      const cache = new WeakMap<XMLHttpRequest, {raw:unknown; next:unknown}>();
      const get = function(this: XMLHttpRequest) {
        // Native getter runs first, preserving brand checks and InvalidStateError.
        const raw = original.get!.call(this);
        if (!enabled || Date.now() > lease || this.readyState !== 4 || !playerEndpoint(this.responseURL, location.href)) return raw;
        if (this.responseType !== '' && this.responseType !== 'text' && this.responseType !== 'json') return raw;
        const previous = cache.get(this);
        if (previous && previous.raw === raw) return previous.next;
        let next = raw;
        if (typeof raw === 'string' && raw.length <= 4_000_000) {
          try {const data = JSON.parse(raw), cleaned = clean(data); if (cleaned !== data) next = JSON.stringify(cleaned);} catch { /* Partial/invalid JSON remains intact. */ }
        } else if (this.responseType === 'json') next = clean(raw);
        cache.set(this, {raw, next});
        return next;
      };
      Object.defineProperty(XMLHttpRequest.prototype, key, {...original, get});
      xhrHooks.push({key, original, get});
    }
    originalDescriptor = Object.getOwnPropertyDescriptor(scope, 'ytInitialPlayerResponse');
    if (!originalDescriptor || (originalDescriptor.configurable && 'value' in originalDescriptor && originalDescriptor.writable)) {
      initialValue = originalDescriptor?.value;
      initialView = clean(initialValue);
      getter = () => enabled ? initialView : initialValue;
      Object.defineProperty(scope, 'ytInitialPlayerResponse', {configurable:true, enumerable:originalDescriptor?.enumerable ?? true,
        get:getter, set(value) {initialValue = value; initialView = clean(value);}});
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
    if (getter && Object.getOwnPropertyDescriptor(scope, 'ytInitialPlayerResponse')?.get === getter) {
      Object.defineProperty(scope, 'ytInitialPlayerResponse', {...(originalDescriptor || {configurable:true,enumerable:true,writable:true}), value:initialValue});
    }
    getter = undefined; wrappedFetch = undefined; originalFetch = undefined;
  }
  // This bridge grants no extension API access. Page code can interfere with MAIN world;
  // the channel is schema restricted, not an authentication boundary.
  document.addEventListener(eventName, event => {
    const raw = (event as CustomEvent).detail;
    if (typeof raw !== 'string' || raw.length > 160) return;
    try {
      const data = JSON.parse(raw);
      if (data?.version !== 1 || typeof data.enabled !== 'boolean' || Object.keys(data).length !== 2) return;
      lease = Date.now() + 15000;
      if (!data.enabled) {uninstall(); return;}
      enabled = true;
      try {install();} catch {uninstall();}
    } catch { /* Malformed messages have no effect. */ }
  });
  setInterval(() => {if (enabled && Date.now() > lease) uninstall();}, 5000);
  window.addEventListener('pagehide', uninstall);
})();
