// ==============================
// THERMOLINK - CONFIGURAÇÃO
// ==============================
// O URL do seu projeto foi identificado pelo endereço do Supabase.
// COLE ABAIXO A SUA CHAVE ANON/PUBLISHABLE.
// Nunca coloque a service_role key em um site público.
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
  // 3 minutos. Ajuste aqui se seu ThermoLink envia em outro intervalo.
  return reading && ageMs(reading.data_hora) <= 3 * 60 * 1000;
}

function ovenName(module) {
  const oven = state.ovens.find(o => Number(o.numero) === Number(module));
  return oven?.nome || `Forno ${String(module).padStart(2, "0")}`;
}

function setConnection(ok, text) {
  $("connectionText").textContent = text;
  const dot = document.querySelector(".connection .dot");
  dot.classList.remove("ok", "bad");
  if (ok === true) dot.classList.add("ok");
  if (ok === false) dot.classList.add("bad");
}

async function loadCompany() {
  const { data, error } = await sb.from("empresas").select("id,nome,ativo").eq("ativo", true).order("id").limit(1);
  if (!error && data?.length) $("companyName").textContent = data[0].nome;
}

async function loadOvens() {
  const { data, error } = await sb
    .from("fornos")
    .select("id,dispositivo_id,numero,nome,módulo_atual,ativo")
    .eq("ativo", true)
    .order("numero", { ascending: true });

  if (error) {
    console.error("Erro ao carregar fornos:", error);
    throw error;
  }
  state.ovens = data || [];
}

async function loadLatestReadings() {
  // Busca uma janela recente. Depois agrupamos pelo módulo_atual e
  // conservamos somente a leitura mais nova de cada módulo.
  const { data, error } = await sb
    .from("leituras")
    .select("id,dispositivo_id,forno_id,módulo_atual,canal_1,canal_2,data_hora")
    .order("data_hora", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Erro ao carregar leituras:", error);
    throw error;
  }

  const map = new Map();
  for (const row of (data || [])) {
    const module = Number(row.módulo_atual);
    if (!Number.isFinite(module)) continue;
    if (!map.has(module)) map.set(module, row);
  }
  state.readings = map;
  renderAll();
}

function renderAll() {
  const query = $("searchInput").value.trim().toLowerCase();
  state.filtered = state.ovens.filter(o => {
    const name = (o.nome || "").toLowerCase();
    const num = String(o.numero || "");
    return !query || name.includes(query) || num.includes(query);
  });

  $("totalFornos").textContent = state.ovens.length;

  let online = 0;
  for (const oven of state.ovens) {
    const r = state.readings.get(Number(oven.numero));
    if (isOnline(r)) online++;
  }
  $("activeFornos").textContent = online;
  $("offlineFornos").textContent = Math.max(0, state.ovens.length - online);

  renderOvenGrid();
  renderOvensTable();
  renderHistorySelect();

  const newest = [...state.readings.values()]
    .sort((a,b) => new Date(b.data_hora) - new Date(a.data_hora))[0];
  $("lastUpdate").textContent = newest ? `Última telemetria: ${formatTime(newest.data_hora)}` : "Aguardando dados...";
}

function renderOvenGrid() {
  const grid = $("ovenGrid");
  if (!state.filtered.length) {
    grid.innerHTML = `<div class="loading-card"><p>Nenhum forno encontrado.</p></div>`;
    return;
  }

  grid.innerHTML = state.filtered.map(oven => {
    const module = Number(oven.numero);
    const r = state.readings.get(module);
    const online = isOnline(r);
    const temp = number(r?.canal_1);
    const ch2 = number(r?.canal_2);

    return `
      <article class="oven-card" data-module="${module}">
        <div class="oven-head">
          <div class="oven-name">${escapeHtml(oven.nome || ovenName(module))}</div>
          <span class="status ${online ? "online" : "offline"}">${online ? "● Online" : "● Offline"}</span>
        </div>
        <div class="temperature">${formatTemp(temp)}</div>
        <div class="temp-caption">Canal 1 • Módulo ${module}</div>
        <div class="oven-footer">
          <div class="mini-metric">
            <span>Canal 2</span>
            <strong>${ch2 === null ? "--" : ch2}</strong>
          </div>
          <div class="mini-metric" style="text-align:right">
            <span>Última leitura</span>
            <strong>${formatTime(r?.data_hora)}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll(".oven-card").forEach(card => {
    card.addEventListener("click", () => openOven(Number(card.dataset.module)));
  });
}

function renderOvensTable() {
  const rows = state.ovens.map(oven => {
    const module = Number(oven.numero);
    const r = state.readings.get(module);
    const online = isOnline(r);
    return `<tr>
      <td><strong>${escapeHtml(oven.nome || ovenName(module))}</strong></td>
      <td>${module}</td>
      <td>${formatTemp(r?.canal_1)}</td>
      <td>${r?.canal_2 ?? "--"}</td>
      <td><span class="status ${online ? "online" : "offline"}">${online ? "● Online" : "● Offline"}</span></td>
      <td>${formatTime(r?.data_hora)}</td>
    </tr>`;
  }).join("");

  $("ovensTableWrap").innerHTML = `
    <table>
      <thead><tr><th>Forno</th><th>Módulo</th><th>Canal 1</th><th>Canal 2</th><th>Status</th><th>Última leitura</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Nenhum forno cadastrado.</td></tr>'}</tbody>
    </table>`;
}

function renderHistorySelect() {
  const select = $("historySelect");
  const current = select.value;
  select.innerHTML = state.ovens.map(o =>
    `<option value="${Number(o.numero)}">${escapeHtml(o.nome || ovenName(o.numero))}</option>`
  ).join("");
  if (current && state.ovens.some(o => String(o.numero) === current)) select.value = current;
  if (!select.value && state.ovens[0]) select.value = String(state.ovens[0].numero);
}

async function getHistory(module, limit = 120) {
  // O módulo identifica o forno na telemetria, conforme sua estrutura atual.
  const { data, error } = await sb
    .from("leituras")
    .select("canal_1,canal_2,módulo_atual,data_hora")
    .eq("módulo_atual", module)
    .order("data_hora", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Erro no histórico:", error);
    return [];
  }
  return (data || []).reverse();
}

async function drawHistory(module) {
  const rows = await getHistory(module);
  const labels = rows.map(r => new Date(r.data_hora).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit", second:"2-digit"}));
  const values = rows.map(r => number(r.canal_1));

  const last = rows[rows.length - 1];
  $("historyCurrent").textContent = formatTemp(last?.canal_1);
  $("historyRange").textContent = rows.length ? `${formatTime(rows[0].data_hora)} → ${formatTime(rows[rows.length-1].data_hora)}` : "Sem dados";

  if (state.charts.history) state.charts.history.destroy();
  state.charts.history = new Chart($("historyChart"), {
    type: "line",
    data: { labels, datasets: [{
      label: "Canal 1",
      data: values,
      borderWidth: 2,
      tension: .28,
      pointRadius: 0,
      fill: true
    }]},
    options: chartOptions()
  });
}

async function openOven(module) {
  state.selectedModule = module;
  const r = state.readings.get(module);
  const online = isOnline(r);

  $("modalOvenName").textContent = ovenName(module);
  $("modalTemperature").textContent = formatTemp(r?.canal_1);
  $("modalCanal1").textContent = r?.canal_1 ?? "--";
  $("modalCanal2").textContent = r?.canal_2 ?? "--";
  $("modalModule").textContent = module;
  $("modalTime").textContent = formatTime(r?.data_hora);
  $("modalStatus").className = `status ${online ? "online" : "offline"}`;
  $("modalStatus").textContent = online ? "● Online" : "● Offline";

  $("ovenModal").classList.remove("hidden");

  const rows = await getHistory(module);
  const labels = rows.map(x => new Date(x.data_hora).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit",second:"2-digit"}));
  const values = rows.map(x => number(x.canal_1));

  if (state.charts.modal) state.charts.modal.destroy();
  state.charts.modal = new Chart($("modalChart"), {
    type: "line",
    data: { labels, datasets: [{ label:"Canal 1", data:values, borderWidth:2, tension:.28, pointRadius:0, fill:true }] },
    options: chartOptions()
  });
}

function chartOptions() {
  return {
    responsive:true,
    maintainAspectRatio:false,
    interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},tooltip:{displayColors:false}},
    scales:{
      x:{grid:{display:false},ticks:{maxTicksLimit:8,font:{size:9}}},
      y:{grid:{color:"#eef1f5"},ticks:{font:{size:9}}}
    }
  };
}

function closeModal() {
  $("ovenModal").classList.add("hidden");
  if (state.charts.modal) {
    state.charts.modal.destroy();
    state.charts.modal = null;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch]));
}

function subscribeRealtime() {
  if (state.realtime) sb.removeChannel(state.realtime);

  state.realtime = sb
    .channel("thermolink-leituras")
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"leituras" }, payload => {
      const row = payload.new;
      const module = Number(row.módulo_atual);
      if (!Number.isFinite(module)) return;

      const old = state.readings.get(module);
      if (!old || new Date(row.data_hora) >= new Date(old.data_hora)) {
        state.readings.set(module, row);
        renderAll();

        if (state.selectedModule === module && !$("ovenModal").classList.contains("hidden")) {
          openOven(module);
        }
      }
    })
    .subscribe(status => {
      console.log("Realtime:", status);
      if (status === "SUBSCRIBED") setConnection(true, "Realtime conectado");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection(false, "Realtime indisponível");
    });
}

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");

      const view = btn.dataset.view;
      $("dashboardView").classList.toggle("hidden", view !== "dashboard");
      $("ovensView").classList.toggle("hidden", view !== "fornos");
      $("historyView").classList.toggle("hidden", view !== "historico");

      $("pageTitle").textContent =
        view === "dashboard" ? "Painel de Fornos" :
        view === "fornos" ? "Fornos cadastrados" : "Histórico de telemetria";

      if (view === "historico" && $("historySelect").value) {
        await drawHistory(Number($("historySelect").value));
      }
    });
  });
}

async function init() {
  if (SUPABASE_ANON_KEY === "COLE_SUA_CHAVE_ANON_AQUI") {
    setConnection(false, "Informe a chave anon");
    $("ovenGrid").innerHTML = `
      <div class="loading-card">
        <div>
          <strong>Falta configurar a chave do Supabase.</strong>
          <p>Abra o arquivo app.js e coloque sua chave anon/publishable.</p>
        </div>
      </div>`;
    return;
  }

  try {
    await loadCompany();
    await loadOvens();
    await loadLatestReadings();
    subscribeRealtime();
    setConnection(true, "Conectado");
  } catch (err) {
    console.error(err);
    setConnection(false, "Erro de conexão");
    $("ovenGrid").innerHTML = `
      <div class="loading-card">
        <div>
          <strong>Não foi possível carregar o banco.</strong>
          <p>Confira a chave, RLS e os nomes das colunas no Supabase.</p>
        </div>
      </div>`;
  }
}

$("searchInput").addEventListener("input", renderAll);
$("refreshBtn").addEventListener("click", async () => {
  $("refreshBtn").style.transform = "rotate(360deg)";
  setTimeout(() => $("refreshBtn").style.transform = "", 300);
  try { await loadLatestReadings(); } catch (e) {}
});
$("historySelect").addEventListener("change", e => drawHistory(Number(e.target.value)));
$("modalClose").addEventListener("click", closeModal);
$("modalBackdrop").addEventListener("click", closeModal);
setupNavigation();
init();
