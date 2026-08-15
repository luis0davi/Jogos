// ==============================
// THERMOLINK - CONFIGURAÇÃO CORRIGIDA
// ==============================
const SUPABASE_URL = "https://zawnluboujbovpgrgdcx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  ovens: [],
  readings: new Map(),
  filtered: [],
  selectedModule: null,
  charts: { history: null, modal: null },
  realtime: null
};

const $ = (id) => document.getElementById(id);

function number(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatTemp(v) {
  const n = number(v);
  return n === null ? "--" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C`;
}

function formatTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

function ageMs(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? Infinity : Date.now() - d.getTime();
}

function isOnline(reading) {
  // Considera online se recebeu dado nos últimos 3 minutos
  return reading && ageMs(reading.created_at) <= 3 * 60 * 1000;
}

function ovenName(module) {
  const oven = state.ovens.find(o => Number(o.numero) === Number(module));
  return oven?.nome || `Forno ${String(module).padStart(2, "0")}`;
}

function setConnection(ok, text) {
  if ($("connectionText")) $("connectionText").textContent = text;
  const dot = document.querySelector(".connection .dot");
  if (dot) {
    dot.classList.remove("ok", "bad");
    if (ok === true) dot.classList.add("ok");
    if (ok === false) dot.classList.add("bad");
  }
}

async function loadCompany() {
  try {
    const { data, error } = await sb.from("empresas").select("id,nome,ativo").eq("ativo", true).order("id").limit(1);
    if (!error && data?.length && $("companyName")) {
      $("companyName").textContent = data[0].nome;
    }
  } catch (e) {
    console.warn("Tabela 'empresas' não encontrada ou vazia. Usando nome padrão.");
  }
}

async function loadOvens() {
  try {
    const { data, error } = await sb
      .from("fornos")
      .select("id,dispositivo_id,numero,nome,ativo")
      .eq("ativo", true)
      .order("numero", { ascending: true });

    if (error || !data || data.length === 0) throw new Error("Sem dados na tabela fornos");
    state.ovens = data;
  } catch (error) {
    console.warn("Tabela 'fornos' indisponível. Gerando automaticamente Fornos de 1 a 31.");
    // Fallback de segurança: Se sua tabela 'fornos' estiver vazia, criamos os 31 fornos dinamicamente para o site funcionar
    state.ovens = [];
    for (let i = 1; i <= 31; i++) {
      state.ovens.push({ id: i, numero: i, nome: `Forno ${String(i).padStart(2, "0")}`, ativo: true });
    }
  }
}

async function loadLatestReadings() {
  // CORREÇÃO: Mudado 'módulo_atual' para 'modulo_alutal' e 'data_hora' para 'created_at'
  const { data, error } = await sb
    .from("leituras")
    .select("id,dispositivo_id,forno_id,modulo_alutal,canal_1,canal_2,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Erro ao carregar leituras:", error);
    setConnection(false, "Erro ao carregar dados");
    throw error;
  }

  setConnection(true, "Conectado ao Supabase");

  const map = new Map();
  for (const row of (data || [])) {
    const module = Number(row.modulo_alutal); // CORREÇÃO: mapeando via modulo_alutal
    if (!Number.isFinite(module)) continue;
    if (!map.has(module)) map.set(module, row);
  }
  state.readings = map;
  renderAll();
}

function renderAll() {
  const searchInput = $("searchInput");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  
  state.filtered = state.ovens.filter(o => {
    const name = (o.nome || "").toLowerCase();
    const num = String(o.numero || "");
    return !query || name.includes(query) || num.includes(query);
  });

  if ($("totalFornos")) $("totalFornos").textContent = state.ovens.length;

  let online = 0;
  for (const oven of state.ovens) {
    const r = state.readings.get(Number(oven.numero));
    if (isOnline(r)) online++;
  }
  
  if ($("activeFornos")) $("activeFornos").textContent = online;
  if ($("offlineFornos")) $("offlineFornos").textContent = Math.max(0, state.ovens.length - online);

  renderOvenGrid();
  renderOvensTable();
  renderHistorySelect();

  const newest = [...state.readings.values()]
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0]; // CORREÇÃO: created_at
    
  if ($("lastUpdate")) {
    $("lastUpdate").textContent = newest ? `Última telemetria: ${formatTime(newest.created_at)}` : "Aguardando dados...";
  }
}

function renderOvenGrid() {
  const grid = $("ovenGrid");
  if (!grid) return;
  
  if (!state.filtered.length) {
    grid.innerHTML = `<div class="loading-card"><p>Nenhum forno encontrado.</p></div>`;
    return;
  }

  // Função simples para evitar erros de injeção de HTML script
  const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  grid.innerHTML = state.filtered.map(oven => {
    const module = Number(oven.numero);
    const r = state.readings.get(module);
    const online = isOnline(r);
    const temp = number(r?.canal_1);
    const ch2 = number(r?.canal_2);

    return `
      <article class="oven-card" data-module="${module}" style="cursor:pointer;">
        <div class="oven-head">
          <div class="oven-name">${escapeHtml(oven.nome || ovenName(module))}</div>
          <span class="status ${online ? "online" : "offline"}">${online ? "● Online" : "● Offline"}</span>
        </div>
        <div class="temperature">${formatTemp(temp)}</div>
        <div class="temp-caption">Canal 1 • Módulo ${module}</div>
        <div class="oven-footer">
          <div class="mini-metric">
            <span>Canal 2</span>
            <strong>${ch2 === null ? "--" : ch2 + " °C"}</strong>
          </div>
          <div class="mini-metric" style="text-align:right">
            <span>Última leitura</span>
            <strong>${formatTime(r?.created_at)}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll(".oven-card").forEach(card => {
    card.addEventListener("click", () => {
      if (typeof openOven === "function") openOven(Number(card.dataset.module));
    });
  });
}

function renderOvensTable() {
  const wrap = $("ovensTableWrap");
  if (!wrap) return;

  const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = state.ovens.map(oven => {
    const module = Number(oven.numero);
    const r = state.readings.get(module);
    const online = isOnline(r);
    return `<tr>
      <td><strong>${escapeHtml(oven.nome || ovenName(module))}</strong></td>
      <td>${module}</td>
      <td>${formatTemp(r?.canal_1)}</td>
      <td>${r?.canal_2 !== undefined && r?.canal_2 !== null ? r.canal_2 + " °C" : "--"}</td>
      <td><span class="status ${online ? "online" : "offline"}">${online ? "● Online" : "● Offline"}</span></td>
      <td>${formatTime(r?.created_at)}</td>
    </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Forno</th><th>Módulo</th><th>Canal 1</th><th>Canal 2</th><th>Status</th><th>Última leitura</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Nenhum forno cadastrado.</td></tr>'}</tbody>
    </table>`;
}

function renderHistorySelect() {
  const select = $("historySelect");
  if (!select) return;
  
  const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const current = select.value;
  
  select.innerHTML = state.ovens.map(o =>
    `<option value="${Number(o.numero)}">${escapeHtml(o.nome || ovenName(o.numero))}</option>`
  ).join("");
  
  if (current && state.ovens.some(o => String(o.numero) === current)) select.value = current;
  if (!select.value && state.ovens[0]) select.value = String(state.ovens[0].numero);
}

async function getHistory(module, limit = 120) {
  // CORREÇÃO: Mudado para 'modulo_alutal' e 'created_at'
  const { data, error } = await sb
    .from("leituras")
    .select("canal_1,canal_2,modulo_alutal,created_at")
    .eq("modulo_alutal", module)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Erro no histórico:", error);
    return [];
  }
  return (data || []).reverse();
}

// Inicializador automático para ligar as funções assim que a página carregar
document.addEventListener("DOMContentLoaded", async () => {
  setConnection(null, "Conectando...");
  await loadCompany();
  await loadOvens();
  await loadLatestReadings();
  
  // Atualiza os dados da tela automaticamente a cada 15 segundos
  setInterval(loadLatestReadings, 15000);
});
