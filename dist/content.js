"use strict";
(() => {
  // src/youtube/engine.ts
  var YOUTUBE_SELECTORS = [
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-ad-slot-renderer",
    "ytd-compact-promoted-video-renderer",
    "ytd-reel-video-renderer[is-ad]",
    "#player-ads",
    "#masthead-ad",
    ".ytp-ad-overlay-container"
  ];
  var YoutubeEngine = class {
    constructor(onInvalidated = () => {
    }) {
      this.onInvalidated = onInvalidated;
    }
    active = false;
    aggressive = false;
    state = "idle";
    player = null;
    observer;
    timer;
    pending;
    heartbeat;
    clicks = 0;
    lastClick = 0;
    failed = false;
    waitingSince = 0;
    lastTime = -1;
    debug = false;
    signal = () => document.dispatchEvent(new CustomEvent("noir-youtube-config-v1", { detail: JSON.stringify({ version: 1, enabled: this.active && !this.failed }) }));
    configure(enabled, aggressive, debug = false) {
      this.aggressive = aggressive;
      this.debug = debug;
      if (!enabled) {
        this.stop();
        return;
      }
      if (this.active) {
        this.signal();
        return;
      }
      this.active = true;
      this.failed = false;
      this.signal();
      this.heartbeat = setInterval(() => {
        try {
          if (!chrome.runtime.id) {
            this.stop();
            this.onInvalidated();
            return;
          }
          this.signal();
        } catch {
          this.stop();
          this.onInvalidated();
        }
      }, 5e3);
      document.addEventListener("yt-navigate-start", this.navigateStart);
      document.addEventListener("yt-navigate-finish", this.navigateFinish);
      window.addEventListener("popstate", this.navigateFinish);
      window.addEventListener("pagehide", this.suspend);
      window.addEventListener("pageshow", this.resume);
      this.timer = setInterval(this.inspect, 1e3);
      this.inspect();
    }
    setState(next) {
      if (next === this.state) return;
      this.state = next;
      if (this.debug) console.debug("[Noir YouTube]", next);
    }
    navigateStart = () => {
      this.observer?.disconnect();
      this.player = null;
      this.clicks = 0;
      this.lastTime = -1;
      this.waitingSince = 0;
      this.setState("transition");
    };
    navigateFinish = () => {
      this.navigateStart();
      this.schedule();
    };
    suspend = () => {
      this.signalDisabled();
    };
    resume = () => {
      this.signal();
      this.schedule();
    };
    signalDisabled() {
      document.dispatchEvent(new CustomEvent("noir-youtube-config-v1", { detail: JSON.stringify({ version: 1, enabled: false }) }));
    }
    schedule = () => {
      if (this.pending || !this.active) return;
      this.pending = setTimeout(() => {
        this.pending = void 0;
        this.inspect();
      }, this.aggressive ? 100 : 250);
    };
    inspect = () => {
      if (!this.active) return;
      try {
        const player = document.querySelector("ytd-reel-video-renderer[is-active] #movie_player") || document.querySelector("#movie_player");
        if (player !== this.player) {
          this.observer?.disconnect();
          this.player = player;
          this.clicks = 0;
          this.waitingSince = 0;
          if (player) {
            this.observer = new MutationObserver(this.schedule);
            this.observer.observe(player, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled", "hidden", "style"] });
          }
        }
        if (!player) {
          this.setState("idle");
          return;
        }
        const video = player.querySelector("video");
        const now = Date.now();
        if (video && !video.paused && video.readyState < 3 && video.currentTime === this.lastTime) this.waitingSince ||= now;
        else this.waitingSince = 0;
        this.lastTime = video?.currentTime ?? -1;
        if (video?.error || this.waitingSince && now - this.waitingSince > 12e3) {
          this.setState("loading-failed");
          this.failed = true;
          this.signal();
          this.setState("recovering");
          return;
        }
        if (!player.classList.contains("ad-showing")) {
          this.clicks = 0;
          this.setState(video ? "content" : "idle");
          return;
        }
        this.setState("ad-detected");
        const skip = [...player.querySelectorAll(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button")].find((node) => !node.disabled && !node.hidden && node.getBoundingClientRect().width > 0 && getComputedStyle(node).visibility !== "hidden" && getComputedStyle(node).display !== "none");
        this.setState(skip ? "ad-skippable" : "ad-unskippable");
        if (skip && this.clicks < 3 && now - this.lastClick >= 1e3 && player.classList.contains("ad-showing")) {
          this.clicks++;
          this.lastClick = now;
          skip.click();
          this.setState("transition");
        }
      } catch {
        this.failed = true;
        this.signal();
        this.setState("recovering");
      }
    };
    stop() {
      this.active = false;
      this.signalDisabled();
      this.observer?.disconnect();
      this.observer = void 0;
      clearInterval(this.timer);
      clearInterval(this.heartbeat);
      clearTimeout(this.pending);
      this.timer = this.heartbeat = this.pending = void 0;
      this.player = null;
      document.removeEventListener("yt-navigate-start", this.navigateStart);
      document.removeEventListener("yt-navigate-finish", this.navigateFinish);
      window.removeEventListener("popstate", this.navigateFinish);
      window.removeEventListener("pagehide", this.suspend);
      window.removeEventListener("pageshow", this.resume);
      this.setState("idle");
    }
  };

  // src/shared.ts
  var DEFAULT_SETTINGS = {
    enabled: true,
    level: "standard",
    youtube: true,
    cosmetics: true,
    allowedSites: [],
    customRules: [],
    customNetwork: [],
    lists: { easylist: true, easyprivacy: true, adguard_base: false, adguard_tracking: false, adguard_pt: true },
    customLists: [],
    listMeta: {}
  };
  function normalizeDomain(input) {
    try {
      const url = new URL(input.includes("://") ? input : `https://${input}`);
      return url.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  function isAllowed(host, allowed) {
    const domain2 = normalizeDomain(host);
    return allowed.some((item) => domain2 === item || domain2.endsWith(`.${item}`));
  }
  async function getSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    if (!settings) return structuredClone(DEFAULT_SETTINGS);
    return { ...structuredClone(DEFAULT_SETTINGS), ...settings, lists: { ...DEFAULT_SETTINGS.lists, ...settings.lists }, listMeta: settings.listMeta || {} };
  }
  function validSelector(selector) {
    if (!selector || selector.length > 240 || /[{};\n\r]/.test(selector) || /:(?:has|contains|matches-css|xpath|upward|remove)\b/i.test(selector)) return false;
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  // src/content.ts
  var domain = normalizeDomain(location.hostname);
  var STYLE_ID = "noir-shield-cosmetic";
  var YT_STYLE_ID = "noir-shield-youtube";
  var youtubeEngine = new YoutubeEngine(() => {
    removeStyle(STYLE_ID);
    removeStyle(YT_STYLE_ID);
    stopPicker();
  });
  var protectedPage = false;
  var refreshVersion = 0;
  var configVersion = 0;
  async function earlyYoutubeConfig() {
    const version = ++configVersion;
    try {
      const settings = await getSettings();
      if (version !== configVersion) return;
      youtubeEngine.configure(settings.enabled && settings.youtube && !isAllowed(domain, settings.allowedSites) && /(^|\.)youtube\.com$/.test(domain), settings.level === "aggressive", settings.youtubeDebug === true);
    } catch {
      youtubeEngine.stop();
    }
  }
  function style(id, text) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement("style");
      node.id = id;
      (document.head || document.documentElement).append(node);
    }
    node.textContent = text;
  }
  function removeStyle(id) {
    document.getElementById(id)?.remove();
  }
  async function refresh() {
    const version = ++refreshVersion;
    try {
      const response = await chrome.runtime.sendMessage({ type: "COSMETICS", host: domain });
      if (version !== refreshVersion) return;
      if (!response?.ok) throw new Error(response?.error || "Sem resposta");
      const data = response.data;
      protectedPage = data.enabled;
      const youtubeEnabled = data.enabled && data.youtube && /(^|\.)youtube\.com$/.test(domain);
      const safe = data.selectors.filter(validSelector);
      if (protectedPage && safe.length) {
        const chunks = [];
        for (let i = 0; i < safe.length; i += 100) chunks.push(`${safe.slice(i, i + 100).join(",")} { display: none !important; }`);
        style(STYLE_ID, chunks.join("\n"));
      } else removeStyle(STYLE_ID);
      youtubeEngine.configure(youtubeEnabled, data.aggressive, data.youtubeDebug);
      if (youtubeEnabled && data.cosmetics) style(YT_STYLE_ID, `${YOUTUBE_SELECTORS.join(",")} { display:none !important; }`);
      else removeStyle(YT_STYLE_ID);
    } catch {
      if (version !== refreshVersion) return;
      removeStyle(STYLE_ID);
      removeStyle(YT_STYLE_ID);
      youtubeEngine.stop();
    }
  }
  var picker;
  function selectorFor(element) {
    const segments = [];
    let current = element;
    for (let depth = 0; current && depth < 5; depth++, current = current.parentElement) {
      let segment = current.localName;
      const id = current.id;
      if (id && !/\d{5,}|[a-f\d]{8,}/i.test(id)) {
        segment = `#${CSS.escape(id)}`;
        segments.unshift(segment);
        break;
      }
      const classes = [...current.classList].filter((c) => /^[a-z][a-z\d_-]{2,40}$/i.test(c) && !/(active|selected|hover|focus|open|visible)/i.test(c)).slice(0, 2);
      if (classes.length) segment += classes.map((c) => `.${CSS.escape(c)}`).join("");
      const siblings = current.parentElement ? [...current.parentElement.children].filter((x) => x.localName === current.localName) : [];
      if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      segments.unshift(segment);
      const result = segments.join(" > ");
      try {
        if (document.querySelectorAll(result).length === 1) break;
      } catch {
      }
    }
    return segments.join(" > ");
  }
  function highlight(target) {
    if (!picker) return;
    picker.target = target;
    if (!target) {
      picker.overlay.style.display = "none";
      return;
    }
    const box = target.getBoundingClientRect();
    Object.assign(picker.overlay.style, { display: "block", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  }
  function stopPicker() {
    if (!picker) return;
    document.removeEventListener("mousemove", picker.move, true);
    document.removeEventListener("click", picker.click, true);
    document.removeEventListener("keydown", picker.key, true);
    picker.overlay.remove();
    picker.toolbar.remove();
    picker = void 0;
  }
  function startPicker() {
    if (picker || !protectedPage) return;
    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "fixed", zIndex: "2147483646", pointerEvents: "none", boxSizing: "border-box", border: "2px solid #78e2bf", background: "rgba(58,211,160,.20)", borderRadius: "4px" });
    const toolbar = document.createElement("div");
    toolbar.setAttribute("role", "dialog");
    toolbar.setAttribute("aria-label", "Bloquear elemento");
    Object.assign(toolbar.style, { position: "fixed", zIndex: "2147483647", left: "50%", top: "16px", transform: "translateX(-50%)", background: "rgba(13,16,17,.96)", color: "#f5f7f5", padding: "12px 16px", border: "1px solid #55645c", borderRadius: "14px", font: "13px system-ui", boxShadow: "0 12px 40px #0008", display: "flex", alignItems: "center", gap: "12px" });
    const label = document.createElement("span");
    label.textContent = "Clique no elemento desejado";
    const save = document.createElement("button");
    save.textContent = "Bloquear";
    save.disabled = true;
    const cancel = document.createElement("button");
    cancel.textContent = "Cancelar";
    for (const button of [save, cancel]) Object.assign(button.style, { background: "#26302c", border: "1px solid #55645c", borderRadius: "8px", padding: "7px 10px", color: "#fff", cursor: "pointer" });
    toolbar.append(label, save, cancel);
    document.documentElement.append(overlay, toolbar);
    const move = (event) => {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (target && !toolbar.contains(target) && target !== overlay) highlight(target);
    };
    const click = (event) => {
      if (toolbar.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      highlight(document.elementFromPoint(event.clientX, event.clientY));
      save.disabled = false;
      label.textContent = "Confirme o bloqueio";
    };
    const key = (event) => {
      if (event.key === "Escape") stopPicker();
    };
    picker = { overlay, toolbar, target: null, move, click, key };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    cancel.addEventListener("click", stopPicker);
    save.addEventListener("click", async () => {
      const target = picker?.target;
      if (!target) return;
      const selector = selectorFor(target);
      if (!validSelector(selector)) {
        label.textContent = "N\xE3o foi poss\xEDvel criar uma regra segura";
        return;
      }
      try {
        const response = await chrome.runtime.sendMessage({ type: "CUSTOM_RULE", domain, selector });
        if (!response.ok) throw new Error(response.error);
        stopPicker();
        await refresh();
      } catch (error) {
        label.textContent = error instanceof Error ? error.message : "Erro ao salvar";
      }
    });
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "REFRESH") refresh();
    if (message?.type === "START_PICK") startPicker();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      earlyYoutubeConfig();
      refresh();
    }
  });
  earlyYoutubeConfig();
  refresh();
})();
