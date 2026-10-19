import {playerEndpoint, sanitizePlayer} from './data';

(() => {
  const scope = window as Window & {__noirMain?: boolean; ytInitialPlayerResponse?: unknown};
  if (scope.__noirMain) return;
  scope.__noirMain = true;
  const eventName = 'noir-youtube-config-v1';
  let enabled = false, lease = 0;
  let originalFetch: typeof fetch | undefined, wrappedFetch: typeof fetch | undefined;
  let originalDescriptor: PropertyDescriptor | undefined;
  let initialValue: unknown;
  let initialView: unknown;
  let getter: (() => unknown) | undefined;
  const xhrHooks: {key:'response'|'responseText'; original:PropertyDescriptor; get:()=>unknown}[] = [];
  const clean = (value: unknown) => {
    if (!enabled || Date.now() > lease) return value;
    try { return sanitizePlayer(value); } catch { return value; }
  };
  function install() {
    if (wrappedFetch) return;
    originalFetch = window.fetch;
    wrappedFetch = new Proxy(originalFetch, {
      apply(target, receiver, args) {
        const promise = Reflect.apply(target, receiver, args) as Promise<Response>;
        if (!enabled || !playerEndpoint(args[0], location.href)) return promise;
        return promise.then(response => {
          if (!enabled || !response.ok || !response.headers.get('content-type')?.includes('application/json')) return response;
          // Preserve Response identity, URL, status, headers, streams, aborts and bodyUsed.
          // Only consumers using json()/text()/clone() opt into the supported decode path.
          const decorate = (item: Response): Response => {
            const json = item.json, text = item.text, clone = item.clone;
            Object.defineProperties(item, {
              json: {configurable:true, writable:true, value: async function(this: Response) {return clean(await json.call(this));}},
              text: {configurable:true, writable:true, value: async function(this: Response) {
                const raw = await text.call(this);
                if (!enabled || raw.length > 4_000_000) return raw;
                try {const data = JSON.parse(raw), next = clean(data); return next === data ? raw : JSON.stringify(next);} catch {return raw;}
              }},
              clone: {configurable:true, writable:true, value: function(this: Response) {return decorate(clone.call(this));}}
            });
            return item;
          };
          try {return decorate(response);} catch {return response;}
        });
      }
    });
    window.fetch = wrappedFetch;
    for (const key of ['response', 'responseText'] as const) {
      const original = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, key);
      if (!original?.configurable || !original.get) continue;
      const cache = new WeakMap<XMLHttpRequest, {raw:unknown; next:unknown}>();
      const get = function(this: XMLHttpRequest) {
        // Native getter runs first, preserving brand checks and InvalidStateError.
        const raw = original.get!.call(this);
        if (!enabled || this.readyState !== 4 || !playerEndpoint(this.responseURL, location.href)) return raw;
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
