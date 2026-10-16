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

  // src/options.ts
  var $ = (id) => document.getElementById(id);
  var settings;
  var packagedAt;
  async function send(type, extra = {}) {
    const r = await chrome.runtime.sendMessage({ type, ...extra });
    if (!r?.ok) throw new Error(r?.error || "Erro");
    return r.data;
  }
  function message(text) {
    const n = $("message");
    n.textContent = text;
    n.hidden = false;
    setTimeout(() => n.hidden = true, 5e3);
  }
  function button(text, fn, kind = "btn small") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = kind;
    b.textContent = text;
    b.addEventListener("click", fn);
    return b;
  }
  function row(title, description, actions = []) {
    const line = document.createElement("div");
    line.className = "list-row";
    const left = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = description;
    left.append(strong, small);
    line.append(left, ...actions);
    return line;
  }
  async function perform(task) {
    try {
      await task();
      await render();
      message("Altera\xE7\xE3o salva.");
    } catch (e) {
      message(e instanceof Error ? e.message : String(e));
    }
  }
  async function render() {
    settings = await send("SETTINGS");
    for (const name of ["enabled", "cosmetics", "youtube"]) $(name).checked = settings[name];
    $("level").value = settings.level;
    $("version").textContent = `Vers\xE3o ${chrome.runtime.getManifest().version}`;
    $("builtin-lists").replaceChildren(...LISTS.map((list) => {
      const meta = settings.listMeta[list.id];
      const checked = document.createElement("input");
      checked.type = "checkbox";
      checked.checked = settings.lists[list.id];
      checked.setAttribute("aria-label", `Ativar ${list.name}`);
      checked.addEventListener("change", () => perform(() => send("TOGGLE_LIST", { id: list.id })));
      const update = button("Atualizar", () => perform(() => send("UPDATE_LIST", { id: list.id })));
      const detail = meta?.error ? `Falha: ${meta.error}` : meta?.updatedAt ? `${meta.ruleCount || 0} regras \xB7 ${new Date(meta.updatedAt).toLocaleString("pt-BR")}` : packagedAt ? `Pacote de ${new Date(packagedAt).toLocaleString("pt-BR")}` : "Vers\xE3o inclu\xEDda no pacote";
      return row(list.name, detail, [checked, update]);
    }));
    $("custom-lists").replaceChildren(...settings.customLists.map((list) => {
      const checked = document.createElement("input");
      checked.type = "checkbox";
      checked.checked = list.enabled;
      checked.setAttribute("aria-label", `Ativar ${list.name}`);
      checked.addEventListener("change", () => perform(() => send("TOGGLE_CUSTOM_LIST", { id: list.id })));
      const update = button("Atualizar", () => perform(() => send("UPDATE_LIST", { id: list.id })));
      const remove = button("Excluir", () => perform(() => send("REMOVE_CUSTOM_LIST", { id: list.id })), "btn small danger");
      return row(list.name, list.error ? `Falha: ${list.error}` : `${list.ruleCount || 0} regras \xB7 ${list.url}`, [checked, update, remove]);
    }));
    $("site-list").replaceChildren(...settings.allowedSites.map((domain) => row(domain, "Bloqueio pausado para este dom\xEDnio", [button("Remover", () => perform(() => send("TOGGLE_SITE", { domain })), "btn small danger")])));
    $("cosmetic-rules").replaceChildren(...settings.customRules.map((rule, index) => row(rule.domain, rule.selector, [button("Desfazer", () => perform(() => send("SET", { patch: { customRules: settings.customRules.filter((_, i) => i !== index) } })), "btn small danger")])));
    $("network-rules").replaceChildren(...settings.customNetwork.map((rule, index) => row(rule, "Regra de rede personalizada", [button("Excluir", () => perform(() => send("SET", { patch: { customNetwork: settings.customNetwork.filter((_, i) => i !== index) } })), "btn small danger")])));
    const s = await send("STATUS");
    $("stats-text").textContent = s.total === null ? "Total acumulado indispon\xEDvel neste navegador." : `${s.total} bloqueios registrados no total; ${s.trackers} identificados como rastreadores. Dados parciais.`;
    $("diagnostics").textContent = `Motor: declarativeNetRequest \xB7 ${LISTS.filter((l) => settings.lists[l.id]).length} listas inclu\xEDdas ativas \xB7 ${settings.customRules.length} regras cosm\xE9ticas pessoais \xB7 ${settings.customNetwork.length} regras de rede pessoais.`;
  }
  async function init() {
    try {
      packagedAt = (await (await fetch(chrome.runtime.getURL("rules/metadata.json"))).json()).builtAt;
    } catch {
    }
    await render();
    for (const name of ["enabled", "cosmetics", "youtube"]) $(name).addEventListener("change", () => perform(() => send("SET", { patch: { [name]: $(name).checked } })));
    $("level").addEventListener("change", () => perform(() => send("SET", { patch: { level: $("level").value } })));
    $("add-list").addEventListener("click", () => perform(async () => {
      await send("ADD_CUSTOM_LIST", { url: $("custom-list-url").value });
      $("custom-list-url").value = "";
    }));
    $("add-site").addEventListener("click", () => perform(async () => {
      const domain = normalizeDomain($("site-input").value);
      if (!domain) throw new Error("Dom\xEDnio inv\xE1lido.");
      if (!settings.allowedSites.includes(domain)) await send("TOGGLE_SITE", { domain });
      $("site-input").value = "";
    }));
    $("add-rule").addEventListener("click", () => perform(async () => {
      const domain = normalizeDomain($("rule-domain").value), selector = $("rule-selector").value.trim();
      if (!domain || !validSelector(selector)) throw new Error("Dom\xEDnio ou seletor CSS inv\xE1lido.");
      await send("CUSTOM_RULE", { domain, selector });
      $("rule-selector").value = "";
    }));
    $("add-network").addEventListener("click", () => perform(async () => {
      const rule = $("network-rule").value.trim();
      if (!/^@@?\|\||^\|\|/.test(rule)) throw new Error("Use uma regra iniciada por || ou @@||.");
      await send("SET", { patch: { customNetwork: [...settings.customNetwork, rule] } });
      $("network-rule").value = "";
    }));
    $("reset-stats").addEventListener("click", () => perform(() => send("RESET_STATS")));
    $("export").addEventListener("click", async () => {
      const current = await send("SETTINGS");
      const data = JSON.stringify({ format: "noir-shield-settings-v1", settings: current }, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "noir-shield-config.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    });
    $("import-file").addEventListener("change", () => perform(async () => {
      const file = $("import-file").files?.[0];
      if (!file) throw new Error("Selecione um arquivo.");
      if (file.size > 1e6) throw new Error("Arquivo muito grande.");
      const data = JSON.parse(await file.text());
      if (data.format !== "noir-shield-settings-v1") throw new Error("Formato inv\xE1lido.");
      await send("IMPORT", { settings: data.settings });
    }));
  }
  init().catch((e) => message(e instanceof Error ? e.message : String(e)));
})();
