// ============================================================
// THERMOLINK V2 - CONTROLE CENTRAL DE TELEMETRIA (FORNOS 1 A 31)
// ============================================================
const SUPABASE_URL = "https://zawnluboujbovpgrgdcx.supabase.co"; // URL RESTAURADA
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

const $ = id => document.getElementById(id);
const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
const temp = v => { const n = num(v); return n === null ? "--" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C` };
const time = v => { if (!v) return "--"; const d = new Date(v); return Number.isNaN(d.getTime()) ? "--" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
const age = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? Infinity : Date.now() - d.getTime() };
const online = r => r && age(r.created_at) <= 3 * 60 * 1000;
const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "'" }[c]));

function ovenName(modulo) {
  const o = state.ovens.find(x => Number(x.numero) === Number(modulo));
  return o?.nome || `Forno ${String(modulo).padStart(2, "0")}`;
}

function setConnection(status, text) {
  if ($("connectionText")) $("connectionText").textContent = text;
  const dot = document.querySelector(".connection .dot");
  if (dot) dot.className = "dot " + (status === true ? "ok" : status === false ? "bad" : "");
}

async function loadCompany() {
  try {
    const { data, error } = await sb.from("empresas").select("id,nome,ativo").eq("ativo", true).order("id").limit(1);
    if (error) throw error;
    if (data?.[0]) {
      if ($("companyName")) $("companyName").textContent = data[0].nome;
      if ($("companyNameTop")) $("companyNameTop").textContent = data[0].nome;
    }
  } catch (err) {
    console.error("[Erro loadCompany]:", err.message || err);
  }
}

async function loadOvens() {
  try {
    const { data, error } = await sb.from("fornos").select("id,dispositivo_id,numero,nome,ativo").eq("ativo", true).order("numero", { ascending: true });
    if (error) throw error;
    if (!data || !data.length) throw new Error("Tabela 'fornos' retornou vazia.");
    state.ovens = data;
  } catch (err) {
    console.warn("[Aviso loadOvens]: Iniciando modo de contingência (Fornos 1 a 31). Motivo:", err.message || err);
    state.ovens = [];
    for (let i = 1; i <= 31; i++) {
      state.ovens.push({ id: i, numero: i, nome: `Forno ${String(i).padStart(2, "0")}`, ativo: true });
    }
  }
}

async function loadLatest() {
  try {
    const { data, error } = await sb.from("leituras").select("id,dispositivo_id,forno_id,modulo_alutal,canal_1,canal_2,created_at").order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    
    setConnection(true, "ThermoLink Conectado");
    const readingsMap = new Map();
    for (const r of data || []) {
      const mod = Number(r.modulo_alutal);
      if (Number.isFinite(mod) && !readingsMap.has(mod)) readingsMap.set(mod, r);
    }
    state.readings = readingsMap;
    render();
  } catch (err) {
    console.error("[Erro loadLatest]:", err.message || err);
    setConnection(false, "Erro na telemetria");
  }
}

function render() {
  const searchIn = $("searchInput");
  const q = searchIn ? searchIn.value.trim().toLowerCase() : "";
  state.filtered = state.ovens.filter(o => !q || (o.nome || "").toLowerCase().includes(q) || String(o.numero).includes(q));
  
  if ($("totalFornos")) $("totalFornos").textContent = state.ovens.length;
  let activeCount = 0;
  state.ovens.forEach(o => { if (online(state.readings.get(Number(o.numero)))) activeCount++ });
  if ($("activeFornos")) $("activeFornos").textContent = activeCount;
  if ($("offlineFornos")) $("offlineFornos").textContent = Math.max(0, state.ovens.length - activeCount);
  
  renderGrid();
  renderTable();
  renderSelect();
  
  const newest = [...state.readings.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if ($("lastUpdate")) $("lastUpdate").textContent = newest ? `Atualizado ${time(newest.created_at)}` : "Aguardando dados...";
}

function renderGrid() {
  const g = $("ovenGrid");
  if (!g) return;
  if (!state.filtered.length) {
    g.innerHTML = '<div class="loading-card"><p>Nenhum forno encontrado.</p></div>';
    return;
  }
  g.innerHTML = state.filtered.map(o => {
    const mod = Number(o.numero), r = state.readings.get(mod), ok = online(r);
    return `<article class="oven-card" data-module="${mod}"><div class="oven-head"><div class="oven-name">${escapeHtml(o.nome || ovenName(mod))}</div><span class="status ${ok ? "online" : "offline"}">${ok ? "● Online" : "● Offline"}</span></div><div class="oven-main"><div><div class="temperature">${temp(r?.canal_1)}</div><div class="temp-caption">Canal 1 • Módulo ${mod}</div></div><div class="mini-chart"><canvas id="mini-${mod}"></canvas></div></div><div class="oven-footer"><div class="mini-metric"><span>Canal 2</span><strong>${r?.canal_2 !== undefined && r?.canal_2 !== null ? r.canal_2 + " °C" : "--"}</strong></div><div class="mini-metric" style="text-align:right"><span>Última leitura</span><strong>${time(r?.created_at)}</strong></div></div></article>`
  }).join("");
  
  g.querySelectorAll(".oven-card").forEach(c => c.onclick = () => openOven(Number(c.dataset.module)));
  state.filtered.forEach(o => drawMini(Number(o.numero)));
}

async function drawMini(modulo) {
  const canvas = $(`mini-${modulo}`);
  if (!canvas) return;
  const rows = await getHistory(modulo, 35);
  const vals = rows.map(r => num(r.canal_1)).filter(v => v !== null);
  if (!vals.length) return;
  
  new Chart(canvas, {
    type: "line",
    data: { labels: vals.map(() => ""), datasets: [{ data: vals, borderColor: "#f97316", borderWidth: 2, tension: .35, pointRadius: 0, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
  });
}

function renderTable() {
  const wrap = $("ovensTableWrap");
  if (!wrap) return;
  wrap.innerHTML = `<table><thead><tr><th>Forno</th><th>Módulo</th><th>Canal 1</th><th>Canal 2</th><th>Status</th><th>Última leitura</th></tr></thead><tbody>${state.ovens.map(o => {
    const r = state.readings.get(Number(o.numero)), ok = online(r);
    return `<tr><td><b>${escapeHtml(o.nome || ovenName(o.numero))}</b></td><td>${o.numero}</td><td>${temp(r?.canal_1)}</td><td>${r?.canal_2 ?? "--"}</td><td><span class="status ${ok ? "online" : "offline"}">${ok ? "● Online" : "● Offline"}</span></td><td>${time(r?.created_at)}</td></tr>`
  }).join("")}</tbody></table>`;
}

function renderSelect() {
  const s = $("historySelect");
  if (!s) return;
  const old = s.value;
  s.innerHTML = state.ovens.map(o => `<option value="${o.numero}">${escapeHtml(o.nome || ovenName(o.numero))}</option>`).join("");
  if (old) s.value = old;
}

async function getHistory(modulo, limit = 120) {
  try {
    const { data, error } = await sb.from("leituras").select("canal_1,canal_2,modulo_alutal,created_at").eq("modulo_alutal", modulo).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []).reverse();
  } catch (err) {
    console.error(`[Erro getHistory Módulo ${modulo}]:`, err.message || err);
    return [];
  }
}

function chartOptions() {
  return { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 7, font: { size: 9 } } }, y: { grid: { color: "#edf0f4" }, ticks: { font: { size: 9 } } } } };
}

async function drawHistory(modulo) {
  const rows = await getHistory(modulo);
  if ($("historyCurrent")) $("historyCurrent").textContent = temp(rows.at(-1)?.canal_1);
  if ($("historyRange")) $("historyRange").textContent = rows.length ? `${time(rows[0].created_at)} → ${time(rows.at(-1).created_at)}` : "Sem dados";
  
  if (state.charts.history) state.charts.history.destroy();
  state.charts.history = new Chart($("historyChart"), {
    type: "line",
    data: { labels: rows.map(r => new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })), datasets: [{ data: rows.map(r => num(r.canal_1)), borderColor: "#f97316", backgroundColor: "rgba(249,115,22,.08)", borderWidth: 2, tension: .3, pointRadius: 0, fill: true }] },
    options: chartOptions()
  });
}

async function openOven(modulo) {
  state.selectedModule = modulo;
  const r = state.readings.get(modulo), ok = online(r);
  
  if ($("modalOvenName")) $("modalOvenName").textContent = ovenName(modulo);
  if ($("modalTemperature")) $("modalTemperature").textContent = temp(r?.canal_1);
  if ($("liveTemp")) $("liveTemp").textContent = temp(r?.canal_1);
  if ($("modalCanal1")) $("modalCanal1").textContent = r?.canal_1 ?? "--";
  if ($("modalCanal2")) $("modalCanal2").textContent = r?.canal_2 ?? "--";
  if ($("modalModule")) $("modalModule").textContent = modulo;
  if ($("modalTime")) $("modalTime").textContent = time(r?.created_at);
  if ($("modalStatus")) {
    $("modalStatus").className = `status ${ok ? "online" : "offline"}`;
    $("modalStatus").textContent = ok ? "● Online" : "● Offline";
  }
  if ($("modalStatusText")) $("modalStatusText").textContent = ok ? "Online" : "Offline";
  if ($("ovenModal")) $("ovenModal").classList.remove("hidden");
  
  activateTab("tempo");
  const rows = await getHistory(modulo);
  
  if (state.charts.modal) state.charts.modal.destroy();


  // Criação do gráfico principal do Modal
  state.charts.modal = new Chart($("modalChart"), {
    type: "line",
    data: { 
      labels: rows.map(r => new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })), 
      datasets: [{ 
        data: rows.map(r => num(r.canal_1)), 
        borderColor: "#f97316", 
        borderWidth: 2, 
        tension: .3, 
        pointRadius: 0, 
        fill: true, 
        backgroundColor: "rgba(249,115,22,.08)" 
      }] 
    },
    options: chartOptions()
  });

  // CORREÇÃO: Adicionadas as crases corretas na estrutura do HTML do histórico
  if ($("detailHistoryList")) {
    $("detailHistoryList").innerHTML = rows.slice(-12).reverse().map(r => `
      <div class="history-row">
        <span>${time(r.created_at)}</span>
        <strong>${temp(r.canal_1)}</strong>
      </div>
    `).join("");
  }
} // Fechamento correto da função openOven

function closeModal() {
  if ($("ovenModal")) $("ovenModal").classList.add("hidden");
  if (state.charts.modal) { 
    state.charts.modal.destroy(); 
    state.charts.modal = null; 
  }
}

function activateTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".detail-panel").forEach(p => p.classList.remove("active"));
  
  // CORREÇÃO: Adicionadas crases para a interpolação do ID do painel funcionar
  const panel = $(`panel${name.toUpperCase() + name.slice(1)}`);
  if (panel) panel.classList.add("active");
}

document.addEventListener("DOMContentLoaded", async () => {
  setConnection(null, "Conectando ao ThermoLink...");
  await loadCompany();
  await loadOvens();
  await loadLatest();
  
  // Executa a atualização de dados a cada 12 segundos
  setInterval(loadLatest, 12000);
});



