// ======================================================
// THERMOLINK COM AUTENTICAÇÃO, ALARMES, GRÁFICO DUPLO E 3D
// ======================================================

const SUPABASE_URL = "https://zawnluboujbovpgrgdcx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ESTADO DO APP
const state = {
    ovens: [],
    readings: new Map(),
    selectedModule: null,
    chart: null,
    miniCharts: [],
    alarms: {}, // Guarda configs por modulo ex: { 1: { t1Min: 0, t1Max: 800, ... } }
    audioCtx: null,
    alarmInterval: null,
    isMuted: false,
    three: {
        scene: null,
        camera: null,
        renderer: null,
        ovenMesh: null,
        fireLight: null,
        animId: null
    }
};

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
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function isOnline(reading) {
    if (!reading || !reading.created_at) return false;
    const date = new Date(reading.created_at);
    if (Number.isNaN(date.getTime())) return false;
    return (Date.now() - date.getTime()) <= 3 * 60 * 1000;
}

function ovenName(module) {
    const oven = state.ovens.find(item => Number(item.numero) === Number(module));
    return oven && oven.nome ? oven.nome : `Forno ${String(module).padStart(2, "0")}`;
}

// ======================================================
// LOGIN E AUTENTICAÇÃO (SUPABASE AUTH)
// ======================================================

async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        showApp();
    } else {
        showLogin();
    }
}

function showLogin() {
    $("loginView").classList.remove("hidden");
    $("mainApp").classList.add("hidden");
}

function showApp() {
    $("loginView").classList.add("hidden");
    $("mainApp").classList.remove("hidden");
    initApp();
}

$("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    $("loginError").classList.add("hidden");

    const email = $("loginEmail").value;
    const password = $("loginPassword").value;

    const { error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
        $("loginError").textContent = "Erro ao entrar: " + error.message;
        $("loginError").classList.remove("hidden");
    } else {
        showApp();
    }
};

$("logoutBtn").onclick = async () => {
    await sb.auth.signOut();
    showLogin();
};

// ======================================================
// SISTEMA DE ALARMES E ÁUDIO
// ======================================================

function initAudio() {
    if (!state.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.audioCtx = new AudioContext();
    }
}

function playBeep() {
    if (state.isMuted) return;
    try {
        initAudio();
        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, state.audioCtx.currentTime); // Tom agudo
        gain.gain.setValueAtTime(0.1, state.audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(state.audioCtx.destination);
        osc.start();
        osc.stop(state.audioCtx.currentTime + 0.3);
    } catch (e) {
        console.warn("Áudio não permitido ainda:", e);
    }
}

function checkAlarms(module, reading) {
    if (!reading) return;
    const config = state.alarms[module];
    if (!config) return;

    const t1 = numberValue(reading.canal_1);
    const t2 = numberValue(reading.canal_2);

    let triggered = false;
    let msg = [];

    if (t1 !== null) {
        if (config.t1Max !== null && t1 > config.t1Max) { triggered = true; msg.push("T1 Acima do Máx!"); }
        if (config.t1Min !== null && t1 < config.t1Min) { triggered = true; msg.push("T1 Abaixo do Mín!"); }
    }

    if (t2 !== null) {
        if (config.t2Max !== null && t2 > config.t2Max) { triggered = true; msg.push("T2 Acima do Máx!"); }
        if (config.t2Min !== null && t2 < config.t2Min) { triggered = true; msg.push("T2 Abaixo do Mín!"); }
    }

    const alarmStatusEl = $("alarmStatus");
    const muteBtn = $("muteAlarmBtn");

    if (triggered) {
        alarmStatusEl.textContent = "🚨 ALARME: " + msg.join(" | ");
        alarmStatusEl.style.color = "var(--red)";
        document.body.classList.add("alarm-active");
        muteBtn.classList.remove("hidden");
        playBeep();
    } else {
        alarmStatusEl.textContent = "Status: Normal";
        alarmStatusEl.style.color = "var(--muted)";
        document.body.classList.remove("alarm-active");
        muteBtn.classList.add("hidden");
    }
}

$("saveAlarmsBtn").onclick = () => {
    const module = state.selectedModule;
    if (!module) return;

    state.alarms[module] = {
        t1Min: $("alarmT1Min").value ? Number($("alarmT1Min").value) : null,
        t1Max: $("alarmT1Max").value ? Number($("alarmT1Max").value) : null,
        t2Min: $("alarmT2Min").value ? Number($("alarmT2Min").value) : null,
        t2Max: $("alarmT2Max").value ? Number($("alarmT2Max").value) : null
    };

    alert("Configurações de alarme salvas!");
    initAudio(); // Ativa contexto de áudio com interação
};

$("muteAlarmBtn").onclick = () => {
    state.isMuted = true;
    document.body.classList.remove("alarm-active");
    $("muteAlarmBtn").classList.add("hidden");
};

// ======================================================
// VISUALIZAÇÃO 3D DO FORNO (THREE.JS)
// ======================================================

function setup3DOven() {
    const container = $("oven3dContainer");
    container.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e24);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(3, 3, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Luz ambiente
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Forno (Estrutura Cilíndrica Cerâmica/Tijolo)
    const ovenGroup = new THREE.Group();

    // Parede Externa (Forno)
    const geometry = new THREE.CylinderGeometry(1.2, 1.4, 2, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 }); // Cor tijolo/cerâmica
    const ovenMesh = new THREE.Mesh(geometry, material);
    ovenGroup.add(ovenMesh);

    // Abertura do Forno (Porta)
    const doorGeo = new THREE.BoxGeometry(0.8, 0.9, 0.2);
    const doorMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, -0.2, 1.15);
    ovenGroup.add(door);

    // Luz Interna (Simula o Fogo/Calor)
    const fireLight = new THREE.PointLight(0xff641f, 0, 5);
    fireLight.position.set(0, -0.2, 0.8);
    ovenGroup.add(fireLight);

    scene.add(ovenGroup);

    state.three = { scene, camera, renderer, ovenGroup, fireLight };

    function animate() {
        state.three.animId = requestAnimationFrame(animate);
        ovenGroup.rotation.y += 0.005; // Rotação lenta
        renderer.render(scene, camera);
    }
    animate();
}

function update3DOvenTemp(temp) {
    if (!state.three.fireLight) return;
    const value = numberValue(temp) || 0;

    // Intensidade proporcional à temperatura (ex: até 1000°C)
    const intensity = Math.min(value / 100, 10);
    state.three.fireLight.intensity = intensity;

    // Cor muda de laranja escuro para amarelo/branco de acordo com a alta temperatura
    if (value > 600) {
        state.three.fireLight.color.setHex(0xffa500);
    } else if (value > 900) {
        state.three.fireLight.color.setHex(0xffff00);
    } else {
        state.three.fireLight.color.setHex(0xff641f);
    }
}

// ======================================================
// LÓGICA DE CARREGAMENTO E HOME
// ======================================================

async function loadOvens() {
    const { data, error } = await sb
        .from("fornos")
        .select(`id, dispositivo_id, numero, nome, ativo`)
        .eq("ativo", true)
        .order("numero", { ascending: true });

    if (error || !data || !data.length) {
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

async function loadLatest() {
    const { data, error } = await sb
        .from("leituras")
        .select(`id, dispositivo_id, forno_id, modulo_alutal, canal_1, canal_2, created_at`)
        .order("created_at", { ascending: false })
        .limit(1000);

    if (error) return;

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

function renderHome() {
    state.miniCharts.forEach(chart => chart.destroy());
    state.miniCharts = [];

    const onlineOvens = state.ovens.filter(oven =>
        isOnline(state.readings.get(Number(oven.numero)))
    );

    $("onlineCount").textContent = `${onlineOvens.length} online`;
    const grid = $("ovenGrid");

    if (!onlineOvens.length) {
        grid.innerHTML = `<div class="empty">Nenhum forno online no momento.</div>`;
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
                <div class="temp">${temp1Text}<small>°C</small></div>
                <div class="trend"><canvas id="mini-${module}"></canvas></div>
            </div>
            <div class="oven-bottom">
                <div class="mini">
                    <span>Temperatura 2</span>
                    <strong>${temperature(reading?.canal_2)}</strong>
                </div>
                <div class="mini" style="text-align:right">
                    <span>Atualizado</span>
                    <strong>${time(reading?.created_at)}</strong>
                </div>
            </div>
        </article>`;
    }).join("");

    grid.querySelectorAll(".oven-card").forEach(card => {
        card.addEventListener("click", () => openDetail(Number(card.dataset.module)));
    });

    onlineOvens.forEach(oven => drawMiniChart(Number(oven.numero)));
}

async function drawMiniChart(module) {
    const canvas = $(`mini-${module}`);
    if (!canvas) return;

    const rows = await getHistory(module, 30);
    const values = rows.map(row => numberValue(row.canal_1)).filter(v => v !== null);

    if (!values.length) return;

    const chart = new Chart(canvas, {
        type: "line",
        data: {
            labels: values.map(() => ""),
            datasets: [{ data: values, borderColor: "#ff641f", borderWidth: 2, tension: .35, pointRadius: 0, fill: false }]
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

async function getHistory(module, limit = 120) {
    const { data, error } = await sb
        .from("leituras")
        .select(`canal_1, canal_2, modulo_alutal, created_at`)
        .eq("modulo_alutal", module)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) return [];
    return (data || []).reverse();
}

// ======================================================
// DETALHE DO FORNO (GRÁFICO DUPLO & ALARME)
// ======================================================

async function openDetail(module) {
    state.selectedModule = module;
    state.isMuted = false;

    $("homeView").classList.add("hidden");
    $("detailView").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

    $("detailName").textContent = ovenName(module);
    const reading = state.readings.get(module);

    $("detailTemp").textContent = temperature(reading?.canal_1);
    $("pCanal1").textContent = temperature(reading?.canal_1);
    $("pCanal2").textContent = temperature(reading?.canal_2);
    $("pModulo").textContent = module;
    $("pHora").textContent = time(reading?.created_at);

    // Preenche Inputs de Alarme
    const cfg = state.alarms[module] || {};
    $("alarmT1Min").value = cfg.t1Min ?? "";
    $("alarmT1Max").value = cfg.t1Max ?? "";
    $("alarmT2Min").value = cfg.t2Min ?? "";
    $("alarmT2Max").value = cfg.t2Max ?? "";

    // Inicializa 3D
    setup3DOven();
    update3DOvenTemp(reading?.canal_1);

    // Histórico
    const rows = await getHistory(module, 120);
    $("readingCount").textContent = `${rows.length} registros`;

    if (!rows.length) {
        $("historyList").innerHTML = `<div class="empty">Nenhuma leitura histórica.</div>`;
    } else {
        $("historyList").innerHTML = rows.slice(-15).reverse().map(row => `
            <div class="history-row">
                <span>${time(row.created_at)}</span>
                <strong>T1: ${temperature(row.canal_1)}</strong>
                <span>T2: ${temperature(row.canal_2)}</span>
            </div>
        `).join("");
    }

    if (state.chart) state.chart.destroy();
    if (!rows.length) return;

    // GRÁFICO DUPLO (CANAL 1 E CANAL 2)
    state.chart = new Chart($("detailChart"), {
        type: "line",
        data: {
            labels: rows.map(row => new Date(row.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })),
            datasets: [
                {
                    label: "Temperatura 1",
                    data: rows.map(row => numberValue(row.canal_1)),
                    borderColor: "#ff641f",
                    backgroundColor: "rgba(255,100,31,.08)",
                    borderWidth: 2,
                    tension: .3,
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: "Temperatura 2",
                    data: rows.map(row => numberValue(row.canal_2)),
                    borderColor: "#007bff",
                    backgroundColor: "rgba(0,123,255,.08)",
                    borderWidth: 2,
                    tension: .3,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 8 } } },
                y: { grid: { color: "#eeeeee" }, ticks: { font: { size: 8 } } }
            }
        }
    });

    $("burnTime").textContent = "--";
    checkAlarms(module, reading);
}

function updateDetail(module) {
    const reading = state.readings.get(module);

    if (!isOnline(reading)) {
        closeDetail();
        return;
    }

    $("detailTemp").textContent = temperature(reading.canal_1);
    $("pCanal1").textContent = temperature(reading.canal_1);
    $("pCanal2").textContent = temperature(reading.canal_2);
    $("pHora").textContent = time(reading.created_at);

    update3DOvenTemp(reading.canal_1);
    checkAlarms(module, reading);
}

function closeDetail() {
    state.selectedModule = null;
    document.body.classList.remove("alarm-active");

    if (state.three.animId) cancelAnimationFrame(state.three.animId);
    if (state.chart) { state.chart.destroy(); state.chart = null; }

    $("detailView").classList.add("hidden");
    $("homeView").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

    renderHome();
}

$("backBtn").onclick = closeDetail;
$("homeNav").onclick = closeDetail;

setInterval(loadLatest, 12000);

async function initApp() {
    try {
        await loadOvens();
        await loadLatest();
    } catch (error) {
        $("ovenGrid").innerHTML = `<div class="empty">Não foi possível carregar os fornos.</div>`;
    }
}

// Ponto de entrada: checa se usuário já está logado
checkAuth();
