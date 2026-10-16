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
    const domain = normalizeDomain(host);
    return allowed.some((item) => domain === item || domain.endsWith(`.${item}`));
  }
  async function getSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    if (!settings) return structuredClone(DEFAULT_SETTINGS);
    return { ...structuredClone(DEFAULT_SETTINGS), ...settings, lists: { ...DEFAULT_SETTINGS.lists, ...settings.lists }, listMeta: settings.listMeta || {} };
  }
  async function saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }

  // scripts/compiler.mjs
  var TYPE_MAP = { script: "script", image: "image", stylesheet: "stylesheet", xmlhttprequest: "xmlhttprequest", subdocument: "sub_frame", font: "font", media: "media", ping: "ping", websocket: "websocket", other: "other" };
  function parseNetwork(line) {
    let allow = false;
    if (line.startsWith("@@")) {
      allow = true;
      line = line.slice(2);
    }
    if (!line.startsWith("||") || line.includes("##") || line.includes("#@#")) return null;
    const [pattern, optText = ""] = line.split("$", 2);
    if (!/^\|\|[a-z\d.-]+(?:\^|\/|\|)/i.test(pattern) || pattern.length > 512) return null;
    const domain = pattern.slice(2).split(/[\^/|]/)[0];
    if (!domain.includes(".") || domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) return null;
    const condition = { urlFilter: pattern };
    const types = [];
    let included = [];
    let excluded = [];
    for (const option of optText.split(",").filter(Boolean)) {
      if (option === "third-party") condition.domainType = "thirdParty";
      else if (option === "~third-party") condition.domainType = "firstParty";
      else if (TYPE_MAP[option]) types.push(TYPE_MAP[option]);
      else if (option.startsWith("domain=")) {
        for (const d of option.slice(7).split("|")) {
          if (!/^~?[a-z\d.-]+$/i.test(d)) return null;
          (d.startsWith("~") ? excluded : included).push(d.replace(/^~/, ""));
        }
      } else return null;
    }
    if (types.length) condition.resourceTypes = [...new Set(types)];
    if (included.length) condition.initiatorDomains = [...new Set(included)];
    if (excluded.length) condition.excludedInitiatorDomains = [...new Set(excluded)];
    return { priority: allow ? 2 : 1, action: { type: allow ? "allow" : "block" }, condition };
  }
  function parseCosmetic(line) {
    const match = line.match(/^([a-z\d.,-]*)(##|#@#)(.+)$/i);
    if (!match) return null;
    const [, domains, marker, selector] = match;
    if (!selector || selector.length > 240 || /[{};\r\n]/.test(selector) || /:(?:has|contains|matches-css|xpath|upward|remove)\b/i.test(selector)) return null;
    if (!/^[a-z\d .#\[\]="'_*^$|>+~():,-]+$/i.test(selector)) return null;
    const domainList = domains ? domains.split(",") : ["*"];
    if (domainList.some((d) => d !== "*" && !/^[a-z\d.-]+$/i.test(d))) return null;
    return { domains: domainList, selector, exception: marker === "#@#" };
  }
  function compileList(text, { maxRules = 4500, maxCosmetics = 3e3, seen = /* @__PURE__ */ new Set() } = {}) {
    const rules = [], cosmetic = [], stats = { networkSkipped: 0, cosmeticSkipped: 0, duplicates: 0 };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("!") || line.startsWith("[")) continue;
      if (line.includes("##") || line.includes("#@#")) {
        if (cosmetic.length >= maxCosmetics) continue;
        const c = parseCosmetic(line);
        if (c) cosmetic.push(c);
        else stats.cosmeticSkipped++;
        continue;
      }
      const r = parseNetwork(line);
      if (!r) {
        stats.networkSkipped++;
        continue;
      }
      const key = JSON.stringify(r);
      if (seen.has(key)) {
        stats.duplicates++;
        continue;
      }
      seen.add(key);
      rules.push(r);
    }
    const score = (r) => {
      const url = r.condition.urlFilter;
      if (r.action.type === "allow") return 100;
      if (/doubleclick|googlesyndication|googleadservices|adnxs|taboola|outbrain|amazon-adsystem|criteo|pubmatic|rubiconproject|scorecardresearch|youtube\.com\/pagead/i.test(url)) return 90;
      if (/adserver|adsystem|advertis|tracker|tracking|analytics|pixel/i.test(url)) return 15;
      return 0;
    };
    const hash = (r) => {
      let n = 2166136261;
      for (const c of r.condition.urlFilter) {
        n ^= c.charCodeAt(0);
        n = Math.imul(n, 16777619);
      }
      return n >>> 0;
    };
    const selected = rules.sort((a, b) => score(b) - score(a) || hash(a) - hash(b)).slice(0, maxRules);
    selected.forEach((r, i) => r.id = i + 1);
    return { rules: selected, cosmetic, stats };
  }

  // src/background.ts
  var dnr = chrome.declarativeNetRequest;
  var BUILTIN_IDS = LISTS.map((x) => x.id);
  var GLOBAL_PAUSE_ID = 9e5;
  var CUSTOM_RULE_START = 6e5;
  var SITE_RULE_START = 7e5;
  var LIST_RULE_START = 1e5;
  var queue = Promise.resolve(void 0);
  var serial = (task) => {
    const next = queue.then(task, task);
    queue = next.catch(() => {
    });
    return next;
  };
  var cosmeticCache = /* @__PURE__ */ new Map();
  var listRange = (index) => LIST_RULE_START + index * 5e3;
  async function refreshTabs() {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    await Promise.allSettled(tabs.filter((t) => t.id).map((t) => chrome.tabs.sendMessage(t.id, { type: "REFRESH" })));
  }
  function cosmeticIndex(entries) {
    const data = { global: [], domains: {}, exceptions: {} };
    for (const item of entries) for (const domain of item.domains) {
      if (item.exception) (data.exceptions[domain] ??= []).push(item.selector);
      else if (domain === "*") data.global.push(item.selector);
      else (data.domains[domain] ??= []).push(item.selector);
    }
    return data;
  }
  async function replaceRange(start, count, rules) {
    const existing = await dnr.getDynamicRules();
    const removeRuleIds = existing.filter((r) => r.id >= start && r.id < start + count).map((r) => r.id);
    await dnr.updateDynamicRules({ removeRuleIds, addRules: rules });
  }
  async function fetchList(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("A lista precisa usar HTTPS.");
    const res = await fetch(parsed.href, { cache: "no-store", signal: AbortSignal.timeout(2e4) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length < 10 || text.length > 2e7) throw new Error("Tamanho de lista inv\xE1lido (m\xE1ximo 20 MB).");
    return text;
  }
  async function updateList(settings, id) {
    const builtin = LISTS.find((x) => x.id === id);
    const custom = settings.customLists.find((x) => x.id === id);
    if (!builtin && !custom) throw new Error("Lista desconhecida.");
    const index = builtin ? LISTS.findIndex((x) => x.id === id) : LISTS.length + custom.slot;
    if (index >= 15) throw new Error("Limite de 10 listas personalizadas.");
    const range = listRange(index);
    try {
      const text = await fetchList((builtin || custom).url);
      const compiled = compileList(text, { maxRules: builtin ? 3500 : 1e3, maxCosmetics: 1500 });
      if (compiled.rules.length === 0) throw new Error("Nenhuma regra de rede compat\xEDvel foi encontrada.");
      const rules = compiled.rules.map((r, i) => ({ ...r, id: range + i }));
      await replaceRange(range, 5e3, rules);
      await chrome.storage.local.set({ [`cosmetic_${id}`]: cosmeticIndex(compiled.cosmetic) });
      settings.listMeta[id] = { updatedAt: Date.now(), ruleCount: rules.length, duplicates: compiled.stats.duplicates };
      if (custom) {
        custom.updatedAt = Date.now();
        custom.ruleCount = rules.length;
        custom.error = void 0;
      }
      cosmeticCache.delete(id);
      await saveSettings(settings);
      await syncRules(settings);
      await refreshTabs();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      settings.listMeta[id] = { ...settings.listMeta[id], error: message };
      if (custom) custom.error = message;
      await saveSettings(settings);
      throw error;
    }
    return settings;
  }
  async function syncRules(settings) {
    const enabledStatic = BUILTIN_IDS.filter((id) => settings.lists[id] && !settings.listMeta[id]?.updatedAt);
    if (settings.youtube) enabledStatic.push("youtube");
    const current = await dnr.getEnabledRulesets();
    await dnr.updateEnabledRulesets({ enableRulesetIds: enabledStatic.filter((id) => !current.includes(id)), disableRulesetIds: current.filter((id) => !enabledStatic.includes(id)) });
    const currentDynamic = await dnr.getDynamicRules();
    const removeRuleIds = currentDynamic.filter((rule) => {
      if (rule.id >= LIST_RULE_START && rule.id < CUSTOM_RULE_START) {
        const idx = Math.floor((rule.id - LIST_RULE_START) / 5e3);
        const custom = idx < LISTS.length ? void 0 : settings.customLists.find((l) => l.slot === idx - LISTS.length);
        const id = idx < LISTS.length ? LISTS[idx].id : custom?.id;
        return !id || (idx < LISTS.length ? !settings.lists[id] || !settings.listMeta[id]?.updatedAt : !custom?.enabled);
      }
      return rule.id >= CUSTOM_RULE_START;
    }).map((rule) => rule.id);
    const addRules = [];
    if (!settings.enabled) addRules.push({ id: GLOBAL_PAUSE_ID, priority: 1e5, action: { type: dnr.RuleActionType.ALLOW }, condition: { urlFilter: "|http" } });
    settings.allowedSites.slice(0, 100).forEach((domain, i) => {
      addRules.push({ id: SITE_RULE_START + i * 2, priority: 5e4, action: { type: dnr.RuleActionType.ALLOW_ALL_REQUESTS }, condition: { urlFilter: `||${domain}^`, resourceTypes: [dnr.ResourceType.MAIN_FRAME, dnr.ResourceType.SUB_FRAME] } });
      addRules.push({ id: SITE_RULE_START + i * 2 + 1, priority: 5e4, action: { type: dnr.RuleActionType.ALLOW }, condition: { initiatorDomains: [domain] } });
    });
    settings.customNetwork.slice(0, 500).forEach((line, i) => {
      const parsed = parseNetwork(line);
      if (parsed) addRules.push({ ...parsed, id: CUSTOM_RULE_START + i, priority: parsed.action.type === "allow" ? 4e4 : 200 });
    });
    await dnr.updateDynamicRules({ removeRuleIds, addRules });
  }
  async function cosmeticsFor(host, settings) {
    if (!settings.enabled || !settings.cosmetics || isAllowed(host, settings.allowedSites)) return [];
    const domain = normalizeDomain(host);
    const domains = [];
    let part = domain;
    while (part.includes(".")) {
      domains.push(part);
      part = part.slice(part.indexOf(".") + 1);
    }
    const selectors = /* @__PURE__ */ new Set();
    const exceptions = /* @__PURE__ */ new Set();
    for (const list of [...LISTS.filter((l) => settings.lists[l.id]), ...settings.customLists.filter((l) => l.enabled)]) {
      let data = cosmeticCache.get(list.id);
      if (!data) {
        try {
          if (settings.listMeta[list.id]?.updatedAt || list.id.startsWith("custom_")) data = (await chrome.storage.local.get(`cosmetic_${list.id}`))[`cosmetic_${list.id}`];
          else data = await (await fetch(chrome.runtime.getURL(`rules/${list.id}-cosmetic.json`))).json();
          if (!data) continue;
          cosmeticCache.set(list.id, data);
        } catch {
          continue;
        }
      }
      for (const selector of data.global) selectors.add(selector);
      for (const d of domains) {
        for (const selector of data.domains[d] || []) selectors.add(selector);
        for (const selector of data.exceptions[d] || []) exceptions.add(selector);
      }
      for (const selector of data.exceptions["*"] || []) exceptions.add(selector);
    }
    for (const selector of exceptions) selectors.delete(selector);
    for (const rule of settings.customRules) if (domains.includes(rule.domain)) selectors.add(rule.selector);
    return [...selectors].slice(0, 5e3);
  }
  async function status(tabId, url) {
    const settings = await getSettings();
    const domain = normalizeDomain(url || "");
    const { counts = {}, sessionTotal = 0, debugSeen = false } = await chrome.storage.session.get(["counts", "sessionTotal", "debugSeen"]);
    const { total = 0, trackers = 0 } = await chrome.storage.local.get(["total", "trackers"]);
    const page = tabId === void 0 ? void 0 : counts[tabId];
    let pageCount = null;
    if (tabId !== void 0 && page?.startedAt) {
      try {
        if (!allowIdCache) allowIdCache = await (await fetch(chrome.runtime.getURL("rules/allow-ids.json"))).json();
        const matched = await dnr.getMatchedRules({ tabId, minTimeStamp: page.startedAt });
        const dynamic = await dnr.getDynamicRules();
        const actions = new Map(dynamic.map((r) => [r.id, r.action.type]));
        pageCount = matched.rulesMatchedInfo.filter((x) => x.rule.rulesetId === "_dynamic" ? actions.get(x.rule.ruleId) === dnr.RuleActionType.BLOCK : !(allowIdCache?.[x.rule.rulesetId] || []).includes(x.rule.ruleId)).length;
      } catch {
        pageCount = null;
      }
    }
    return { settings, domain, siteAllowed: isAllowed(domain, settings.allowedSites), page: pageCount, session: debugSeen ? sessionTotal : null, total: debugSeen ? total : null, trackers: debugSeen ? trackers : null, statsPartial: true, version: chrome.runtime.getManifest().version };
  }
  async function handle(message, sender) {
    const settings = await getSettings();
    switch (message?.type) {
      case "STATUS":
        return status(message.tabId, message.url);
      case "COSMETICS":
        return { selectors: await cosmeticsFor(message.host, settings), enabled: settings.enabled && !isAllowed(message.host, settings.allowedSites), youtube: settings.youtube, aggressive: settings.level === "aggressive" };
      case "SETTINGS":
        return settings;
      case "SET": {
        const next = { ...settings, ...message.patch };
        if (message.patch?.customNetwork) {
          if (!Array.isArray(next.customNetwork) || next.customNetwork.length > 500 || next.customNetwork.some((line) => typeof line !== "string" || !parseNetwork(line))) throw new Error("Regra de rede inv\xE1lida ou limite de 500 regras atingido.");
        }
        await saveSettings(next);
        await syncRules(next);
        if (message.patch?.enabled === false) await chrome.tabs.query({}).then((tabs) => Promise.allSettled(tabs.filter((t) => t.id).map((t) => chrome.action.setBadgeText({ tabId: t.id, text: "" }))));
        await refreshTabs();
        return next;
      }
      case "TOGGLE_SITE": {
        const domain = normalizeDomain(message.domain);
        if (!domain) throw new Error("Dom\xEDnio inv\xE1lido.");
        const existing = settings.allowedSites.find((d) => domain === d || domain.endsWith(`.${d}`));
        if (!existing && settings.allowedSites.length >= 100) throw new Error("Limite de 100 sites permitidos.");
        settings.allowedSites = existing ? settings.allowedSites.filter((d) => d !== existing) : [...settings.allowedSites, domain];
        await saveSettings(settings);
        await syncRules(settings);
        await refreshTabs();
        return settings;
      }
      case "TOGGLE_LIST": {
        const id = message.id;
        if (!BUILTIN_IDS.includes(id)) throw new Error("Lista inv\xE1lida.");
        settings.lists[id] = !settings.lists[id];
        await saveSettings(settings);
        if (settings.lists[id] && settings.listMeta[id]?.updatedAt) {
          await updateList(settings, id);
        } else {
          await syncRules(settings);
          await refreshTabs();
        }
        return settings;
      }
      case "UPDATE_LIST":
        return updateList(settings, String(message.id));
      case "ADD_CUSTOM_LIST": {
        const url = new URL(String(message.url));
        if (url.protocol !== "https:") throw new Error("Use uma URL HTTPS.");
        if (settings.customLists.length >= 10) throw new Error("Limite de 10 listas personalizadas.");
        const used = new Set(settings.customLists.map((l) => l.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        const item = { id: `custom_${Date.now()}`, slot, name: url.hostname, url: url.href, enabled: true };
        settings.customLists.push(item);
        await saveSettings(settings);
        await updateList(settings, item.id);
        return settings;
      }
      case "TOGGLE_CUSTOM_LIST": {
        const item = settings.customLists.find((l) => l.id === message.id);
        if (!item) throw new Error("Lista n\xE3o encontrada.");
        item.enabled = !item.enabled;
        await saveSettings(settings);
        if (item.enabled) await updateList(settings, item.id);
        else {
          await syncRules(settings);
          await refreshTabs();
        }
        return settings;
      }
      case "REMOVE_CUSTOM_LIST": {
        const i = settings.customLists.findIndex((l) => l.id === message.id);
        if (i < 0) throw new Error("Lista n\xE3o encontrada.");
        await replaceRange(listRange(LISTS.length + settings.customLists[i].slot), 5e3, []);
        await chrome.storage.local.remove(`cosmetic_${settings.customLists[i].id}`);
        cosmeticCache.delete(settings.customLists[i].id);
        settings.customLists.splice(i, 1);
        await saveSettings(settings);
        await syncRules(settings);
        await refreshTabs();
        return settings;
      }
      case "CUSTOM_RULE": {
        const domain = normalizeDomain(message.domain), selector = String(message.selector || "");
        if (!domain || !parseCosmetic(`${domain}##${selector}`)) throw new Error("Regra inv\xE1lida.");
        if (settings.customRules.length >= 500) throw new Error("Limite de 500 regras cosm\xE9ticas.");
        if (!settings.customRules.some((x) => x.domain === domain && x.selector === selector)) settings.customRules.push({ domain, selector });
        await saveSettings(settings);
        await refreshTabs();
        return settings;
      }
      case "PICK": {
        if (!sender.tab?.id && !message.tabId) throw new Error("Aba indispon\xEDvel.");
        await chrome.tabs.sendMessage(message.tabId || sender.tab.id, { type: "START_PICK" });
        return { ok: true };
      }
      case "RESET_STATS": {
        await chrome.storage.local.set({ total: 0, trackers: 0 });
        await chrome.storage.session.set({ counts: {}, sessionTotal: 0 });
        const tabs = await chrome.tabs.query({});
        await Promise.allSettled(tabs.filter((t) => t.id).map((t) => chrome.action.setBadgeText({ tabId: t.id, text: "" })));
        return { ok: true };
      }
      case "IMPORT": {
        const imported = message.settings;
        if (!imported || typeof imported !== "object") throw new Error("Configura\xE7\xE3o inv\xE1lida.");
        const next = {
          ...DEFAULT_SETTINGS,
          enabled: imported.enabled !== false,
          level: imported.level === "aggressive" ? "aggressive" : "standard",
          youtube: imported.youtube !== false,
          cosmetics: imported.cosmetics !== false,
          allowedSites: Array.isArray(imported.allowedSites) ? imported.allowedSites.map(normalizeDomain).filter(Boolean).slice(0, 100) : [],
          customRules: Array.isArray(imported.customRules) ? imported.customRules.filter((r) => normalizeDomain(r.domain) && typeof r.selector === "string" && parseCosmetic(`${normalizeDomain(r.domain)}##${r.selector}`)).slice(0, 500) : [],
          customNetwork: Array.isArray(imported.customNetwork) ? imported.customNetwork.filter((r) => typeof r === "string" && parseNetwork(r)).slice(0, 500) : [],
          lists: { ...DEFAULT_SETTINGS.lists, ...imported.lists },
          customLists: [],
          listMeta: {}
        };
        await saveSettings(next);
        await syncRules(next);
        await refreshTabs();
        return next;
      }
      default:
        throw new Error("Comando desconhecido.");
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    serial(() => handle(message, sender)).then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
  chrome.runtime.onInstalled.addListener(() => {
    serial(async () => {
      await syncRules(await getSettings());
      await chrome.alarms.create("lists", { periodInMinutes: 24 * 60 });
      await chrome.contextMenus.create({ id: "pick", title: "Bloquear elemento com Noir Shield", contexts: ["page", "image", "link"] });
    }).catch(console.error);
  });
  chrome.runtime.onStartup.addListener(() => {
    serial(async () => {
      await syncRules(await getSettings());
      await chrome.alarms.create("lists", { periodInMinutes: 24 * 60 });
    }).catch(console.error);
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "lists") serial(async () => {
      const s = await getSettings();
      for (const list of LISTS) if (s.lists[list.id]) try {
        await updateList(s, list.id);
      } catch (e) {
        console.warn("List update failed", list.id, e);
      }
    }).catch(console.error);
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pick" && tab?.id) chrome.tabs.sendMessage(tab.id, { type: "START_PICK" }).catch(() => {
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "loading") {
      const startedAt = Date.now();
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {
      });
      chrome.storage.session.get("counts").then(({ counts = {} }) => {
        counts[tabId] = { count: 0, trackers: 0, startedAt };
        return chrome.storage.session.set({ counts });
      }).catch(() => {
      });
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.get("counts").then(({ counts = {} }) => {
      delete counts[tabId];
      return chrome.storage.session.set({ counts });
    }).catch(() => {
    });
  });
  var allowIdCache;
  if (dnr.onRuleMatchedDebug && chrome.runtime.getManifest().permissions?.includes("declarativeNetRequestFeedback")) {
    dnr.onRuleMatchedDebug.addListener((info) => {
      if (info.request.tabId < 0) return;
      const tabId = info.request.tabId;
      serial(async () => {
        if (!allowIdCache) allowIdCache = await (await fetch(chrome.runtime.getURL("rules/allow-ids.json"))).json();
        const matched = info.rule;
        if (matched.rulesetId === "_dynamic") {
          const rule = (await dnr.getDynamicRules()).find((r) => r.id === matched.ruleId);
          if (!rule || rule.action.type !== dnr.RuleActionType.BLOCK) return;
        } else if ((allowIdCache?.[matched.rulesetId] || []).includes(matched.ruleId)) return;
        const { counts = {} } = await chrome.storage.session.get("counts");
        const c = counts[tabId] || { count: 0, trackers: 0 };
        c.count++;
        const tracker = info.rule.rulesetId === "easyprivacy" || info.rule.rulesetId === "adguard_tracking";
        if (tracker) c.trackers++;
        counts[tabId] = c;
        const { sessionTotal = 0 } = await chrome.storage.session.get("sessionTotal");
        await chrome.storage.session.set({ counts, sessionTotal: sessionTotal + 1, debugSeen: true });
        const stored = await chrome.storage.local.get(["total", "trackers"]);
        await chrome.storage.local.set({ total: (stored.total || 0) + 1, trackers: (stored.trackers || 0) + (tracker ? 1 : 0) });
        await chrome.action.setBadgeText({ tabId, text: String(c.count) });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: "#5DC9A5" });
      }).catch(() => {
      });
    });
  }
})();
