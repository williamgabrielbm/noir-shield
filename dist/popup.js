"use strict";
(() => {
  // src/shared.ts
  var LISTS = [
    { id: "easylist", name: "EasyList", url: "https://easylist.to/easylist/easylist.txt", defaultOn: true, kind: "ads" },
    { id: "easyprivacy", name: "EasyPrivacy", url: "https://easylist.to/easylist/easyprivacy.txt", defaultOn: true, kind: "trackers" },
    { id: "adguard_base", name: "AdGuard Base", url: "https://filters.adtidy.org/extension/chromium/filters/2.txt", defaultOn: false, kind: "ads" },
    { id: "adguard_tracking", name: "AdGuard Tracking Protection", url: "https://filters.adtidy.org/extension/chromium/filters/3.txt", defaultOn: false, kind: "trackers" },
    { id: "adguard_pt", name: "AdGuard Spanish/Portuguese", url: "https://filters.adtidy.org/extension/chromium/filters/9.txt", defaultOn: true, kind: "ads" }
  ];

  // src/popup.ts
  var $ = (id) => document.getElementById(id);
  var tab;
  var state;
  async function send(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...extra });
    if (!response?.ok) throw new Error(response?.error || "Falha de comunica\xE7\xE3o");
    return response.data;
  }
  function error(message) {
    const node = $("error");
    node.textContent = message;
    node.hidden = false;
    setTimeout(() => node.hidden = true, 5e3);
  }
  async function render() {
    state = await send("STATUS", { tabId: tab?.id, url: tab?.url });
    const s = state.settings;
    const on = s.enabled && !state.siteAllowed;
    $("domain").textContent = state.domain || "P\xE1gina sem dom\xEDnio";
    $("page-count").textContent = state.page === null ? "\u2014" : String(state.page);
    $("ads-count").textContent = state.page === null ? "Sem contagem" : `${state.page} nesta p\xE1gina`;
    $("trackers-count").textContent = state.trackers === null ? "Sem contagem" : `${state.trackers} no total*`;
    $("counter-note").textContent = "* Contadores parciais: dispon\xEDveis apenas quando o navegador fornece eventos de depura\xE7\xE3o.";
    $("state-text").textContent = !s.enabled ? "Prote\xE7\xE3o pausada" : state.siteAllowed ? "Site permitido" : "Navega\xE7\xE3o protegida";
    $("engine-state").textContent = on ? "Motor DNR ativo" : "Prote\xE7\xE3o pausada";
    $("power").classList.toggle("off", !s.enabled);
    $("site-toggle").classList.toggle("on", on);
    $("site-toggle").setAttribute("aria-label", on ? "Pausar prote\xE7\xE3o no site" : "Ativar prote\xE7\xE3o no site");
    $("youtube-state").textContent = s.youtube ? "Ativo" : "Desativado";
    $("filters-count").textContent = `${LISTS.filter((l) => s.lists[l.id]).length} listas ativas`;
    $("level").value = s.level;
    $("level-note").textContent = s.level === "aggressive" ? "Tenta acelerar an\xFAncios de v\xEDdeo detectados; pode afetar alguns players." : "Bloqueia requisi\xE7\xF5es e oculta elementos publicit\xE1rios conhecidos.";
    $("pick").toggleAttribute("disabled", !on || !tab?.id);
    $("youtube-card").classList.toggle("off", !s.youtube);
  }
  async function action(task) {
    try {
      await task();
      await render();
    } catch (e) {
      error(e instanceof Error ? e.message : String(e));
    }
  }
  async function init() {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await render();
    $("power").addEventListener("click", () => action(() => send("SET", { patch: { enabled: !state.settings.enabled } })));
    $("site-toggle").addEventListener("click", () => action(() => send("TOGGLE_SITE", { domain: state.domain })));
    $("level").addEventListener("change", () => action(() => send("SET", { patch: { level: $("level").value } })));
    $("youtube-card").addEventListener("click", () => action(() => send("SET", { patch: { youtube: !state.settings.youtube } })));
    for (const id of ["ads-card", "trackers-card", "filters-card", "settings"]) $(id).addEventListener("click", () => chrome.runtime.openOptionsPage());
    $("pick").addEventListener("click", () => action(async () => {
      await send("PICK", { tabId: tab?.id });
      window.close();
    }));
  }
  init().catch((e) => error(e instanceof Error ? e.message : String(e)));
})();
