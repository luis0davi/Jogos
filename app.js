/*
  MONITOR DE FORNOS
  Supabase + GitHub Pages

  IMPORTANTE:
  1. Cole abaixo a URL do seu projeto Supabase.
  2. Cole abaixo a chave pública (anon/publishable key).
  3. NUNCA coloque a service_role key neste arquivo.
*/

const SUPABASE_URL = "COLE_A_URL_DO_SEU_PROJETO_AQUI";
const SUPABASE_ANON_KEY = "COLE_A_CHAVE_PUBLICA_ANON_OU_PUBLISHABLE_AQUI";

const CONFIG = {
  // Nome mostrado no cabeçalho enquanto ainda não existe vínculo
  // empresa -> forno na estrutura mostrada nas fotos.
  companyFallback: "CERÂMICA 1",

  // Um forno será considerado OFFLINE se a última leitura tiver
  // mais de 60 segundos.
  onlineTimeoutSeconds: 60,

  // Atualiza o painel automaticamente a cada 5 segundos.
  refreshIntervalMs: 5000
};

let supabaseClient = null;
let refreshTimer = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (
    SUPABASE_URL.includes("COLE_A_URL") ||
    SUPABASE_ANON_KEY.includes("COLE_A_CHAVE")
  ) {
    showMessage(
      "Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo app.js antes de publicar.",
      true
    );
    return;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  document
    .getElementById("refreshButton")
    .addEventListener("click", loadDashboard);

  await loadDashboard();

  refreshTimer = setInterval(loadDashboard, CONFIG.refreshIntervalMs);
}

async function loadDashboard() {
  setConnection("connecting");

  try {
    // 1) Busca os fornos ativos.
    const { data: fornos, error: fornosError } = await supabaseClient
      .from("fornos")
      .select("id, dispositivo_id, numero, nome, modulo_atual, ativo, criado_em")
      .eq("ativo", true)
      .order("numero", { ascending: true });

    if (fornosError) throw fornosError;

    // 2) Busca as leituras recentes.
    // Trazemos uma janela razoável para encontrar a leitura mais recente
    // de cada forno sem carregar todo o histórico.
    const limite = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: leituras, error: leiturasError } = await supabaseClient
      .from("leituras")
      .select(
        "id, dispositivo_id, forno_id, modulo_atual, canal_1, canal_2, data_hora"
      )
      .gte("data_hora", limite)
      .order("data_hora", { ascending: false });

    if (leiturasError) throw leiturasError;

    const ultimaLeituraPorForno = new Map();

    for (const leitura of leituras || []) {
      const fornoId = String(leitura.forno_id);

      if (!ultimaLeituraPorForno.has(fornoId)) {
        ultimaLeituraPorForno.set(fornoId, leitura);
      }
    }

    const cards = (fornos || []).map((forno) => {
      const leitura = ultimaLeituraPorForno.get(String(forno.id));
      return montarDadosForno(forno, leitura);
    });

    renderDashboard(cards);
    setConnection("online");

  } catch (error) {
    console.error("Erro ao carregar o painel:", error);
    setConnection("offline");

    showMessage(
      "Não foi possível consultar o Supabase. Confira a URL, a chave pública e as políticas RLS.",
      true
    );
  }
}

function montarDadosForno(forno, leitura) {
  let online = false;

  if (leitura?.data_hora) {
    const ultimaData = new Date(leitura.data_hora);
    const idadeSegundos = (Date.now() - ultimaData.getTime()) / 1000;
    online = idadeSegundos <= CONFIG.onlineTimeoutSeconds;
  }

  return {
    ...forno,
    leitura,
    online
  };
}

function renderDashboard(fornos) {
  const grid = document.getElementById("ovensGrid");

  const online = fornos.filter((forno) => forno.online).length;
  const offline = fornos.length - online;

  document.getElementById("companyName").textContent =
    CONFIG.companyFallback;

  document.getElementById("totalFornos").textContent = fornos.length;
  document.getElementById("onlineFornos").textContent = online;
  document.getElementById("offlineFornos").textContent = offline;
  document.getElementById("lastUpdate").textContent =
    formatarHora(new Date());

  if (!fornos.length) {
    grid.innerHTML = `
      <div class="empty">
        Nenhum forno ativo foi encontrado.
      </div>
    `;
    showMessage("Nenhum forno ativo encontrado na tabela fornos.");
    return;
  }

  grid.innerHTML = fornos.map(criarCardForno).join("");

  showMessage(
    `Atualizado às ${formatarHora(new Date())}. ${online} forno(s) online.`
  );
}

function criarCardForno(forno) {
  const leitura = forno.leitura;

  const canal1 = leitura?.canal_1;
  const canal2 = leitura?.canal_2;

  const nome = escaparHTML(forno.nome || `Forno ${forno.numero}`);
  const modulo = leitura?.modulo_atual ?? forno.modulo_atual ?? "--";

  const statusClass = forno.online ? "online" : "offline";
  const statusText = forno.online ? "● ONLINE" : "● OFFLINE";

  const dataLeitura = leitura?.data_hora
    ? formatarDataHora(leitura.data_hora)
    : "Sem leitura";

  return `
    <article class="oven-card">
      <div class="oven-header">
        <div>
          <h2 class="oven-name">${nome}</h2>
          <div class="oven-info">
            Forno nº ${escaparHTML(String(forno.numero ?? "--"))}
            • Módulo ${escaparHTML(String(modulo))}
            • Dispositivo ${escaparHTML(String(forno.dispositivo_id ?? "--"))}
          </div>
        </div>

        <span class="status-badge ${statusClass}">
          ${statusText}
        </span>
      </div>

      <div class="channels">
        ${criarCanal("Canal 1", canal1)}
        ${criarCanal("Canal 2", canal2)}
      </div>

      <div class="oven-footer">
        Última leitura: ${dataLeitura}
      </div>
    </article>
  `;
}

function criarCanal(nome, valor) {
  const numero = converterNumero(valor);

  if (numero === null) {
    return `
      <div class="channel inactive">
        <div class="channel-label">${nome}</div>
        <div class="temperature">-- <small>°C</small></div>
      </div>
    `;
  }

  return `
    <div class="channel">
      <div class="channel-label">${nome}</div>
      <div class="temperature">
        ${formatarTemperatura(numero)} <small>°C</small>
      </div>
    </div>
  `;
}

function converterNumero(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function formatarTemperatura(valor) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1
  }).format(valor);
}

function formatarHora(data) {
  return data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatarDataHora(valor) {
  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "Data inválida";
  }

  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function setConnection(status) {
  const dot = document.getElementById("connectionDot");
  const text = document.getElementById("connectionText");

  dot.classList.remove("online", "offline");

  if (status === "online") {
    dot.classList.add("online");
    text.textContent = "Supabase conectado";
  } else if (status === "connecting") {
    dot.classList.add("offline");
    text.textContent = "Consultando...";
  } else {
    dot.classList.add("offline");
    text.textContent = "Erro de conexão";
  }
}

function showMessage(message, isError = false) {
  const element = document.getElementById("statusMessage");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function escaparHTML(valor) {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
