// =====================================================
// THERMOLINK
// =====================================================

// SUPABASE

const SUPABASE_URL =
    "https://zawnluboujbovpgrgdcx.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";

const { createClient } = window.supabase;

const sb = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


// =====================================================
// CONFIGURAÇÕES
// =====================================================

// Tempo para considerar um forno ONLINE
// 3 minutos

const ONLINE_TIME =
    3 * 60 * 1000;


// =====================================================
// ESTADO
// =====================================================

const state = {

    ovens: [],

    latest: new Map(),

    selectedModule: null,

    chart: null

};


// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function $id(id) {

    return document.getElementById(id);

}


function number(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;

    }

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : null;

}


function formatTemperature(value) {

    const n = number(value);

    if (n === null) {

        return "-- °C";

    }

    return (
        n.toLocaleString(
            "pt-BR",
            {
                maximumFractionDigits: 1
            }
        ) + " °C"
    );

}


function formatTime(value) {

    if (!value) {

        return "--";

    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "--";

    }

    return date.toLocaleTimeString(
        "pt-BR",
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );

}


function isOnline(row) {

    if (
        !row ||
        !row.data_hora
    ) {

        return false;

    }

    const date =
        new Date(
            row.data_hora
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return false;

    }

    const difference =
        Date.now() -
        date.getTime();

    return (
        difference <= ONLINE_TIME
    );

}


// =====================================================
// BUSCAR LEITURAS
// =====================================================

async function loadReadings() {

    console.log(
        "[ThermoLink] Buscando leituras..."
    );


    const {
        data,
        error
    } = await sb

        .from("leituras")

        .select(
            `
            eu_id,
            dispositivo_id,
            forno_id,
            modulo_alutal,
            canal_1,
            canal_2,
            data_hora
            `
        )

        .order(
            "data_hora",
            {
                ascending: false
            }
        )

        .limit(1000);


    if (error) {

        console.error(
            "[ThermoLink] Erro ao buscar leituras:",
            error
        );

        return;

    }


    console.log(
        "[ThermoLink] Leituras recebidas:",
        data
    );


    // =================================================
    // PEGAR A ÚLTIMA LEITURA DE CADA MÓDULO
    // =================================================

    const latest =
        new Map();


    for (
        const row of data || []
    ) {

        const module =
            Number(
                row.modulo_alutal
            );


        if (
            !Number.isFinite(module)
        ) {

            continue;

        }


        /*
         * Como a consulta está ordenada
         * do mais novo para o mais antigo,
         * a primeira leitura encontrada
         * para cada módulo é a mais recente.
         */

        if (
            !latest.has(module)
        ) {

            latest.set(
                module,
                row
            );

        }

    }


    state.latest =
        latest;


    console.log(
        "[ThermoLink] Última leitura de cada forno:",
        state.latest
    );


    renderHome();

}


// =====================================================
// TELA INICIAL
// =====================================================

function renderHome() {

    const grid =
        $id("ovenGrid");


    /*
     * Somente módulos que estão ONLINE.
     */

    const online =
        Array.from(
            state.latest.entries()
        )

        .filter(
            ([module, row]) =>
                isOnline(row)
        )

        .sort(
            ([a], [b]) =>
                a - b
        );


    console.log(
        "[ThermoLink] Fornos online:",
        online
    );


    // contador

    const count =
        $id("onlineCount");


    if (count) {

        count.textContent =
            `${online.length} online`;

    }


    // nenhum forno

    if (
        online.length === 0
    ) {

        grid.innerHTML = `

            <div class="empty">

                Nenhum forno online no momento.

            </div>

        `;

        return;

    }


    // =================================================
    // CARDS
    // =================================================

    grid.innerHTML =

        online
            .map(
                ([module, row]) => {

                    const temp1 =
                        number(
                            row.canal_1
                        );


                    const temp2 =
                        number(
                            row.canal_2
                        );


                    return `

                        <article
                            class="oven-card"
                            data-module="${module}"
                        >

                            <div class="oven-top">

                                <div class="oven-name">

                                    Forno ${module}

                                </div>


                                <span class="status">

                                    ● Online

                                </span>

                            </div>


                            <div class="temp-row">

                                <div class="temp">

                                    ${
                                        temp1 === null
                                            ? "--"
                                            : temp1.toLocaleString(
                                                "pt-BR",
                                                {
                                                    maximumFractionDigits: 1
                                                }
                                            )
                                    }

                                    <small>
                                        °C
                                    </small>

                                </div>


                                <div
                                    style="
                                        text-align:right;
                                        font-size:9px;
                                        color:#8b8e94;
                                    "
                                >

                                    CANAL 2

                                    <br>

                                    <strong
                                        style="
                                            color:#17181b;
                                            font-size:12px;
                                        "
                                    >

                                        ${formatTemperature(temp2)}

                                    </strong>

                                </div>

                            </div>


                            <div class="oven-bottom">

                                <div class="mini">

                                    <span>
                                        Módulo
                                    </span>

                                    <strong>
                                        ${module}
                                    </strong>

                                </div>


                                <div
                                    class="mini"
                                    style="text-align:right"
                                >

                                    <span>
                                        Atualizado
                                    </span>

                                    <strong>
                                        ${formatTime(row.data_hora)}
                                    </strong>

                                </div>

                            </div>

                        </article>

                    `;

                }
            )
            .join("");


    // =================================================
    // CLIQUE NO FORNO
    // =================================================

    grid
        .querySelectorAll(
            ".oven-card"
        )
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    () => {

                        const module =
                            Number(
                                card.dataset.module
                            );

                        openOven(
                            module
                        );

                    }
                );

            }
        );

}


// =====================================================
// ABRIR FORNO
// =====================================================

async function openOven(
    module
) {

    state.selectedModule =
        module;


    const row =
        state.latest.get(
            module
        );


    if (!row) {

        return;

    }


    // esconder início

    $id("homeView")
        .classList
        .add("hidden");


    // mostrar detalhe

    $id("detailView")
        .classList
        .remove("hidden");


    window.scrollTo(
        {
            top: 0,
            behavior: "smooth"
        }
    );


    // =================================================
    // CABEÇALHO
    // =================================================

    $id("detailName")
        .textContent =
        `Forno ${module}`;


    $id("detailTemp")
        .textContent =
        formatTemperature(
            row.canal_1
        );


    // =================================================
    // PARÂMETROS
    // =================================================

    $id("pCanal1")
        .textContent =
        formatTemperature(
            row.canal_1
        );


    $id("pCanal2")
        .textContent =
        formatTemperature(
            row.canal_2
        );


    $id("pModulo")
        .textContent =
        module;


    $id("pHora")
        .textContent =
        formatTime(
            row.data_hora
        );


    // =================================================
    // HISTÓRICO
    // =================================================

    const history =
        await getHistory(
            module
        );


    renderHistory(
        history
    );


    renderChart(
        history
    );


    // =================================================
    // TEMPO DE QUEIMA
    // =================================================

    calculateBurnTime(
        history
    );

}


// =====================================================
// HISTÓRICO
// =====================================================

async function getHistory(
    module
) {

    const {
        data,
        error
    } = await sb

        .from("leituras")

        .select(
            `
            eu_id,
            dispositivo_id,
            forno_id,
            modulo_alutal,
            canal_1,
            canal_2,
            data_hora
            `
        )

        .eq(
            "modulo_alutal",
            module
        )

        .order(
            "data_hora",
            {
                ascending: true
            }
        )

        .limit(200);


    if (error) {

        console.error(
            "[ThermoLink] Erro no histórico:",
            error
        );

        return [];

    }


    console.log(
        `[ThermoLink] Histórico do forno ${module}:`,
        data
    );


    return data || [];

}


// =====================================================
// MOSTRAR HISTÓRICO NA TELA
// =====================================================

function renderHistory(
    history
) {

    const list =
        $id("historyList");


    $id("readingCount")
        .textContent =
        `${history.length} registros`;


    if (
        history.length === 0
    ) {

        list.innerHTML = `

            <div class="empty">

                Nenhuma leitura encontrada.

            </div>

        `;

        return;

    }


    /*
     * Mostrar as 15 últimas
     */

    const rows =
        history
            .slice(-15)
            .reverse();


    list.innerHTML =

        rows
            .map(
                row => `

                    <div class="history-row">

                        <span>

                            ${formatTime(
                                row.data_hora
                            )}

                        </span>


                        <strong>

                            ${formatTemperature(
                                row.canal_1
                            )}

                        </strong>


                        <span>

                            ${formatTemperature(
                                row.canal_2
                            )}

                        </span>

                    </div>

                `
            )
            .join("");

}


// =====================================================
// GRÁFICO
// =====================================================

function renderChart(
    history
) {

    if (
        state.chart
    ) {

        state.chart.destroy();

        state.chart = null;

    }


    if (
        history.length === 0
    ) {

        return;

    }


    const labels =
        history.map(
            row => {

                const date =
                    new Date(
                        row.data_hora
                    );

                return date.toLocaleTimeString(
                    "pt-BR",
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );

            }
        );


    const canal1 =
        history.map(
            row =>
                number(
                    row.canal_1
                )
        );


    const canal2 =
        history.map(
            row =>
                number(
                    row.canal_2
                )
        );


    state.chart =

        new Chart(
            $id("detailChart"),
            {

                type: "line",

                data: {

                    labels,

                    datasets: [

                        {

                            label:
                                "Temperatura 1",

                            data:
                                canal1,

                            borderColor:
                                "#ff641f",

                            backgroundColor:
                                "rgba(255,100,31,.08)",

                            borderWidth: 2,

                            tension: .3,

                            pointRadius: 0,

                            fill: true

                        },


                        {

                            label:
                                "Temperatura 2",

                            data:
                                canal2,

                            borderColor:
                                "#555",

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


                    interaction: {

                        mode: "index",

                        intersect: false

                    },


                    plugins: {

                        legend: {

                            display: true,

                            labels: {

                                boxWidth: 10,

                                font: {
                                    size: 9
                                }

                            }

                        }

                    },


                    scales: {

                        x: {

                            grid: {
                                display: false
                            },

                            ticks: {

                                maxTicksLimit: 6,

                                font: {
                                    size: 8
                                }

                            }

                        },


                        y: {

                            ticks: {

                                font: {
                                    size: 8
                                }

                            }

                        }

                    }

                }

            }
        );

}


// =====================================================
// TEMPO DE QUEIMA
// =====================================================

function calculateBurnTime(
    history
) {

    const element =
        $id("burnTime");


    /*
     * Pela estrutura que você mostrou,
     * temos temperatura e data/hora.
     *
     * Ainda não existe uma coluna
     * específica indicando:
     *
     * início da queima
     * fim da queima
     *
     * Portanto NÃO vamos inventar
     * um tempo de queima.
     */

    if (
        !history.length
    ) {

        element.textContent =
            "--";

        return;

    }


    /*
     * Por enquanto mostramos
     * o período coberto pelo histórico.
     *
     * Depois podemos transformar isso
     * em "tempo de queima" usando
     * uma regra de temperatura.
     */

    const first =
        new Date(
            history[0].data_hora
        );


    const last =
        new Date(
            history[
                history.length - 1
            ].data_hora
        );


    const milliseconds =
        last.getTime() -
        first.getTime();


    if (
        milliseconds <= 0
    ) {

        element.textContent =
            "--";

        return;

    }


    const minutes =
        Math.floor(
            milliseconds /
            60000
        );


    const hours =
        Math.floor(
            minutes / 60
        );


    const remaining =
        minutes % 60;


    if (hours > 0) {

        element.textContent =
            `${hours}h ${remaining}min`;

    } else {

        element.textContent =
            `${remaining} min`;

    }

}


// =====================================================
// VOLTAR
// =====================================================

function closeOven() {

    state.selectedModule =
        null;


    if (
        state.chart
    ) {

        state.chart.destroy();

        state.chart = null;

    }


    $id("detailView")
        .classList
        .add("hidden");


    $id("homeView")
        .classList
        .remove("hidden");


    window.scrollTo(
        {
            top: 0,
            behavior: "smooth"
        }
    );


    renderHome();

}


$id("backBtn")
    .addEventListener(
        "click",
        closeOven
    );


$id("homeNav")
    .addEventListener(
        "click",
        closeOven
    );


// =====================================================
// ATUALIZAÇÃO AUTOMÁTICA
// =====================================================

setInterval(
    async () => {

        await loadReadings();

        /*
         * Se estiver dentro de um forno,
         * atualiza os dados dele.
         */

        if (
            state.selectedModule !== null
        ) {

            const row =
                state.latest.get(
                    state.selectedModule
                );


            if (
                !row ||
                !isOnline(row)
            ) {

                closeOven();

            }

        }

    },
    12000
);


// =====================================================
// INICIAR
// =====================================================

async function init() {

    console.log(
        "🔥 ThermoLink iniciando..."
    );


    await loadReadings();


    console.log(
        "✅ ThermoLink conectado ao Supabase."
    );

}


init();
