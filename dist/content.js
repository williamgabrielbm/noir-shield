"use strict";
(() => {
  // src/shared.ts
  function normalizeDomain(input) {
    try {
      const url = new URL(input.includes("://") ? input : `https://${input}`);
      return url.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
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
  var YT_SELECTORS = [
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-ad-slot-renderer",
    "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer",
    "ytd-compact-promoted-video-renderer",
    "ytd-reel-video-renderer[is-ad]",
    "#player-ads",
    "#masthead-ad",
    "yt-mealbar-promo-renderer",
    ".ytp-ad-overlay-container"
  ];
  var protectedPage = false;
  var youtubeEnabled = false;
  var aggressive = false;
  var observer;
  var scheduled = false;
  var savedPlayer;
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
    try {
      const response = await chrome.runtime.sendMessage({ type: "COSMETICS", host: domain });
      if (!response?.ok) throw new Error(response?.error || "Sem resposta");
      const data = response.data;
      protectedPage = data.enabled;
      youtubeEnabled = data.enabled && data.youtube && /(^|\.)youtube\.com$/.test(domain);
      aggressive = data.aggressive;
      const safe = data.selectors.filter(validSelector);
      if (protectedPage && safe.length) {
        const chunks = [];
        for (let i = 0; i < safe.length; i += 100) chunks.push(`${safe.slice(i, i + 100).join(",")} { display: none !important; }`);
        style(STYLE_ID, chunks.join("\n"));
      } else removeStyle(STYLE_ID);
      if (youtubeEnabled) {
        style(YT_STYLE_ID, `${YT_SELECTORS.join(",")} { display:none !important; }`);
        startYoutube();
      } else {
        removeStyle(YT_STYLE_ID);
        stopYoutube();
      }
    } catch {
      removeStyle(STYLE_ID);
      removeStyle(YT_STYLE_ID);
      stopYoutube();
    }
  }
  function restorePlayer() {
    if (savedPlayer) {
      const { element, muted, rate } = savedPlayer;
      if (element.isConnected) {
        element.muted = muted;
        element.playbackRate = rate;
      }
      savedPlayer = void 0;
    }
  }
  function inspectYoutube() {
    scheduled = false;
    if (!youtubeEnabled) return;
    const player = document.querySelector("#movie_player");
    const adPlaying = !!player?.classList.contains("ad-showing");
    if (!adPlaying) {
      restorePlayer();
      return;
    }
    const skip = player?.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button");
    if (skip && skip.getBoundingClientRect().width > 0) {
      skip.click();
      return;
    }
    if (!aggressive) {
      restorePlayer();
      return;
    }
    const video = player?.querySelector("video.html5-main-video");
    if (!video) return;
    if (!savedPlayer || savedPlayer.element !== video) {
      restorePlayer();
      savedPlayer = { element: video, muted: video.muted, rate: video.playbackRate };
    }
    video.muted = true;
    if (video.playbackRate < 8) video.playbackRate = 8;
    if (Number.isFinite(video.duration) && video.duration > 1 && video.duration < 180 && video.currentTime < video.duration - 0.5) {
      try {
        video.currentTime = video.duration - 0.3;
      } catch {
      }
    }
  }
  function scheduleYoutube() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(inspectYoutube, 180);
  }
  function startYoutube() {
    if (observer) return;
    observer = new MutationObserver(scheduleYoutube);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "is-ad"] });
    document.addEventListener("yt-navigate-finish", scheduleYoutube);
    window.addEventListener("popstate", scheduleYoutube);
    scheduleYoutube();
  }
  function stopYoutube() {
    observer?.disconnect();
    observer = void 0;
    document.removeEventListener("yt-navigate-finish", scheduleYoutube);
    window.removeEventListener("popstate", scheduleYoutube);
    restorePlayer();
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
  refresh();
})();
