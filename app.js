// ==========================================================================
// THERMOLINK MOBILE - CONTROLE DE ACESSO & TELEMETRIA TÉRMICA
// ==========================================================================

const SUPABASE_URL = "https://zawnluboujbovpgrgdcx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";

// Supabase Client
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DEFAULT_USERS = [
    { username: "admin", password: "thermolink2026", name: "Administrador ThermoLink", role: "admin" },
    { username: "ceramica", password: "forno2026", name: "Cerâmica São José", role: "client" },
    { username: "demo", password: "123456", name: "Cerâmica Modelo Demo", role: "client" }
];

function getRegisteredUsers() {
    const saved = localStorage.getItem("thermolink_users");
    if (!saved) {
        localStorage.setItem("thermolink_users", JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
    }
    try {
        return JSON.parse(saved);
    } catch {
        return DEFAULT_USERS;
    }
}

// ==========================================================================
// ESTADO GLOBAL DO APLICATIVO
// ==========================================================================
const state = {
    currentUser: null,
    activeTab: "fornos",
    activeSubTab: "tempoReal",
    selectedModule: null,
    analysisModule: null,
    analysisTimeRange: "all", // 'all', 6, 24, 48, 72
    analysisSampleSize: 1000, // 100, 250, 500, 1000
    analysisTableRowLimit: 25, // 25, 50, 100, 'all'
    ovens: [],
    readings: new Map(),
    mainChart: null,
    analysisChart: null,
    miniCharts: new Map(),
    chartChannelFilter: "all",
    analysisChannelFilter: "all",
    currentDetailHistory: [],
    currentAnalysisRawHistory: [],
    currentAnalysisFilteredHistory: [],
    isPolling: false
};

const $ = (id) => document.getElementById(id);

// ==========================================================================
// 1. FLUXO DE LOGIN & SESSÃO DO CLIENTE
// ==========================================================================

function verificarSessaoSalva() {
    const session = localStorage.getItem("thermolink_active_session");
    if (session) {
        try {
            const user = JSON.parse(session);
            iniciarPainelUsuario(user);
            return true;
        } catch {
            localStorage.removeItem("thermolink_active_session");
        }
    }
    return false;
}

function irParaLogin() {
    $("splashScreen").classList.add("hidden");
    if (!verificarSessaoSalva()) {
        $("loginScreen").classList.remove("hidden");
    }
}

function preencherLogin(user, pass) {
    $("loginUser").value = user;
    $("loginPassword").value = pass;
    $("loginError").classList.add("hidden");
}

function toggleSenha(inputId) {
    const input = $(inputId);
    const icon = $("toggleIcon");
    if (input.type === "password") {
        input.type = "text";
        icon.className = "fa-regular fa-eye-slash";
    } else {
        input.type = "password";
        icon.className = "fa-regular fa-eye";
    }
}

function realizarLogin(e) {
    e.preventDefault();
    const userVal = $("loginUser").value.trim().toLowerCase();
    const passVal = $("loginPassword").value.trim();
    const remember = $("rememberMe").checked;

    const users = getRegisteredUsers();
    const found = users.find(u => u.username.toLowerCase() === userVal && u.password === passVal);

    if (found) {
        $("loginError").classList.add("hidden");
        if (remember) {
            localStorage.setItem("thermolink_active_session", JSON.stringify(found));
        }
        iniciarPainelUsuario(found);
    } else {
        $("loginError").classList.remove("hidden");
    }
}

function iniciarPainelUsuario(user) {
    state.currentUser = user;

    // Checagem se a conta foi bloqueada pelo Master Admin
    if (user.role !== "admin" && !user.isImpersonateMode) {
        const clientsAdmin = JSON.parse(localStorage.getItem("thermolink_clients_admin") || "[]");
        const clientRecord = clientsAdmin.find(c => c.username?.toLowerCase() === user.username?.toLowerCase());
        if (clientRecord && clientRecord.status === "Bloqueado") {
            $("clientBlockedOverlay").classList.remove("hidden");
            return;
        }
    }

    $("clientBlockedOverlay").classList.add("hidden");
    $("splashScreen").classList.add("hidden");
    $("loginScreen").classList.add("hidden");
    $("mainApp").classList.remove("hidden");

    // Banner de Impersonation (Modo Suporte do Administrador)
    const impBanner = $("impersonateBanner");
    if (impBanner) {
        if (user.isImpersonateMode) {
            $("impClientName").textContent = user.name || user.username;
            impBanner.classList.remove("hidden");
        } else {
            impBanner.classList.add("hidden");
        }
    }

    // Atualiza cabeçalho e perfil
    $("currentUserDisplay").textContent = user.name || user.username;
    $("profileName").textContent = user.name || user.username;
    $("profileRole").textContent = user.role === "admin" ? "Administrador Master" : "Acesso Cliente Cerâmica";

    carregarFornosELeituras();
}

function sairModoSuporte() {
    localStorage.removeItem("thermolink_active_session");
    window.location.href = "admin.html";
}

function realizarLogout() {
    localStorage.removeItem("thermolink_active_session");
    state.currentUser = null;
    $("mainApp").classList.add("hidden");
    $("clientBlockedOverlay").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
    $("loginUser").value = "";
    $("loginPassword").value = "";
}

// ==========================================================================
// 2. CONSULTAS AO BANCO SUPABASE
// ==========================================================================

async function carregarFornosELeituras() {
    if (state.isPolling) return;
    state.isPolling = true;

    try {
        // Carrega Fornos
        const { data: fornosData } = await sb
            .from("fornos")
            .select("id, dispositivo_id, numero, nome, ativo")
            .eq("ativo", true)
            .order("numero", { ascending: true });

        if (fornosData && fornosData.length) {
            state.ovens = fornosData;
        } else {
            state.ovens = Array.from({ length: 31 }, (_, i) => ({
                id: i + 1,
                numero: i + 1,
                nome: `Forno ${String(i + 1).padStart(2, "0")}`,
                ativo: true
            }));
        }

        // Carrega últimas 1000 leituras
        const { data: leiturasData, error } = await sb
            .from("leituras")
            .select("id, dispositivo_id, forno_id, modulo_alutal, canal_1, canal_2, created_at")
            .order("created_at", { ascending: false })
            .limit(1000);

        if (error) {
            console.error("[ThermoLink] Erro nas leituras:", error);
            updateLivePill(false);
            return;
        }

        updateLivePill(true);

        const latestMap = new Map();
        for (const r of leiturasData || []) {
            const mod = Number(r.modulo_alutal);
            if (Number.isFinite(mod) && !latestMap.has(mod)) {
                latestMap.set(mod, r);
            }
        }

        state.readings = latestMap;

        // Renderiza telas
        renderListaFornos();

        if (state.activeTab === "historico") {
            carregarDadosAnalise();
        }

        // Se estiver dentro de um forno, atualiza os dados em tempo real
        if (state.selectedModule !== null) {
            atualizarFornoDetalhe(state.selectedModule);
        }
    } catch (err) {
        console.error("[ThermoLink] Falha na sincronização:", err);
        updateLivePill(false);
    } finally {
        state.isPolling = false;
    }
}

async function getHistoricoModulo(modulo, limit = 1000) {
    try {
        const { data, error } = await sb
            .from("leituras")
            .select("canal_1, canal_2, modulo_alutal, created_at")
            .eq("modulo_alutal", modulo)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) return [];
        return (data || []).reverse();
    } catch {
        return [];
    }
}

// ==========================================================================
// 3. TELA INICIAL (LISTAGEM DE FORNOS)
// ==========================================================================

function isFornoOnline(reading) {
    if (!reading || !reading.created_at) return false;
    const date = new Date(reading.created_at);
    if (Number.isNaN(date.getTime())) return false;
    return (Date.now() - date.getTime()) <= 3 * 60 * 1000;
}

function getNomeForno(modulo) {
    const oven = state.ovens.find(o => Number(o.numero) === Number(modulo));
    if (oven && oven.nome) return oven.nome;
    return `Forno ${String(modulo).padStart(2, "0")}`;
}

function renderListaFornos() {
    if (state.selectedModule !== null) return;

    // Limpa sparklines anteriores
    state.miniCharts.forEach(c => c.destroy());
    state.miniCharts.clear();

    const onlineOvens = state.ovens.filter(o => isFornoOnline(state.readings.get(Number(o.numero))));

    // Atualiza contador de fornos ativos
    $("statOnlineCount").textContent = `${onlineOvens.length} ${onlineOvens.length === 1 ? 'Forno Ativo' : 'Fornos Ativos'}`;

    const container = $("listaFornos");
    if (!onlineOvens.length) {
        container.innerHTML = `
            <div class="loading-box">
                <i class="fa-solid fa-wifi-slash" style="font-size: 32px; color: var(--text-muted);"></i>
                <p><strong>Nenhum forno transmitindo no momento.</strong><br>Assim que o aparelho ThermoLink enviar dados na cerâmica, ele aparecerá aqui automaticamente.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = onlineOvens.map(o => {
        const mod = Number(o.numero);
        const r = state.readings.get(mod);
        const c1Val = numVal(r?.canal_1);
        const c2Val = numVal(r?.canal_2);
        const relTime = formatRelativo(r?.created_at);

        return `
            <article class="oven-item-card" onclick="abrirDetalheForno(${mod})">
                <div class="oven-card-head">
                    <div class="oven-card-title-group">
                        <span class="module-badge-mini">MÓDULO ${String(mod).padStart(2, "0")}</span>
                        <div class="oven-card-name">${escapeHtml(o.nome || getNomeForno(mod))}</div>
                    </div>
                    <div class="oven-card-status">
                        <span class="pulse-dot"></span>
                        ONLINE
                    </div>
                </div>

                <div class="oven-card-main-grid">
                    <div class="oven-card-temp-box">
                        <span class="temp-c1-tag">Canal 1 (Superior)</span>
                        <div class="temp-c1-big">
                            ${c1Val !== null ? Math.round(c1Val) : "--"}<span class="unit">°C</span>
                        </div>
                    </div>
                    <div class="sparkline-container">
                        <canvas id="miniSpark-${mod}"></canvas>
                    </div>
                </div>

                <div class="oven-card-foot">
                    <span>Canal 2 (Inferior): <b class="foot-c2-val">${c2Val !== null ? Math.round(c2Val) + " °C" : "--"}</b></span>
                    <span class="foot-time-val"><i class="fa-regular fa-clock"></i> ${relTime}</span>
                </div>
            </article>
        `;
    }).join("");

    // Desenha sparklines
    onlineOvens.forEach(o => {
        desenharMiniSparkline(Number(o.numero));
    });
}

async function desenharMiniSparkline(modulo) {
    const canvas = $(`miniSpark-${modulo}`);
    if (!canvas) return;

    const rows = await getHistoricoModulo(modulo, 20);
    const vals = rows.map(r => numVal(r.canal_1)).filter(v => v !== null);
    if (!vals.length) return;

    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 50);
    grad.addColorStop(0, "rgba(244, 123, 32, 0.35)");
    grad.addColorStop(1, "rgba(244, 123, 32, 0.0)");

    const chart = new Chart(canvas, {
        type: "line",
        data: {
            labels: vals.map(() => ""),
            datasets: [{
                data: vals,
                borderColor: "#f47b20",
                borderWidth: 2,
                tension: 0.35,
                pointRadius: 0,
                fill: true,
                backgroundColor: grad
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });

    state.miniCharts.set(modulo, chart);
}

// ==========================================================================
// 4. TELA DE DETALHE DO FORNO (FORNO 3D & SUB-ABAS)
// ==========================================================================

async function abrirDetalheForno(modulo) {
    state.selectedModule = modulo;

    $("headerTitle").textContent = getNomeForno(modulo);
    $("headerBackBtn").classList.remove("hidden");

    $("screenFornos").classList.add("hidden");
    $("screenHistorico").classList.add("hidden");
    $("screenConfig").classList.add("hidden");
    $("screenFornoDetalhe").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

    $("gaugeModuleTag").textContent = `MÓDULO ${String(modulo).padStart(2, "0")}`;

    await atualizarFornoDetalhe(modulo);
}

function voltarListaFornos() {
    state.selectedModule = null;

    if (state.mainChart) {
        state.mainChart.destroy();
        state.mainChart = null;
    }

    $("headerTitle").textContent = "ThermoLink";
    $("headerBackBtn").classList.add("hidden");

    $("screenFornoDetalhe").classList.add("hidden");
    navegarAba(state.activeTab || "fornos");
    renderListaFornos();
}

async function atualizarFornoDetalhe(modulo) {
    const reading = state.readings.get(modulo);
    const c1 = numVal(reading?.canal_1);
    const c2 = numVal(reading?.canal_2);

    // Mostrador no Forno 3D
    $("gaugeMainTemp").textContent = c1 !== null ? `${Math.round(c1)} °C` : "-- °C";
    $("gaugeC2Sub").textContent = c2 !== null ? `${Math.round(c2)} °C` : "-- °C";
    $("gaugeLastTime").textContent = formatHora(reading?.created_at);

    if (c1 !== null && c2 !== null) {
        const delta = Math.abs(c1 - c2);
        $("gaugeDeltaT").textContent = `${Math.round(delta)} °C`;
    } else {
        $("gaugeDeltaT").textContent = "-- °C";
    }

    // Cards de Sensores
    $("cardValC1").textContent = c1 !== null ? `${Math.round(c1)} °C` : "-- °C";
    $("cardValC2").textContent = c2 !== null ? `${Math.round(c2)} °C` : "-- °C";

    // Histórico detalhado
    const rows = await getHistoricoModulo(modulo, 60);
    state.currentDetailHistory = rows;

    atualizarEstatisticasQueima(rows);
    renderTabelaLeituras(rows);
    renderGraficoPrincipal(rows);
}

function trocarSubAba(subAba) {
    state.activeSubTab = subAba;

    const botoes = document.querySelectorAll(".sub-tab-btn");
    botoes.forEach(b => b.classList.remove("active"));

    $("subAbaTempoReal").classList.add("hidden");
    $("subAbaGrafico").classList.add("hidden");
    $("subAbaLeituras").classList.add("hidden");

    if (subAba === "tempoReal") {
        botoes[0].classList.add("active");
        $("subAbaTempoReal").classList.remove("hidden");
    } else if (subAba === "grafico") {
        botoes[1].classList.add("active");
        $("subAbaGrafico").classList.remove("hidden");
        if (state.currentDetailHistory.length) {
            renderGraficoPrincipal(state.currentDetailHistory);
        }
    } else if (subAba === "leituras") {
        botoes[2].classList.add("active");
        $("subAbaLeituras").classList.remove("hidden");
    }
}

function atualizarEstatisticasQueima(rows) {
    if (!rows.length) return;

    const c1Vals = rows.map(r => numVal(r.canal_1)).filter(v => v !== null);
    const c2Vals = rows.map(r => numVal(r.canal_2)).filter(v => v !== null);

    if (c1Vals.length) {
        const max1 = Math.max(...c1Vals);
        const min1 = Math.min(...c1Vals);
        const avg1 = c1Vals.reduce((a, b) => a + b, 0) / c1Vals.length;

        $("subStatC1Max").textContent = `${Math.round(max1)}°C`;
        $("subStatC1Min").textContent = `${Math.round(min1)}°C`;
        $("quadMax").textContent = `${Math.round(max1)} °C`;
        $("quadMin").textContent = `${Math.round(min1)} °C`;
        $("quadAvg").textContent = `${Math.round(avg1)} °C`;
    }

    if (c2Vals.length) {
        $("subStatC2Max").textContent = `${Math.round(Math.max(...c2Vals))}°C`;
        $("subStatC2Min").textContent = `${Math.round(Math.min(...c2Vals))}°C`;
    }

    $("quadCount").textContent = `${rows.length} leituras`;
    $("chartPointCount").textContent = `${rows.length} pontos no gráfico`;
}

function renderTabelaLeituras(rows) {
    const tbody = $("detailTableBody");
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty-msg">Nenhuma leitura encontrada.</td></tr>`;
        return;
    }

    const ultimos = [...rows].reverse().slice(0, 25);
    tbody.innerHTML = ultimos.map(r => {
        const c1 = numVal(r.canal_1);
        const c2 = numVal(r.canal_2);
        const delta = (c1 !== null && c2 !== null) ? `${Math.round(Math.abs(c1 - c2))} °C` : "--";

        return `
            <tr>
                <td><b>${formatHora(r.created_at)}</b></td>
                <td class="text-orange"><b>${c1 !== null ? Math.round(c1) + " °C" : "--"}</b></td>
                <td class="text-blue"><b>${c2 !== null ? Math.round(c2) + " °C" : "--"}</b></td>
                <td>${delta}</td>
            </tr>
        `;
    }).join("");
}

function filtrarCanaisGrafico(canal) {
    state.chartChannelFilter = canal;
    const btns = document.querySelectorAll("#chartChannelFilter .pill-btn");
    btns.forEach(b => b.classList.remove("active"));
    event.target.classList.add("active");

    if (state.currentDetailHistory.length) {
        renderGraficoPrincipal(state.currentDetailHistory);
    }
}

function renderGraficoPrincipal(rows) {
    const canvas = $("detailChartCanvas");
    if (!canvas || !rows.length) return;

    if (state.mainChart) {
        state.mainChart.destroy();
        state.mainChart = null;
    }

    const labels = rows.map(r => {
        const d = new Date(r.created_at);
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    });

    const c1Data = rows.map(r => numVal(r.canal_1));
    const c2Data = rows.map(r => numVal(r.canal_2));

    const ctx = canvas.getContext("2d");

    const gradC1 = ctx.createLinearGradient(0, 0, 0, 250);
    gradC1.addColorStop(0, "rgba(244, 123, 32, 0.35)");
    gradC1.addColorStop(1, "rgba(244, 123, 32, 0.0)");

    const gradC2 = ctx.createLinearGradient(0, 0, 0, 250);
    gradC2.addColorStop(0, "rgba(59, 130, 182, 0.25)");
    gradC2.addColorStop(1, "rgba(59, 130, 182, 0.0)");

    const datasets = [];

    if (state.chartChannelFilter === "all" || state.chartChannelFilter === "c1") {
        datasets.push({
            label: "Canal 1 (Superior)",
            data: c1Data,
            borderColor: "#f47b20",
            backgroundColor: gradC1,
            borderWidth: 2.5,
            pointRadius: 1,
            pointHoverRadius: 4,
            tension: 0.35,
            fill: true
        });
    }

    if (state.chartChannelFilter === "all" || state.chartChannelFilter === "c2") {
        datasets.push({
            label: "Canal 2 (Inferior)",
            data: c2Data,
            borderColor: "#5ba6d5",
            backgroundColor: gradC2,
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 4,
            tension: 0.35,
            fill: true
        });
    }

    state.mainChart = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(7, 27, 43, 0.95)",
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + " °C" : "--"}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: "#71899a", maxTicksLimit: 6, font: { size: 10 } },
                    grid: { color: "rgba(255, 255, 255, 0.04)" }
                },
                y: {
                    ticks: { color: "#71899a", font: { size: 10 }, callback: (v) => `${v}°` },
                    grid: { color: "rgba(255, 255, 255, 0.05)" }
                }
            }
        }
    });
}

// ==========================================================================
// 5. ABA DE ANÁLISE DETALHADA (COM FILTROS DE TEMPO, AMOSTRAGEM E TABELA)
// ==========================================================================

async function carregarDadosAnalise() {
    const select = $("analysisKilnSelect");
    if (!select) return;

    const onlineOvens = state.ovens.filter(o => isFornoOnline(state.readings.get(Number(o.numero))));

    if (!onlineOvens.length) {
        select.innerHTML = `<option value="">Nenhum forno online</option>`;
        limparEstatisticasAnalise();
        return;
    }

    // Se o forno atualmente selecionado na análise não estiver online, pega o primeiro online
    if (!state.analysisModule || !onlineOvens.some(o => Number(o.numero) === Number(state.analysisModule))) {
        state.analysisModule = Number(onlineOvens[0].numero);
    }

    // Popula o select com todos os fornos
    select.innerHTML = onlineOvens.map(o => {
        const mod = Number(o.numero);
        return `<option value="${mod}" ${mod === state.analysisModule ? "selected" : ""}>${escapeHtml(o.nome || getNomeForno(mod))} (Módulo ${String(mod).padStart(2, "0")})</option>`;
    }).join("");

    // Carrega a quantidade de amostras selecionada (até 1000)
    const rows = await getHistoricoModulo(state.analysisModule, state.analysisSampleSize);
    state.currentAnalysisRawHistory = rows;

    aplicarFiltrosEAtualizarAnalise();
}

function trocarFornoAnalise(modulo) {
    if (!modulo) return;
    state.analysisModule = Number(modulo);
    carregarDadosAnalise();
}

// FILTRO DE PERÍODO / TEMPO (HORAS)
function filtrarTempoAnalise(horas, btn) {
    state.analysisTimeRange = horas;
    document.querySelectorAll("#anTimeFilter .pill-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    aplicarFiltrosEAtualizarAnalise();
}

// FILTRO DE TAMANHO DA AMOSTRAGEM (NÚMERO DE LEITURAS)
function filtrarAmostragemAnalise(quantidade, btn) {
    state.analysisSampleSize = Number(quantidade);
    document.querySelectorAll("#anSampleFilter .pill-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    carregarDadosAnalise();
}

// FILTRO DE CANAIS (AMBOS, C1, C2)
function filtrarCanaisAnalise(canal) {
    state.analysisChannelFilter = canal;
    const btns = document.querySelectorAll("#anChannelFilter .pill-btn");
    btns.forEach(b => b.classList.remove("active"));
    event.target.classList.add("active");

    if (state.currentAnalysisFilteredHistory.length) {
        renderGraficoAnalise(state.currentAnalysisFilteredHistory);
    }
}

// FILTRO DE QUANTIDADE DE LINHAS NA TABELA
function trocarLimiteTabela(limite) {
    state.analysisTableRowLimit = limite === "all" ? "all" : Number(limite);
    renderTabelaAnalise(state.currentAnalysisFilteredHistory);
}

function aplicarFiltrosEAtualizarAnalise() {
    let rows = [...state.currentAnalysisRawHistory];

    // Aplica filtro de tempo em horas
    if (state.analysisTimeRange !== "all") {
        const threshold = Date.now() - (Number(state.analysisTimeRange) * 60 * 60 * 1000);
        rows = rows.filter(r => {
            const time = new Date(r.created_at).getTime();
            return time >= threshold;
        });
    }

    state.currentAnalysisFilteredHistory = rows;
    atualizarPainelAnalise(rows);
}

function limparEstatisticasAnalise() {
    $("anStatMax").textContent = "-- °C";
    $("anStatMin").textContent = "-- °C";
    $("anStatAvg").textContent = "-- °C";
    $("anStatCount").textContent = "0 leituras";
    $("anTableBody").innerHTML = `<tr><td colspan="4" class="table-empty-msg">Nenhum dado disponível.</td></tr>`;
    if (state.analysisChart) {
        state.analysisChart.destroy();
        state.analysisChart = null;
    }
}

function atualizarPainelAnalise(rows) {
    if (!rows.length) {
        limparEstatisticasAnalise();
        return;
    }

    const c1Vals = rows.map(r => numVal(r.canal_1)).filter(v => v !== null);

    if (c1Vals.length) {
        const max = Math.max(...c1Vals);
        const min = Math.min(...c1Vals);
        const avg = c1Vals.reduce((a, b) => a + b, 0) / c1Vals.length;

        $("anStatMax").textContent = `${Math.round(max)} °C`;
        $("anStatMin").textContent = `${Math.round(min)} °C`;
        $("anStatAvg").textContent = `${Math.round(avg)} °C`;
        $("anStatCount").textContent = `${rows.length} leituras`;
        $("anChartSub").textContent = `Curva detalhada de ${rows.length} leituras`;
    }

    renderTabelaAnalise(rows);
    renderGraficoAnalise(rows);
}

function renderTabelaAnalise(rows) {
    const tbody = $("anTableBody");
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty-msg">Nenhum dado no período filtrado.</td></tr>`;
        return;
    }

    // Calcula pico máximo e mínimo do canal 1 (temperatura principal)
    const c1Vals = rows.map(r => numVal(r.canal_1)).filter(v => v !== null);
    const globalMax = c1Vals.length ? Math.max(...c1Vals) : null;
    const globalMin = c1Vals.length ? Math.min(...c1Vals) : null;

    // Índices das primeiras ocorrências de máx e mín
    const idxMax = globalMax !== null ? rows.findIndex(r => numVal(r.canal_1) === globalMax) : -1;
    const idxMin = globalMin !== null ? rows.findIndex(r => numVal(r.canal_1) === globalMin) : -1;

    let exibicao = [...rows].reverse();
    const totalRows = rows.length;

    // Converte índices do array original (não invertido) para o invertido
    const idxMaxInv = idxMax !== -1 ? totalRows - 1 - idxMax : -1;
    const idxMinInv = idxMin !== -1 ? totalRows - 1 - idxMin : -1;

    if (state.analysisTableRowLimit !== "all") {
        exibicao = exibicao.slice(0, state.analysisTableRowLimit);
    }

    tbody.innerHTML = exibicao.map((r, i) => {
        const c1 = numVal(r.canal_1);
        const c2 = numVal(r.canal_2);
        const delta = (c1 !== null && c2 !== null) ? `${Math.round(Math.abs(c1 - c2))} °C` : "--";

        const isMax = (i === idxMaxInv);
        const isMin = (i === idxMinInv);

        const rowClass = isMax ? "row-peak-max" : (isMin ? "row-peak-min" : "");
        const badgeMax = isMax ? `<span class="peak-badge peak-badge-max"><i class="fa-solid fa-arrow-up"></i> MÁX</span>` : "";
        const badgeMin = isMin ? `<span class="peak-badge peak-badge-min"><i class="fa-solid fa-arrow-down"></i> MÍN</span>` : "";

        return `
            <tr class="${rowClass}">
                <td><b>${formatHora(r.created_at)}</b>${badgeMax}${badgeMin}</td>
                <td class="text-orange"><b>${c1 !== null ? Math.round(c1) + " °C" : "--"}</b></td>
                <td class="text-blue"><b>${c2 !== null ? Math.round(c2) + " °C" : "--"}</b></td>
                <td>${delta}</td>
            </tr>
        `;
    }).join("");
}

function renderGraficoAnalise(rows) {
    const canvas = $("analysisChartCanvas");
    if (!canvas || !rows.length) return;

    if (state.analysisChart) {
        state.analysisChart.destroy();
        state.analysisChart = null;
    }

    const labels = rows.map(r => {
        const d = new Date(r.created_at);
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    });

    const c1Data = rows.map(r => numVal(r.canal_1));
    const c2Data = rows.map(r => numVal(r.canal_2));

    const ctx = canvas.getContext("2d");

    const gradC1 = ctx.createLinearGradient(0, 0, 0, 280);
    gradC1.addColorStop(0, "rgba(244, 123, 32, 0.40)");
    gradC1.addColorStop(1, "rgba(244, 123, 32, 0.0)");

    const gradC2 = ctx.createLinearGradient(0, 0, 0, 280);
    gradC2.addColorStop(0, "rgba(59, 130, 182, 0.30)");
    gradC2.addColorStop(1, "rgba(59, 130, 182, 0.0)");

    const datasets = [];

    if (state.analysisChannelFilter === "all" || state.analysisChannelFilter === "c1") {
        datasets.push({
            label: "Canal 1 (Superior)",
            data: c1Data,
            borderColor: "#f47b20",
            backgroundColor: gradC1,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: true
        });
    }

    if (state.analysisChannelFilter === "all" || state.analysisChannelFilter === "c2") {
        datasets.push({
            label: "Canal 2 (Inferior)",
            data: c2Data,
            borderColor: "#5ba6d5",
            backgroundColor: gradC2,
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: true
        });
    }

    state.analysisChart = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(7, 27, 43, 0.95)",
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + " °C" : "--"}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: "#71899a", maxTicksLimit: 8, font: { size: 10 } },
                    grid: { color: "rgba(255, 255, 255, 0.04)" }
                },
                y: {
                    ticks: { color: "#71899a", font: { size: 10 }, callback: (v) => `${v}°` },
                    grid: { color: "rgba(255, 255, 255, 0.05)" }
                }
            }
        }
    });
}

// ==========================================================================
// 6. NAVEGAÇÃO ENTRE ABAS DO MENU INFERIOR
// ==========================================================================

function navegarAba(aba) {
    state.activeTab = aba;
    state.selectedModule = null;

    if (state.mainChart) {
        state.mainChart.destroy();
        state.mainChart = null;
    }

    $("headerTitle").textContent = "ThermoLink";
    $("headerBackBtn").classList.add("hidden");

    // Desativa todas as telas
    $("screenFornos").classList.add("hidden");
    $("screenFornoDetalhe").classList.add("hidden");
    $("screenHistorico").classList.add("hidden");
    $("screenConfig").classList.add("hidden");

    // Desativa botões da bottom nav
    document.querySelectorAll(".bottom-tab-bar .tab-item").forEach(b => b.classList.remove("active"));

    if (aba === "fornos") {
        $("tabNavFornos").classList.add("active");
        $("screenFornos").classList.remove("hidden");
        renderListaFornos();
    } else if (aba === "historico") {
        $("tabNavHistorico").classList.add("active");
        $("screenHistorico").classList.remove("hidden");
        carregarDadosAnalise();
    } else if (aba === "config") {
        $("tabNavConfig").classList.add("active");
        $("screenConfig").classList.remove("hidden");
    }
}

// ==========================================================================
// 7. UTILITÁRIOS E HELPERS
// ==========================================================================

function numVal(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function formatHora(val) {
    if (!val) return "--:--:--";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "--:--:--";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatRelativo(val) {
    if (!val) return "--";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "--";
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 5) return "agora";
    if (sec < 60) return `há ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `há ${min}m`;
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function updateLivePill(online) {
    const pill = $("liveSyncPill");
    if (!pill) return;
    if (online) {
        pill.innerHTML = `<span class="pulse-dot"></span><span class="live-label">ONLINE</span>`;
        pill.style.color = "var(--green)";
        pill.style.background = "var(--green-bg)";
    } else {
        pill.innerHTML = `<span class="pulse-dot" style="background: var(--red); box-shadow: none; animation: none;"></span><span class="live-label">RECONECTANDO</span>`;
        pill.style.color = "var(--red)";
        pill.style.background = "var(--red-bg)";
    }
}

async function atualizarManual() {
    const icon = $("refreshIcon");
    if (icon) icon.style.transform = "rotate(360deg)";
    await carregarFornosELeituras();
    setTimeout(() => { if (icon) icon.style.transform = "none"; }, 400);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ==========================================================================
// 8. INICIALIZAÇÃO
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Sincronização automática a cada 8 segundos
    setInterval(() => {
        if (state.currentUser) {
            carregarFornosELeituras();
        }
    }, 8000);
});
