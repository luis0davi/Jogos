/*
===========================================================
 MONITOR DE FORNOS
 Supabase + GitHub Pages

 VERSÃO 2

 REGRA PRINCIPAL:

 Os dados chegam pela tabela "leituras".

 A leitura possui:

 - forno_id
 - dispositivo_id
 - modulo_atual
 - canal_1
 - canal_2
 - data_hora

 O sistema tenta relacionar a leitura ao forno nesta ordem:

 1. forno_id
 2. dispositivo_id + módulo
 3. módulo atual do forno
 4. número do forno = módulo

 Se uma leitura não encontrar um forno cadastrado,
 o sistema pode criar um cartão virtual usando o módulo.

 Exemplo:

 módulo 2
   ↓
 Forno 02
   ↓
 Canal 1
 Canal 2

 NUNCA coloque a service_role key aqui.
 Use somente a chave pública/anon/publishable.
===========================================================
*/


// ========================================================
// CONFIGURAÇÃO DO SUPABASE
// ========================================================

const SUPABASE_URL =
  "https://zawnluboujbovpgrgdcx.supabase.co";


const SUPABASE_ANON_KEY =
  "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";


// ========================================================
// CONFIGURAÇÕES DO PAINEL
// ========================================================

const CONFIG = {

  // Depois de quantos segundos sem leitura
  // o módulo/forno fica OFFLINE.

  onlineTimeoutSeconds: 60,


  // Frequência de atualização.

  refreshIntervalMs: 5000,


  // Quantas horas de histórico recente
  // vamos consultar.

  leituraJanelaHoras: 24,


  // Mostrar no painel o diagnóstico.

  mostrarDiagnostico: true,


  // Nome provisório da empresa.

  companyName: "CERÂMICA 1"

};


// ========================================================
// VARIÁVEIS
// ========================================================

let supabaseClient = null;

let carregando = false;


// ========================================================
// INICIALIZAÇÃO
// ========================================================

document.addEventListener(
  "DOMContentLoaded",
  iniciar
);


async function iniciar() {

  console.log(
    "======================================"
  );

  console.log(
    "🔥 MONITOR DE FORNOS - V2"
  );

  console.log(
    "======================================"
  );


  const botao =
    document.getElementById(
      "refreshButton"
    );


  botao.addEventListener(
    "click",
    carregarPainel
  );


  // Verificação das chaves

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes(
      "SUA_URL_AQUI"
    ) ||
    SUPABASE_ANON_KEY.includes(
      "SUA_CHAVE_PUBLICA_AQUI"
    )
  ) {

    mostrarErro(
      "Configure SUPABASE_URL e SUPABASE_ANON_KEY no app.js."
    );

    return;
  }


  // Criar cliente

  supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );


  console.log(
    "✓ Cliente Supabase criado."
  );


  document.getElementById(
    "companyName"
  ).textContent =
    CONFIG.companyName;


  await carregarPainel();


  // Atualização automática

  setInterval(
    carregarPainel,
    CONFIG.refreshIntervalMs
  );

}


// ========================================================
// CARREGAR PAINEL
// ========================================================

async function carregarPainel() {

  if (carregando) {
    return;
  }


  carregando = true;


  const botao =
    document.getElementById(
      "refreshButton"
    );


  botao.disabled = true;


  setConnection(
    "connecting"
  );


  try {

    limparDiagnostico();


    // ================================================
    // 1. BUSCAR FORNOS CADASTRADOS
    // ================================================

    const resultadoFornos =
      await supabaseClient

        .from("fornos")

        .select(
          "id, dispositivo_id, numero, nome, modulo_atual, ativo, criado_em"
        )

        .eq(
          "ativo",
          true
        )

        .order(
          "numero",
          {
            ascending: true
          }
        );


    console.log(
      "FORNOS:",
      resultadoFornos
    );


    if (resultadoFornos.error) {

      throw new Error(
        "Erro na tabela fornos: " +
        resultadoFornos.error.message
      );

    }


    const fornos =
      resultadoFornos.data || [];


    // ================================================
    // 2. BUSCAR LEITURAS
    // ================================================

    const limite =
      new Date(

        Date.now() -

        CONFIG.leituraJanelaHoras *
        60 *
        60 *
        1000

      ).toISOString();


    const resultadoLeituras =
      await supabaseClient

        .from("leituras")

        .select(
          "id, dispositivo_id, forno_id, modulo_atual, canal_1, canal_2, data_hora"
        )

        .gte(
          "data_hora",
          limite
        )

        .order(
          "data_hora",
          {
            ascending: false
          }
        );


    console.log(
      "LEITURAS:",
      resultadoLeituras
    );


    if (resultadoLeituras.error) {

      throw new Error(
        "Erro na tabela leituras: " +
        resultadoLeituras.error.message
      );

    }


    const leituras =
      resultadoLeituras.data || [];


    // ================================================
    // DIAGNÓSTICO
    // ================================================

    mostrarDiagnostico(

      fornos.length,

      leituras.length

    );


    // ================================================
    // 3. INDEXAR LEITURAS
    // ================================================

    const indices =
      criarIndicesLeituras(
        leituras
      );


    // ================================================
    // 4. RELACIONAR FORNOS COM LEITURAS
    // ================================================

    const resultado =
      relacionarFornos(
        fornos,
        leituras,
        indices
      );


    // ================================================
    // 5. DESENHAR
    // ================================================

    renderizarFornos(
      resultado
    );


    // ================================================
    // STATUS
    // ================================================

    const online =
      resultado.filter(
        item => item.online
      ).length;


    const offline =
      resultado.length -
      online;


    mostrarStatus(

      `✓ Banco conectado • ` +
      `${resultado.length} forno(s) • ` +
      `${online} online • ` +
      `${offline} offline • ` +
      `Atualizado às ${formatarHora(new Date())}`

    );


    setConnection(
      "online"
    );


  } catch (erro) {

    console.error(
      "ERRO:",
      erro
    );


    setConnection(
      "offline"
    );


    mostrarErro(
      erro.message
    );


  } finally {

    carregando = false;

    botao.disabled = false;

  }

}


// ========================================================
// CRIAR ÍNDICES DAS LEITURAS
// ========================================================

function criarIndicesLeituras(
  leituras
) {

  const porForno =
    new Map();


  const porDispositivoModulo =
    new Map();


  const porModulo =
    new Map();


  for (
    const leitura of leituras
  ) {

    // -----------------------------------------------
    // ÍNDICE POR FORNO_ID
    // -----------------------------------------------

    if (
      leitura.forno_id !== null &&
      leitura.forno_id !== undefined
    ) {

      const chave =
        String(
          leitura.forno_id
        );


      if (
        !porForno.has(chave)
      ) {

        porForno.set(
          chave,
          leitura
        );

      }

    }


    // -----------------------------------------------
    // ÍNDICE POR DISPOSITIVO + MÓDULO
    // -----------------------------------------------

    if (
      leitura.dispositivo_id !== null &&
      leitura.dispositivo_id !== undefined &&
      leitura.modulo_atual !== null &&
      leitura.modulo_atual !== undefined
    ) {

      const chave =

        String(
          leitura.dispositivo_id
        ) +

        "|" +

        String(
          leitura.modulo_atual
        );


      if (
        !porDispositivoModulo.has(
          chave
        )
      ) {

        porDispositivoModulo.set(
          chave,
          leitura
        );

      }

    }


    // -----------------------------------------------
    // ÍNDICE POR MÓDULO
    // -----------------------------------------------

    if (
      leitura.modulo_atual !== null &&
      leitura.modulo_atual !== undefined
    ) {

      const chave =
        String(
          leitura.modulo_atual
        );


      if (
        !porModulo.has(chave)
      ) {

        porModulo.set(
          chave,
          leitura
        );

      }

    }

  }


  return {

    porForno,

    porDispositivoModulo,

    porModulo

  };

}


// ========================================================
// RELACIONAR FORNOS
// ========================================================

function relacionarFornos(
  fornos,
  leituras,
  indices
) {

  const resultado = [];


  const idsDeLeiturasUsadas =
    new Set();


  // =====================================================
  // PRIMEIRO: FORNOS CADASTRADOS
  // =====================================================

  for (
    const forno of fornos
  ) {

    let leitura = null;

    let tipoRelacionamento =
      "Sem leitura";


    // -----------------------------------------------
    // REGRA 1
    // forno_id
    // -----------------------------------------------

    if (
      forno.id !== null &&
      forno.id !== undefined
    ) {

      leitura =
        indices.porForno.get(
          String(
            forno.id
          )
        );


      if (leitura) {

        tipoRelacionamento =
          "forno_id";

      }

    }


    // -----------------------------------------------
    // REGRA 2
    // dispositivo + módulo
    // -----------------------------------------------

    if (
      !leitura &&
      forno.dispositivo_id !== null &&
      forno.dispositivo_id !== undefined &&
      forno.modulo_atual !== null &&
      forno.modulo_atual !== undefined
    ) {

      const chave =

        String(
          forno.dispositivo_id
        ) +

        "|" +

        String(
          forno.modulo_atual
        );


      leitura =
        indices
          .porDispositivoModulo
          .get(chave);


      if (leitura) {

        tipoRelacionamento =
          "dispositivo + módulo";

      }

    }


    // -----------------------------------------------
    // REGRA 3
    // módulo atual
    // -----------------------------------------------

    if (
      !leitura &&
      forno.modulo_atual !== null &&
      forno.modulo_atual !== undefined
    ) {

      leitura =
        indices.porModulo.get(
          String(
            forno.modulo_atual
          )
        );


      if (leitura) {

        tipoRelacionamento =
          "módulo";

      }

    }


    // -----------------------------------------------
    // REGRA 4
    // número do forno = módulo
    // -----------------------------------------------

    if (
      !leitura &&
      forno.numero !== null &&
      forno.numero !== undefined
    ) {

      leitura =
        indices.porModulo.get(
          String(
            forno.numero
          )
        );


      if (leitura) {

        tipoRelacionamento =
          "número do forno = módulo";

      }

    }


    if (leitura) {

      idsDeLeiturasUsadas.add(
        leitura.id
      );

    }


    const online =
      verificarOnline(
        leitura
      );


    resultado.push({

      forno,

      leitura,

      online,

      tipoRelacionamento,

      virtual: false

    });

  }


  // =====================================================
  // SEGUNDO:
  // LEITURAS DE MÓDULOS SEM FORNO CADASTRADO
  // =====================================================

  for (
    const leitura of leituras
  ) {

    if (
      idsDeLeiturasUsadas.has(
        leitura.id
      )
    ) {

      continue;

    }


    if (
      leitura.modulo_atual === null ||
      leitura.modulo_atual === undefined
    ) {

      continue;

    }


    const modulo =
      String(
        leitura.modulo_atual
      );


    // Cria um forno virtual.

    const fornoVirtual = {

      id:
        `virtual-${modulo}`,

      dispositivo_id:
        leitura.dispositivo_id,

      numero:
        modulo,

      nome:
        `Forno ${formatarNumeroForno(modulo)}`,

      modulo_atual:
        leitura.modulo_atual,

      ativo:
        true

    };


    resultado.push({

      forno:
        fornoVirtual,

      leitura,

      online:
        verificarOnline(
          leitura
        ),

      tipoRelacionamento:
        "módulo detectado",

      virtual:
        true

    });


    idsDeLeiturasUsadas.add(
      leitura.id
    );

  }


  // =====================================================
  // ORDENAR POR NÚMERO DO FORNO
  // =====================================================

  resultado.sort(
    (a, b) => {

      const numeroA =
        Number(
          a.forno.numero
        );


      const numeroB =
        Number(
          b.forno.numero
        );


      if (
        Number.isNaN(numeroA)
      ) {

        return 1;

      }


      if (
        Number.isNaN(numeroB)
      ) {

        return -1;

      }


      return (
        numeroA -
        numeroB
      );

    }
  );


  return resultado;

}


// ========================================================
// ONLINE / OFFLINE
// ========================================================

function verificarOnline(
  leitura
) {

  if (
    !leitura ||
    !leitura.data_hora
  ) {

    return false;

  }


  const data =
    new Date(
      leitura.data_hora
    );


  if (
    Number.isNaN(
      data.getTime()
    )
  ) {

    return false;

  }


  const idadeSegundos =
    (
      Date.now() -
      data.getTime()
    ) / 1000;


  return (
    idadeSegundos >= 0 &&
    idadeSegundos <=
      CONFIG.onlineTimeoutSeconds
  );

}


// ========================================================
// DESENHAR FORNOS
// ========================================================

function renderizarFornos(
  lista
) {

  const grid =
    document.getElementById(
      "ovensGrid"
    );


  if (
    !lista.length
  ) {

    grid.innerHTML = `

      <div class="empty">

        <h2>Nenhum forno encontrado</h2>

        <p>
          Nenhum forno ativo ou módulo foi encontrado
          nas consultas ao Supabase.
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


  grid.innerHTML =
    lista
      .map(
        criarCardForno
      )
      .join("");


  const online =
    lista.filter(
      item => item.online
    ).length;


  const offline =
    lista.length -
    online;


  atualizarResumo(

    lista.length,

    online,

    offline

  );

}


// ========================================================
// CARD
// ========================================================

function criarCardForno(
  item
) {

  const forno =
    item.forno;


  const leitura =
    item.leitura;


  const nome =
    forno.nome ||
    `Forno ${forno.numero || forno.id}`;


  const numero =
    forno.numero ??
    forno.id ??
    "--";


  const modulo =
    leitura?.modulo_atual ??
    forno.modulo_atual ??
    "--";


  const dispositivo =
    leitura?.dispositivo_id ??
    forno.dispositivo_id ??
    "--";


  const status =
    item.online
      ? "ONLINE"
      : "OFFLINE";


  const classeStatus =
    item.online
      ? "online"
      : "offline";


  const canal1 =
    leitura?.canal_1;


  const canal2 =
    leitura?.canal_2;


  const ultimaLeitura =
    leitura?.data_hora
      ? formatarDataHora(
          leitura.data_hora
        )
      : "Nenhuma leitura";


  const tipo =
    item.tipoRelacionamento ||
    "Sem relacionamento";


  return `

    <article class="oven-card">

      <div class="oven-header">

        <div>

          <h2 class="oven-name">

            🔥 ${escaparHTML(nome)}

          </h2>


          <div class="oven-info">

            Forno nº
            <strong>
              ${escaparHTML(
                String(numero)
              )}
            </strong>

            <br>

            Módulo
            <strong>
              ${escaparHTML(
                String(modulo)
              )}
            </strong>

            • Dispositivo
            <strong>
              ${escaparHTML(
                String(dispositivo)
              )}
            </strong>

          </div>

        </div>


        <span
          class="status-badge ${classeStatus}"
        >

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
        <strong>
          ${escaparHTML(
            ultimaLeitura
          )}
        </strong>

        <br>

        <span class="match-type">

          Relação:
          ${escaparHTML(
            tipo
          )}

        </span>

      </div>

    </article>

  `;

}


// ========================================================
// CANAL
// ========================================================

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


  const numero =
    Number(
      valor
    );


  if (
    Number.isNaN(numero)
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


  return `

    <div class="channel">

      <div class="channel-label">

        ${nome}

      </div>


      <div class="temperature">

        ${numero.toLocaleString(
          "pt-BR",
          {
            maximumFractionDigits: 1
          }
        )}

        <small>°C</small>

      </div>

    </div>

  `;

}


// ========================================================
// RESUMO
// ========================================================

function atualizarResumo(
  total,
  online,
  offline
) {

  document.getElementById(
    "totalFornos"
  ).textContent =
    total;


  document.getElementById(
    "onlineFornos"
  ).textContent =
    online;


  document.getElementById(
    "offlineFornos"
  ).textContent =
    offline;


  document.getElementById(
    "lastUpdate"
  ).textContent =
    formatarHora(
      new Date()
    );

}


// ========================================================
// DIAGNÓSTICO
// ========================================================

function mostrarDiagnostico(
  quantidadeFornos,
  quantidadeLeituras
) {

  if (
    !CONFIG.mostrarDiagnostico
  ) {

    return;

  }


  const elemento =
    document.getElementById(
      "diagnostic"
    );


  elemento.classList.add(
    "show"
  );


  elemento.innerHTML = `

    <div class="ok">
      ✓ Conexão com Supabase funcionando
    </div>

    <div>
      Tabela <b>fornos</b>:
      ${quantidadeFornos} registro(s)
    </div>

    <div>
      Tabela <b>leituras</b>:
      ${quantidadeLeituras} registro(s) nas últimas
      ${CONFIG.leituraJanelaHoras} horas
    </div>

  `;

}


// ========================================================
// LIMPAR DIAGNÓSTICO
// ========================================================

function limparDiagnostico() {

  const elemento =
    document.getElementById(
      "diagnostic"
    );


  elemento.classList.remove(
    "show"
  );


  elemento.innerHTML =
    "";

}


// ========================================================
// STATUS
// ========================================================

function mostrarStatus(
  mensagem
) {

  const elemento =
    document.getElementById(
      "statusMessage"
    );


  elemento.className =
    "status-message";


  elemento.textContent =
    mensagem;

}


// ========================================================
// ERRO
// ========================================================

function mostrarErro(
  mensagem
) {

  const elemento =
    document.getElementById(
      "statusMessage"
    );


  elemento.className =
    "status-message error";


  elemento.innerHTML = `

    <strong>❌ Erro</strong>

    <br>

    ${escaparHTML(
      mensagem
    )}

    <br><br>

    Abra o console do navegador
    com F12 para ver os detalhes.

  `;


  const grid =
    document.getElementById(
      "ovensGrid"
    );


  grid.innerHTML = `

    <div class="error-box">

      <strong>
        Não foi possível carregar os dados.
      </strong>

      <p>
        Verifique a conexão com o Supabase
        e as políticas RLS.
      </p>

      <p>
        Erro:
        ${escaparHTML(
          mensagem
        )}
      </p>

    </div>

  `;

}


// ========================================================
// CONEXÃO
// ========================================================

function setConnection(
  estado
) {

  const dot =
    document.getElementById(
      "connectionDot"
    );


  const texto =
    document.getElementById(
      "connectionText"
    );


  dot.classList.remove(
    "online",
    "offline"
  );


  if (
    estado === "online"
  ) {

    dot.classList.add(
      "online"
    );


    texto.textContent =
      "Supabase conectado";


  } else if (
    estado === "connecting"
  ) {

    dot.classList.add(
      "offline"
    );


    texto.textContent =
      "Consultando...";


  } else {

    dot.classList.add(
      "offline"
    );


    texto.textContent =
      "Erro de conexão";

  }

}


// ========================================================
// FORMATAÇÕES
// ========================================================

function formatarHora(
  data
) {

  return data.toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );

}


function formatarDataHora(
  valor
) {

  const data =
    new Date(
      valor
    );


  if (
    Number.isNaN(
      data.getTime()
    )
  ) {

    return "Data inválida";

  }


  return data.toLocaleString(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );

}


function formatarNumeroForno(
  numero
) {

  const n =
    Number(
      numero
    );


  if (
    Number.isNaN(n)
  ) {

    return String(
      numero
    );

  }


  return String(
    n
  ).padStart(
    2,
    "0"
  );

}


// ========================================================
// ESCAPE HTML
// ========================================================

function escaparHTML(
  valor
) {

  return String(
    valor
  )

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
