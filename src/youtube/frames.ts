// TypeScript, file: src/youtube/frames.ts, target: Chromium 121+, accessible blank iframe realms.
export type FetchRealm = Window & typeof globalThis;
type Restore = () => void;
type RealmHooks = {realm:FetchRealm; prototype:object; active:()=>boolean; restore:Restore[]};
type FrameLoadHook = {frame:HTMLIFrameElement; listener:EventListener; remove:typeof EventTarget.prototype.removeEventListener};

export function blankFrameHooks(root:FetchRealm, active:()=>boolean, wrapFetch:(realm:FetchRealm, original:typeof fetch, active:()=>boolean)=>typeof fetch) {
  let realms = new WeakMap<Window, RealmHooks>();
  const records = new Set<WeakRef<RealmHooks>>();
  let frames = new WeakMap<HTMLIFrameElement, FrameLoadHook>();
  const frameRecords = new Set<WeakRef<FrameLoadHook>>();
  let started = false;

  function protectRealm(realm:FetchRealm, top = false) {
    try {
      if (!started || !active()) return;
      // Accessing an opaque/cross-origin frame throws. Ordinary HTTPS frames are deliberately untouched.
      const address = new URL(realm.location.href);
      if (!top && (address.protocol !== 'about:' || !['blank','srcdoc'].includes(address.pathname))) return;
      const prototype = realm.HTMLIFrameElement.prototype;
      if (realms.get(realm)?.prototype === prototype) return;
      const entry:RealmHooks = {realm, prototype, active, restore:[]};
      realms.set(realm, entry);
      for (const ref of records) if (!ref.deref()) records.delete(ref);
      records.add(new WeakRef(entry));

      if (!top) {
        const descriptor = Object.getOwnPropertyDescriptor(realm, 'fetch');
        if (descriptor && 'value' in descriptor && descriptor.writable && typeof descriptor.value === 'function') {
          // The wrapper retains its generation record while a caller retains this fetch.
          const wrapped = wrapFetch(realm, descriptor.value as typeof fetch, () => entry.active());
          Object.defineProperty(realm, 'fetch', {...descriptor, value:wrapped});
          entry.restore.push(() => {
            if (Object.getOwnPropertyDescriptor(realm, 'fetch')?.value === wrapped) Object.defineProperty(realm, 'fetch', descriptor);
          });
        }
      }

      const windowGetter = Object.getOwnPropertyDescriptor(prototype, 'contentWindow')?.get;
      const protectFrame = (frame:HTMLIFrameElement) => {
        if (!entry.active() || !windowGetter) return;
        try {
          if (!frames.has(frame)) {
            const listener:EventListener = () => protectFrame(frame);
            const record:FrameLoadHook = {frame,listener,remove:realm.EventTarget.prototype.removeEventListener};
            Reflect.apply(realm.EventTarget.prototype.addEventListener, frame, ['load',listener,true]);
            frames.set(frame, record);
            for (const ref of frameRecords) if (!ref.deref()) frameRecords.delete(ref);
            frameRecords.add(new WeakRef(record));
          }
          const child = Reflect.apply(windowGetter, frame, []) as FetchRealm | null;
          if (child) protectRealm(child);
        } catch { /* Opaque, detached or inaccessible frame: preserve browser behavior. */ }
      };
      for (const key of ['contentWindow','contentDocument'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (!descriptor?.configurable || !descriptor.get) continue;
        const wrapped = new Proxy(descriptor.get, {apply(target, receiver, args) {
          const value = Reflect.apply(target, receiver, args);
          protectFrame(receiver as HTMLIFrameElement);
          return value;
        }});
        Object.defineProperty(prototype, key, {...descriptor, get:wrapped});
        entry.restore.push(() => {
          if (Object.getOwnPropertyDescriptor(prototype, key)?.get === wrapped) Object.defineProperty(prototype, key, descriptor);
        });
      }

      const nodeType = Object.getOwnPropertyDescriptor(realm.Node.prototype, 'nodeType')?.get;
      const localName = Object.getOwnPropertyDescriptor(realm.Element.prototype, 'localName')?.get;
      const elementQuery = realm.Element.prototype.querySelectorAll;
      const fragmentQuery = realm.DocumentFragment.prototype.querySelectorAll;
      const framesIn = (value:unknown):HTMLIFrameElement[] => {
        try {
          const type = nodeType && Reflect.apply(nodeType, value, []);
          if (type === 1) {
            if (localName && Reflect.apply(localName, value, []) === 'iframe') return [value as HTMLIFrameElement];
            return Array.from(Reflect.apply(elementQuery, value, ['iframe']) as NodeListOf<HTMLIFrameElement>);
          }
          if (type === 11) return Array.from(Reflect.apply(fragmentQuery, value, ['iframe']) as NodeListOf<HTMLIFrameElement>);
        } catch { /* Non-node arguments keep their native conversion/exception path. */ }
        return [];
      };
      const parentNode = Object.getOwnPropertyDescriptor(realm.Node.prototype, 'parentNode')?.get;
      // Cover these insertion paths before the caller reads window.frames or removes a factory iframe.
      const insertionMethods:[object,string][] = [
        ...['appendChild','insertBefore','replaceChild'].map(key=>[realm.Node.prototype,key] as [object,string]),
        ...['append','prepend','replaceChildren','insertAdjacentElement','before','after','replaceWith','insertAdjacentHTML'].map(key=>[realm.Element.prototype,key] as [object,string])
      ];
      for (const [owner,key] of insertionMethods) {
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (!descriptor?.configurable || typeof descriptor.value !== 'function') continue;
        const wrapped = new Proxy(descriptor.value as (...args:unknown[])=>unknown, {apply(target, receiver, args) {
          const frames = entry.active() ? args.flatMap(framesIn) : [];
          const value = Reflect.apply(target, receiver, args);
          if (entry.active() && key === 'insertAdjacentHTML') {
            let parent:unknown;
            try {if (parentNode) parent = Reflect.apply(parentNode, receiver, []);} catch { /* Native call already succeeded. */ }
            frames.push(...framesIn(parent ?? receiver));
          }
          for (const frame of frames) protectFrame(frame);
          return value;
        }});
        Object.defineProperty(owner, key, {...descriptor, value:wrapped});
        entry.restore.push(() => {
          if (Object.getOwnPropertyDescriptor(owner, key)?.value === wrapped) Object.defineProperty(owner, key, descriptor);
        });
      }
      for (const key of ['innerHTML','outerHTML'] as const) {
        const owner = realm.Element.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        if (!descriptor?.configurable || !descriptor.set) continue;
        const wrapped = new Proxy(descriptor.set, {apply(target, receiver, args) {
          let parent:unknown;
          if (entry.active() && key === 'outerHTML') try {if (parentNode) parent = Reflect.apply(parentNode, receiver, []);} catch { /* Preserve native exception. */ }
          const value = Reflect.apply(target, receiver, args);
          if (entry.active() && (typeof args[0] !== 'string' || /<iframe[\s>]/i.test(args[0]))) {
            for (const frame of framesIn(key === 'outerHTML' ? parent : receiver)) protectFrame(frame);
          }
          return value;
        }});
        Object.defineProperty(owner, key, {...descriptor, set:wrapped});
        entry.restore.push(() => {
          if (Object.getOwnPropertyDescriptor(owner, key)?.set === wrapped) Object.defineProperty(owner, key, descriptor);
        });
      }
      for (const frame of Array.from(realm.document.querySelectorAll('iframe'))) protectFrame(frame);
    } catch { /* Installing a frame guard is optional; a frame must never break a native DOM operation. */ }
  }
  return {
    start() {if (!started) {started = true; protectRealm(root, true);}},
    stop() {
      started = false;
      for (const ref of records) {
        const record = ref.deref();
        if (record) for (const restore of record.restore.reverse()) {try {restore();} catch { /* Navigated frame. */ }}
      }
      records.clear(); realms = new WeakMap();
      for (const ref of frameRecords) {
        const record = ref.deref();
        if (record) try {Reflect.apply(record.remove, record.frame, ['load',record.listener,true]);} catch { /* Detached node. */ }
      }
      frameRecords.clear(); frames = new WeakMap();
    }
  };
}
