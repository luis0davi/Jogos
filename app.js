/*
  MONITOR DE FORNOS
  Supabase + GitHub Pages

  IMPORTANTE:
  1. Cole abaixo a URL do seu projeto Supabase.
  2. Cole abaixo a chave pública (anon/publishable key).
  3. NUNCA coloque a service_role key neste arquivo.
*/

const SUPABASE_URL = "https://zawnluboujbovpgrgdcx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";


 // =====================================================
// MONITOR DE FORNOS
// SUPABASE + GITHUB PAGES
// =====================================================

// COLOQUE OS DADOS DO SEU SUPABASE AQUI



// =====================================================
// CONFIGURAÇÕES
// =====================================================

const CONFIG = {

  // Tempo máximo sem receber leitura para considerar ONLINE
  onlineTimeoutSeconds: 60,

  // Atualização automática
  refreshIntervalMs: 5000

};


// =====================================================
// VARIÁVEIS
// =====================================================

let supabaseClient = null;


// =====================================================
// INICIALIZAÇÃO
// =====================================================

document.addEventListener("DOMContentLoaded", iniciar);


async function iniciar() {

  console.log("=================================");
  console.log("MONITOR DE FORNOS");
  console.log("Iniciando...");
  console.log("=================================");


  // Verifica configuração

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes("SUA_URL") ||
    SUPABASE_ANON_KEY.includes("SUA_CHAVE")
  ) {

    mostrarErro(
      "ERRO: URL ou chave do Supabase não configurada."
    );

    return;
  }


  // Cria conexão

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );


  console.log("Supabase inicializado.");

  mostrarStatus("Conectando ao Supabase...");


  // Primeira leitura

  await carregarDados();


  // Atualização automática

  setInterval(
    carregarDados,
    CONFIG.refreshIntervalMs
  );

}



// =====================================================
// CARREGAR DADOS
// =====================================================

async function carregarDados() {

  try {

    mostrarStatus("Consultando banco de dados...");


    // =================================================
    // 1 - BUSCAR FORNOS
    // =================================================

    console.log("Consultando tabela: fornos");


    const resultadoFornos = await supabaseClient
      .from("fornos")
      .select("*")
      .eq("ativo", true)
      .order("numero", {
        ascending: true
      });


    console.log("Resultado FORNOS:", resultadoFornos);


    if (resultadoFornos.error) {

      throw new Error(
        "Erro na tabela FORNOS: " +
        resultadoFornos.error.message
      );

    }


    const fornos = resultadoFornos.data || [];


    console.log(
      "Quantidade de fornos:",
      fornos.length
    );


    // =================================================
    // 2 - BUSCAR LEITURAS
    // =================================================

    console.log("Consultando tabela: leituras");


    const dataLimite = new Date(
      Date.now() -
      24 * 60 * 60 * 1000
    ).toISOString();


    const resultadoLeituras = await supabaseClient
      .from("leituras")
      .select("*")
      .gte("data_hora", dataLimite)
      .order("data_hora", {
        ascending: false
      });


    console.log(
      "Resultado LEITURAS:",
      resultadoLeituras
    );


    if (resultadoLeituras.error) {

      throw new Error(
        "Erro na tabela LEITURAS: " +
        resultadoLeituras.error.message
      );

    }


    const leituras =
      resultadoLeituras.data || [];


    console.log(
      "Quantidade de leituras:",
      leituras.length
    );


    // =================================================
    // 3 - PEGAR ÚLTIMA LEITURA DE CADA FORNO
    // =================================================

    const ultimasLeituras =
      new Map();


    for (const leitura of leituras) {

      const fornoID =
        String(leitura.forno_id);


      if (
        !ultimasLeituras.has(fornoID)
      ) {

        ultimasLeituras.set(
          fornoID,
          leitura
        );

      }

    }


    // =================================================
    // 4 - MONTAR DADOS
    // =================================================

    const dadosFornos =
      fornos.map(forno => {

        const leitura =
          ultimasLeituras.get(
            String(forno.id)
          );


        let online = false;


        if (leitura?.data_hora) {

          const dataLeitura =
            new Date(
              leitura.data_hora
            );


          const segundos =
            (
              Date.now() -
              dataLeitura.getTime()
            ) / 1000;


          online =
            segundos <=
            CONFIG.onlineTimeoutSeconds;

        }


        return {

          forno,
          leitura,
          online

        };

      });


    // =================================================
    // 5 - MOSTRAR
    // =================================================

    mostrarFornos(
      dadosFornos
    );


    mostrarStatus(
      "✓ Supabase conectado | " +
      fornos.length +
      " forno(s) | " +
      leituras.length +
      " leitura(s)"
    );


  } catch (erro) {

    console.error(
      "ERRO COMPLETO:",
      erro
    );


    mostrarErro(
      erro.message
    );

  }

}



// =====================================================
// MOSTRAR FORNOS
// =====================================================

function mostrarFornos(lista) {

  const container =
    document.getElementById(
      "ovensGrid"
    );


  if (!container) {

    console.error(
      "Elemento ovensGrid não encontrado."
    );

    return;

  }


  if (lista.length === 0) {

    container.innerHTML = `

      <div class="empty">

        <h2>Nenhum forno encontrado</h2>

        <p>
          A consulta ao Supabase funcionou,
          mas nenhum forno ativo foi retornado.
        </p>

        <p>
          Verifique a coluna <b>ativo</b>
          da tabela <b>fornos</b>.
        </p>

      </div>

    `;

    atualizarResumo(
      0,
      0,
      0
    );

    return;

  }


  let html = "";


  let online = 0;


  lista.forEach(item => {

    if (item.online) {

      online++;

    }


    html += criarCard(
      item
    );

  });


  container.innerHTML =
    html;


  atualizarResumo(

    lista.length,

    online,

    lista.length - online

  );

}



// =====================================================
// CARD DO FORNO
// =====================================================

function criarCard(item) {

  const forno =
    item.forno;


  const leitura =
    item.leitura;


  const nome =
    forno.nome ||
    `Forno ${forno.numero || forno.id}`;


  const canal1 =
    leitura?.canal_1;


  const canal2 =
    leitura?.canal_2;


  const modulo =
    leitura?.modulo_atual ??
    forno.modulo_atual ??
    "--";


  const dispositivo =
    forno.dispositivo_id ??
    "--";


  const status =
    item.online
      ? "ONLINE"
      : "OFFLINE";


  const classe =
    item.online
      ? "online"
      : "offline";


  const ultimaLeitura =
    leitura?.data_hora
      ? formatarDataHora(
          leitura.data_hora
        )
      : "Nenhuma leitura";


  return `

    <article class="oven-card">

      <div class="oven-header">

        <div>

          <h2 class="oven-name">

            🔥 ${escapar(nome)}

          </h2>


          <div class="oven-info">

            Forno nº
            ${escapar(
              forno.numero ?? "--"
            )}

            • Módulo
            ${escapar(modulo)}

            • Dispositivo
            ${escapar(dispositivo)}

          </div>

        </div>


        <span class="status-badge ${classe}">

          ● ${status}

        </span>

      </div>


      <div class="channels">

        ${criarCanal(
          "Canal 1",
          canal1
        )}


        ${criarCanal(
          "Canal 2",
          canal2
        )}

      </div>


      <div class="oven-footer">

        Última leitura:

        ${ultimaLeitura}

      </div>

    </article>

  `;

}



// =====================================================
// CANAL
// =====================================================

function criarCanal(
  nome,
  valor
) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {

    return `

      <div class="channel inactive">

        <div class="channel-label">

          ${nome}

        </div>

        <div class="temperature">

          -- <small>°C</small>

        </div>

      </div>

    `;

  }


  const temperatura =
    Number(valor);


  return `

    <div class="channel">

      <div class="channel-label">

        ${nome}

      </div>


      <div class="temperature">

        ${temperatura.toLocaleString(
          "pt-BR"
        )}

        <small>°C</small>

      </div>

    </div>

  `;

}



// =====================================================
// RESUMO
// =====================================================

function atualizarResumo(
  total,
  online,
  offline
) {

  document.getElementById(
    "totalFornos"
  ).textContent = total;


  document.getElementById(
    "onlineFornos"
  ).textContent = online;


  document.getElementById(
    "offlineFornos"
  ).textContent = offline;


  document.getElementById(
    "lastUpdate"
  ).textContent =
    new Date().toLocaleTimeString(
      "pt-BR"
    );

}



// =====================================================
// STATUS
// =====================================================

function mostrarStatus(
  mensagem
) {

  const elemento =
    document.getElementById(
      "statusMessage"
    );


  if (!elemento) return;


  elemento.className =
    "status-message";


  elemento.textContent =
    mensagem;

}



// =====================================================
// ERRO
// =====================================================

function mostrarErro(
  mensagem
) {

  const elemento =
    document.getElementById(
      "statusMessage"
    );


  if (!elemento) return;


  elemento.className =
    "status-message error";


  elemento.innerHTML = `

    <strong>❌ ERRO</strong>

    <br><br>

    ${escapar(mensagem)}

    <br><br>

    Abra o console do navegador
    com <b>F12</b> para ver detalhes.

  `;

}



// =====================================================
// DATA
// =====================================================

function formatarDataHora(
  valor
) {

  const data =
    new Date(valor);


  return data.toLocaleString(
    "pt-BR"
  );

}



// =====================================================
// SEGURANÇA
// =====================================================

function escapar(valor) {

  return String(valor)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}
