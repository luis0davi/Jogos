// ======================================================
// THERMOLINK - REVISADO E MODERNIZADO
// Interface Industrial Avançada para Monitoramento de Fornos
// ======================================================

const SUPABASE_URL = "https://zawnluboujbovpgrgdcx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======================================================
// ESTADO DO APP
// ======================================================
const state = {
    ovens: [],
    readings: new Map(),
    selectedModule: null,
    chart: null,
    miniCharts: []
};

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================
const $ = id => document.getElementById(id);

function numberValue(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
}

function temperature(value) {
    const number = numberValue(value);
    if (number === null) return "-- °C";
    return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C`;
}

function time(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function isOnline(reading) {
    if (!reading || !reading.created_at) return false;
    const date = new Date(reading.created_at);
    if (Number.isNaN(date.getTime())) return false;
    const difference = Date.now() - date.getTime();
    return difference <= 3 * 60 * 1000; // 3 minutos online
}

function ovenName(module) {
    const oven = state.ovens.find(item => Number(item.numero) === Number(module));
    if (oven && oven.nome) return oven.nome;
    return `Forno ${String(module).padStart(2, "0")}`;
}

// ======================================================
// CARREGAR FORNOS DO BANCO
// ======================================================
async function loadOvens() {
    const { data, error } = await sb
        .from("fornos")
        .select(`id, dispositivo_id, numero, nome, ativo`)
        .eq("ativo", true)
        .order("numero", { ascending: true });

    if (error || !data || !data.length) {
        console.warn("[ThermoLink] Fallback ativo: Gerando módulos padrão (1 a 31).");
        state.ovens = Array.from({ length: 31 }, (_, index) => ({
            id: index + 1,
            numero: index + 1,
            nome: `Forno ${String(index + 1).padStart(2, "0")}`,
            ativo: true
        }));
        return;
    }
    state.ovens = data;
}

// ======================================================
// CAPTURAR ÚLTIMAS LEITURAS (MÚLTIPLOS CANAIS)
// ======================================================
async function loadLatest() {
    const { data, error } = await sb
        .from("leituras")
        .select(`id, dispositivo_id, forno_id, modulo_alutal, canal_1, canal_2, created_at`)
        .order("created_at", { ascending: false })
        .limit(1000);

    if (error) {
        console.error("[ThermoLink] Erro ao carregar leituras:", error);
        return;
    }

    const latest = new Map();
    for (const reading of data || []) {
        const module = Number(reading.modulo_alutal);
        if (Number.isFinite(module) && !latest.has(module)) {
            latest.set(module, reading);
        }
    }

    state.readings = latest;
    renderHome();

    if (state.selectedModule !== null) {
        updateDetail(state.selectedModule);
    }
}

// ======================================================
// HISTÓRICO TÉRMICO DO FORNO
// ======================================================
async function getHistory(module, limit = 120) {
    const { data, error } = await sb
        .from("leituras")
        .select(`canal_1, canal_2, modulo_alutal, created_at`)
        .eq("modulo_alutal", module)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("[ThermoLink] Erro no histórico:", error);
        return [];
    }
    return (data || []).reverse();
}

// ======================================================
// RENDERIZAR TELA INICIAL (MÓDULOS ONLINE)
// ======================================================
function renderHome() {
    state.miniCharts.forEach(chart => chart.destroy());
    state.miniCharts = [];

    const onlineOvens = state.ovens.filter(oven => 
        isOnline(state.readings.get(Number(oven.numero)))
    );

    $("onlineCount").textContent = `${onlineOvens.length} online`;
    const grid = $("ovenGrid");

    if (!onlineOvens.length) {
        grid.innerHTML = `<div class="empty">Nenhum módulo de forno online no momento.</div>`;
        return;
    }

    grid.innerHTML = onlineOvens.map(oven => {
        const module = Number(oven.numero);
        const reading = state.readings.get(module);
        const temp1 = numberValue(reading?.canal_1);
        const temp1Text = temp1 === null ? "--" : temp1.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

        return `
            <article class="oven-card" data-module="${module}">
                <div class="oven-top">
                    <div class="oven-name">${oven.nome || ovenName(module)}</div>
                    <span class="status">● Online</span>
                </div>
                <div class="temp-row">
                    <div class="temp">
                        ${temp1Text}<small>°C</small>
                        <span class="channel-lbl">Canal 01 (Teto)</span>
                    </div>
                    <div class="trend">
                        <canvas id="mini-${module}"></canvas>
                    </div>
                </div>
                <div class="oven-bottom">
                    <div class="mini">
                        <span>Canal 02 (Base)</span>
                        <strong>${temperature(reading?.canal_2)}</strong>
                    </div>
                    <div class="mini" style="text-align:right">
                        <span>Sincronismo</span>
                        <strong>${time(reading?.created_at)}</strong>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    grid.querySelectorAll(".oven-card").forEach(card => {
        card.addEventListener("click", () => {
            openDetail(Number(card.dataset.module));
        });
    });

    onlineOvens.forEach(oven => {
        drawMiniChart(Number(oven.numero));
    });
}

// ======================================================
// DESENHAR GRAFICOS MINIATURA (NOS CARDS)
// ======================================================
async function drawMiniChart(module) {
    const canvas = $(`mini-${module}`);
    if (!canvas) return;

    const rows = await getHistory(module, 20);
    const v1 = rows.map(r => numberValue(r.canal_1)).filter(v => v !== null);

    if (!v1.length) return;

    const chart = new Chart(canvas, {
        type: "line",
        data: {
            labels: v1.map(() => ""),
            datasets: [{
                data: v1,
                borderColor: "#ff641f",
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });

    state.miniCharts.push(chart);
}

// ======================================================
// ENTRAR NA TELA DE DETALHES DE UM FORNO
// ======================================================
async function openDetail(module) {
    state.selectedModule = module;

    $("homeView").classList.add("hidden");
    $("detailView").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

    $("detailName").textContent = ovenName(module);

    const reading = state.readings.get(module);
    $("detailTemp").innerHTML = `${numberValue(reading?.canal_1)?.toLocaleString("pt-BR") || '--'}<span class="unit-detail">°C</span>`;
    $("pCanal1").textContent = temperature(reading?.canal_1);
    $("pCanal2").textContent = temperature(reading?.canal_2);
    $("pModulo").textContent = String(module).padStart(2, "0");
    $("pHora").textContent = time(reading?.created_at);

    const rows = await getHistory(module, 60);
    $("readingCount").textContent = `${rows.length} registros`;

    // Processamento de métricas analíticas (Mínima, Média e Máxima)
    const validC1 = rows.map(r => numberValue(r.canal_1)).filter(v => v !== null);
    if (validC1.length > 0) {
        const minVal = Math.min(...validC1);
        const maxVal = Math.max(...validC1);
        const avgVal = validC1.reduce((a, b) => a + b, 0) / validC1.length;

        $("calcMin").textContent = `${minVal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C`;
        $("calcMax").textContent = `${maxVal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C`;
        $("calcMed").textContent = `${avgVal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C`;
    } else {
        $("calcMin").textContent = "--";
        $("calcMax").textContent = "--";
        $("calcMed").textContent = "--";
    }

    if (!rows.length) {
        $("historyList").innerHTML = `<div class="empty">Nenhum dado para este período.</div>`;
    } else {
        $("historyList").innerHTML = rows.slice(-10).reverse().map(row => `
            <div class="history-row">
                <span class="time-stamp">${time(row.created_at)}</span>
                <strong class="c1-txt">${temperature(row.canal_1)}</strong>
                <span class="c2-txt">${temperature(row.canal_2)}</span>
            </div>
        `).join("");
    }

    if (state.chart) {
        state.chart.destroy();
        state.chart = null;
    }

    if (!rows.length) return;

    // Inicialização do Gráfico Principal Multifunção (Canais 1 e 2 simultâneos)
    state.chart = new Chart($("detailChart"), {
        type: "line",
        data: {
            labels: rows.map(r => new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })),
            datasets: [
                {
                    label: "Canal 1 (Teto)",
                    data: rows.map(r => numberValue(r.canal_1)),
                    borderColor: "#ff641f",
                    backgroundColor: "rgba(255, 100, 31, 0.05)",
                    borderWidth: 2.5,
                    tension: 0.35,
                    pointRadius: 0,
                    fill: true
                },
                {
                    label: "Canal 2 (Base)",
                    data: rows.map(r => numberValue(r.canal_2)),
                    borderColor: "#00b4d8",
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.35,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: "#64748b", font: { size: 9 } } },
                y: { grid: { color: "rgba(51, 65, 85, 0.2)" }, ticks: { color: "#64748b", font: { size: 9 } } }
            }
        }
    });

    $("burnTime").textContent = "--";
}

function updateDetail(module) {
    const reading = state.readings.get(module);
    if (!isOnline(reading)) {
        closeDetail();
        return;
    }

    $("detailTemp").innerHTML = `${numberValue(reading.canal_1)?.toLocaleString("pt-BR") || '--'}<span class="unit-detail">°C</span>`;
    $("pCanal1").textContent = temperature(reading.canal_1);
    $("pCanal2").textContent = temperature(reading.canal_2);
    $("pHora").textContent = time(reading.created_at);
}

function closeDetail() {
    state.selectedModule = null;
    if (state.chart) {
        state.chart.destroy();
        state.chart = null;
    }
    $("detailView").classList.add("hidden");
    $("homeView").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderHome();
}

$("backBtn").onclick = closeDetail;
$("homeNav").onclick = closeDetail;

// Rotina cíclica de leitura do banco de dados (a cada 12 segundos)
setInterval(loadLatest, 12000);

async function init() {
    try {
        await loadOvens();
        await loadLatest();
        console.log("[ThermoLink] Engine de telemetria inicializada com sucesso.");
    } catch (error) {
        console.error("[ThermoLink] Falha catastrófica de carregamento:", error);
        $("ovenGrid").innerHTML = `<div class="empty">Falha na conexão com o servidor de banco de dados.</div>`;
    }
}

init();