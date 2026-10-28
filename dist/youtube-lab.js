"use strict";
(() => {
  // src/youtube-lab.ts
  var legacy = { network: true, player: true, skip: true, cosmetics: true, probes: false };
  var defaults = { ...legacy, probes: true };
  var presets = [
    { label: "Equil\xEDbrio experimental", hint: "Mant\xE9m o bloqueio de an\xFAncios sem cortar duas sondagens de status observadas; desativa cliques autom\xE1ticos", flags: { ...defaults, skip: false } },
    { label: "Preservar somente player", hint: "Desliga DNR para o YouTube, mant\xE9m sanitiza\xE7\xE3o de an\xFAncios e filtros visuais", flags: { ...defaults, network: false, skip: false } },
    { label: "Com pulo autom\xE1tico", hint: "Usa o bot\xE3o nativo de pular quando ele aparece", flags: { ...defaults } },
    { label: "Original sem exce\xE7\xF5es", hint: "Equivalente ao comportamento de rede do Noir Shield anterior", flags: { ...legacy } },
    { label: "Isolar altera\xE7\xE3o do player", hint: "Desativa hooks para checar se a detec\xE7\xE3o est\xE1 no JavaScript", flags: { ...defaults, player: false, skip: false } },
    { label: "Compatibilidade total", hint: "Controle para comparar: no YouTube, an\xFAncios podem aparecer", flags: { network: false, player: false, skip: false, cosmetics: false, probes: false } }
  ];
  var active = { ...defaults };
  var busy = false;
  var status = document.getElementById("status");
  var globalState = document.getElementById("global-state");
  var checks = [...document.querySelectorAll("[data-flag]")];
  function announce(msg, error = false) {
    status.textContent = msg;
    status.classList.toggle("error", error);
  }
  function render() {
    for (const x of checks) {
      x.checked = active[x.dataset.flag];
      x.disabled = busy;
    }
    for (const b of document.querySelectorAll("button")) b.disabled = busy;
  }
  async function request(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Falha ao obter resposta do service worker");
    return response.data;
  }
  async function globalInfo(settings) {
    const s = settings || await request({ type: "SETTINGS" });
    globalState.textContent = (!s.enabled ? "Prote\xE7\xE3o geral DESLIGADA. " : "") + (!s.youtube ? "M\xF3dulo YouTube DESLIGADO. " : "") + (!s.cosmetics ? "CSS geral DESLIGADO. " : "") || "Prote\xE7\xE3o geral, m\xF3dulo YouTube e CSS global ligados.";
  }
  async function update(next) {
    if (busy) return;
    busy = true;
    render();
    try {
      const s = await request({ type: "SET", patch: { youtubeLab: next } });
      active = { ...defaults, ...s.youtubeLab };
      await globalInfo(s);
      announce("Perfil aplicado. Feche e reabra as abas do YouTube para comparar com a sess\xE3o anterior.");
    } catch (e) {
      announce(e.message, true);
    } finally {
      busy = false;
      render();
    }
  }
  for (const input of checks) input.addEventListener("change", () => {
    const key = input.dataset.flag;
    void update({ ...active, [key]: input.checked });
  });
  for (const preset of presets) {
    const b = document.createElement("button");
    b.textContent = preset.label;
    b.title = preset.hint;
    b.addEventListener("click", () => void update({ ...preset.flags }));
    document.getElementById("presets").append(b);
  }
  document.getElementById("restore").addEventListener("click", () => void update({ ...defaults }));
  document.getElementById("open").addEventListener("click", () => {
    void chrome.tabs.create({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });
  });
  document.getElementById("reload").addEventListener("click", async () => {
    try {
      const tabs = await chrome.tabs.query({ url: ["*://youtube.com/*", "*://*.youtube.com/*"] });
      const responses = await Promise.allSettled(tabs.filter((t) => typeof t.id === "number").map((t) => chrome.tabs.reload(t.id)));
      const failed = responses.filter((r) => r.status === "rejected").length;
      announce(`Atualizadas ${tabs.length - failed} aba(s); ${failed} falha(s). Para a compara\xE7\xE3o definitiva, feche e abra uma nova aba do YouTube.`, failed > 0);
    } catch (e) {
      announce(e.message, true);
    }
  });
  (async () => {
    try {
      const settings = await request({ type: "SETTINGS" });
      active = { ...defaults, ...settings.youtubeLab };
      await globalInfo(settings);
      announce("Experimento pronto. Comece pelo perfil \u201CEquil\xEDbrio experimental\u201D e abra uma aba nova do YouTube.");
    } catch (e) {
      announce(e.message, true);
    }
    render();
  })();
})();
