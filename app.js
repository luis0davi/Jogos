// ======================================================
// THERMOLINK
// Interface simples para monitoramento dos fornos
//
// BASEADO NO app.js QUE JÁ ESTAVA FUNCIONANDO
// ======================================================


// ======================================================
// SUPABASE
// ======================================================

const SUPABASE_URL =
    "https://zawnluboujbovpgrgdcx.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";


const {
    createClient
} = window.supabase;


const sb =
    createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );


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

const $ = id =>
    document.getElementById(id);


function numberValue(value) {

    return Number.isFinite(
        Number(value)
    )
        ? Number(value)
        : null;

}


function temperature(value) {

    const number =
        numberValue(value);


    if (number === null) {

        return "-- °C";

    }


    return `${number.toLocaleString(
        "pt-BR",
        {
            maximumFractionDigits: 1
        }
    )} °C`;

}


function time(value) {

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


// ======================================================
// QUANDO CONSIDERAR UM FORNO ONLINE
//
// Se não receber leitura durante 3 minutos,
// ele desaparece da tela inicial.
// ======================================================

function isOnline(reading) {

    if (
        !reading ||
        !reading.created_at
    ) {

        return false;

    }


    const date =
        new Date(
            reading.created_at
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


    return difference <=
        3 * 60 * 1000;

}


// ======================================================
// NOME DO FORNO
// ======================================================

function ovenName(module) {

    const oven =
        state.ovens.find(
            item =>
                Number(item.numero) ===
                Number(module)
        );


    if (
        oven &&
        oven.nome
    ) {

        return oven.nome;

    }


    return `Forno ${
        String(module).padStart(2, "0")
    }`;

}


// ======================================================
// CARREGAR FORNOS
// ======================================================

async function loadOvens() {

    const {
        data,
        error
    } = await sb

        .from("fornos")

        .select(
            `
            id,
            dispositivo_id,
            numero,
            nome,
            ativo
            `
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


    if (
        error ||
        !data ||
        !data.length
    ) {

        console.warn(
            "[ThermoLink] Não foi possível carregar a tabela fornos."
        );


        /*
         * Fallback:
         * módulos 1 até 31.
         *
         * As temperaturas continuam
         * vindo da tabela leituras.
         */

        state.ovens =
            Array.from(
                {
                    length: 31
                },
                (_, index) => ({

                    id: index + 1,

                    numero: index + 1,

                    nome:
                        `Forno ${
                            String(index + 1)
                                .padStart(2, "0")
                        }`,

                    ativo: true

                })
            );


        return;

    }


    state.ovens =
        data;

}


// ======================================================
// PEGAR ÚLTIMA LEITURA DE CADA FORNO
// ======================================================

async function loadLatest() {

    const {
        data,
        error
    } = await sb

        .from("leituras")

        .select(
            `
            id,
            dispositivo_id,
            forno_id,
            modulo_alutal,
            canal_1,
            canal_2,
            created_at
            `
        )

        .order(
            "created_at",
            {
                ascending: false
            }
        )

        .limit(1000);


    if (error) {

        console.error(
            "[ThermoLink] Erro ao carregar leituras:",
            error
        );

        return;

    }


    const latest =
        new Map();


    /*
     * Como as leituras vêm
     * da mais nova para a mais antiga,
     * a primeira de cada módulo
     * é a mais recente.
     */

    for (
        const reading
        of data || []
    ) {

        const module =
            Number(
                reading.modulo_alutal
            );


        if (
            Number.isFinite(module) &&
            !latest.has(module)
        ) {

            latest.set(
                module,
                reading
            );

        }

    }


    state.readings =
        latest;


    renderHome();


    /*
     * Se o usuário estiver
     * dentro de um forno,
     * atualiza os dados.
     */

    if (
        state.selectedModule !== null
    ) {

        updateDetail(
            state.selectedModule
        );

    }

}


// ======================================================
// TELA INICIAL
//
// SOMENTE FORNOS ONLINE
// ======================================================

function renderHome() {

    /*
     * Limpa gráficos antigos
     */

    state.miniCharts
        .forEach(
            chart =>
                chart.destroy()
        );


    state.miniCharts = [];


    /*
     * Filtra somente os fornos online.
     */

    const onlineOvens =
        state.ovens.filter(
            oven =>
                isOnline(
                    state.readings.get(
                        Number(
                            oven.numero
                        )
                    )
                )
        );


    /*
     * Atualiza contador
     */

    $("onlineCount")
        .textContent =
        `${onlineOvens.length} online`;


    const grid =
        $("ovenGrid");


    /*
     * Nenhum forno online
     */

    if (
        !onlineOvens.length
    ) {

        grid.innerHTML = `
            <div class="empty">
                Nenhum forno online no momento.
            </div>
        `;

        return;

    }


    /*
     * Cria os cards
     */

    grid.innerHTML =
        onlineOvens
            .map(
                oven => {

                    const module =
                        Number(
                            oven.numero
                        );


                    const reading =
                        state.readings.get(
                            module
                        );


                    const temp1 =
                        numberValue(
                            reading?.canal_1
                        );


                    const temp1Text =
                        temp1 === null
                            ? "--"
                            : temp1.toLocaleString(
                                "pt-BR",
                                {
                                    maximumFractionDigits: 1
                                }
                            );


                    return `

                    <article
                        class="oven-card"
                        data-module="${module}"
                    >

                        <div class="oven-top">

                            <div class="oven-name">

                                ${
                                    oven.nome ||
                                    ovenName(module)
                                }

                            </div>


                            <span class="status">

                                ● Online

                            </span>

                        </div>


                        <div class="temp-row">

                            <div class="temp">

                                ${temp1Text}

                                <small>
                                    °C
                                </small>

                            </div>


                            <div class="trend">

                                <canvas
                                    id="mini-${module}"
                                ></canvas>

                            </div>

                        </div>


                        <div class="oven-bottom">

                            <div class="mini">

                                <span>
                                    Temperatura 2
                                </span>

                                <strong>
                                    ${
                                        temperature(
                                            reading?.canal_2
                                        )
                                    }
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
                                    ${
                                        time(
                                            reading?.created_at
                                        )
                                    }
                                </strong>

                            </div>

                        </div>

                    </article>

                    `;

                }
            )
            .join("");


    /*
     * Clique no forno
     */

    grid
        .querySelectorAll(
            ".oven-card"
        )
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    () => {

                        openDetail(
                            Number(
                                card.dataset.module
                            )
                        );

                    }
                );

            }
        );


    /*
     * Gráficos pequenos
     */

    onlineOvens.forEach(
        oven => {

            drawMiniChart(
                Number(
                    oven.numero
                )
            );

        }
    );

}


// ======================================================
// HISTÓRICO DO FORNO
// ======================================================

async function getHistory(
    module,
    limit = 120
) {

    const {
        data,
        error
    } = await sb

        .from("leituras")

        .select(
            `
            canal_1,
            canal_2,
            modulo_alutal,
            created_at
            `
        )

        .eq(
            "modulo_alutal",
            module
        )

        .order(
            "created_at",
            {
                ascending: false
            }
        )

        .limit(
            limit
        );


    if (error) {

        console.error(
            "[ThermoLink] Erro no histórico:",
            error
        );

        return [];

    }


    /*
     * O banco retorna
     * mais novo -> antigo.
     *
     * Aqui deixamos
     * antigo -> novo.
     */

    return (
        data || []
    ).reverse();

}


// ======================================================
// MINI GRÁFICO DOS CARDS
// ======================================================

async function drawMiniChart(
    module
) {

    const canvas =
        $(`mini-${module}`);


    if (!canvas) {

        return;

    }


    const rows =
        await getHistory(
            module,
            30
        );


    const values =
        rows

            .map(
                row =>
                    numberValue(
                        row.canal_1
                    )
            )

            .filter(
                value =>
                    value !== null
            );


    if (!values.length) {

        return;

    }


    const chart =
        new Chart(
            canvas,
            {

                type: "line",

                data: {

                    labels:
                        values.map(
                            () => ""
                        ),

                    datasets: [

                        {

                            data: values,

                            borderColor:
                                "#ff641f",

                            borderWidth: 2,

                            tension: .35,

                            pointRadius: 0,

                            fill: false

                        }

                    ]

                },


                options: {

                    responsive: true,

                    maintainAspectRatio:
                        false,

                    plugins: {

                        legend: {
                            display: false
                        },

                        tooltip: {
                            enabled: false
                        }

                    },


                    scales: {

                        x: {
                            display: false
                        },

                        y: {
                            display: false
                        }

                    }

                }

            }
        );


    state.miniCharts.push(
        chart
    );

}


// ======================================================
// ABRIR FORNO
// ======================================================

async function openDetail(
    module
) {

    state.selectedModule =
        module;


    $("homeView")
        .classList
        .add("hidden");


    $("detailView")
        .classList
        .remove("hidden");


    window.scrollTo(
        {
            top: 0,
            behavior: "smooth"
        }
    );


    /*
     * Nome
     */

    $("detailName")
        .textContent =
        ovenName(
            module
        );


    /*
     * Última leitura
     */

    const reading =
        state.readings.get(
            module
        );


    $("detailTemp")
        .textContent =
        temperature(
            reading?.canal_1
        );


    $("pCanal1")
        .textContent =
        temperature(
            reading?.canal_1
        );


    $("pCanal2")
        .textContent =
        temperature(
            reading?.canal_2
        );


    $("pModulo")
        .textContent =
        module;


    $("pHora")
        .textContent =
        time(
            reading?.created_at
        );


    /*
     * Histórico
     */

    const rows =
        await getHistory(
            module,
            120
        );


    $("readingCount")
        .textContent =
        `${rows.length} registros`;


    /*
     * Lista de últimas leituras
     */

    if (!rows.length) {

        $("historyList")
            .innerHTML = `
                <div class="empty">
                    Nenhuma leitura histórica.
                </div>
            `;

    } else {

        $("historyList")
            .innerHTML =

            rows
                .slice(-15)
                .reverse()
                .map(
                    row => `

                    <div class="history-row">

                        <span>
                            ${
                                time(
                                    row.created_at
                                )
                            }
                        </span>

                        <strong>
                            ${
                                temperature(
                                    row.canal_1
                                )
                            }
                        </strong>

                        <span>
                            ${
                                temperature(
                                    row.canal_2
                                )
                            }
                        </span>

                    </div>

                    `
                )
                .join("");

    }


    /*
     * Destrói gráfico anterior
     */

    if (
        state.chart
    ) {

        state.chart.destroy();

        state.chart =
            null;

    }


    /*
     * Sem histórico
     */

    if (!rows.length) {

        return;

    }


    /*
     * Gráfico principal
     */

    state.chart =

        new Chart(
            $("detailChart"),
            {

                type: "line",

                data: {

                    labels:

                        rows.map(
                            row =>

                                new Date(
                                    row.created_at
                                )
                                    .toLocaleTimeString(
                                        "pt-BR",
                                        {
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        }
                                    )
                        ),


                    datasets: [

                        {

                            data:

                                rows.map(
                                    row =>
                                        numberValue(
                                            row.canal_1
                                        )
                                ),

                            borderColor:
                                "#ff641f",

                            backgroundColor:
                                "rgba(255,100,31,.08)",

                            borderWidth: 2,

                            tension: .3,

                            pointRadius: 0,

                            fill: true

                        }

                    ]

                },


                options: {

                    responsive: true,

                    maintainAspectRatio:
                        false,

                    interaction: {

                        mode: "index",

                        intersect: false

                    },


                    plugins: {

                        legend: {
                            display: false
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

                            grid: {

                                color:
                                    "#eeeeee"

                            },

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


    /*
     * IMPORTANTE:
     *
     * O seu app.js original não possui
     * uma coluna de início/fim/duração
     * da queima.
     *
     * Por isso não inventamos um valor.
     */

    $("burnTime")
        .textContent =
        "--";

}


// ======================================================
// ATUALIZAR FORNO ABERTO
// ======================================================

function updateDetail(
    module
) {

    const reading =
        state.readings.get(
            module
        );


    /*
     * Se ficou offline,
     * volta para a Home.
     */

    if (
        !isOnline(
            reading
        )
    ) {

        closeDetail();

        return;

    }


    $("detailTemp")
        .textContent =
        temperature(
            reading.canal_1
        );


    $("pCanal1")
        .textContent =
        temperature(
            reading.canal_1
        );


    $("pCanal2")
        .textContent =
        temperature(
            reading.canal_2
        );


    $("pHora")
        .textContent =
        time(
            reading.created_at
        );

}


// ======================================================
// VOLTAR PARA INÍCIO
// ======================================================

function closeDetail() {

    state.selectedModule =
        null;


    if (
        state.chart
    ) {

        state.chart.destroy();

        state.chart =
            null;

    }


    $("detailView")
        .classList
        .add("hidden");


    $("homeView")
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


// ======================================================
// BOTÕES
// ======================================================

$("backBtn")
    .onclick =
    closeDetail;


$("homeNav")
    .onclick =
    closeDetail;


// ======================================================
// ATUALIZAÇÃO AUTOMÁTICA
//
// A cada 12 segundos consulta o Supabase.
// ======================================================

setInterval(
    loadLatest,
    12000
);


// ======================================================
// INICIAR
// ======================================================

async function init() {

    try {

        await loadOvens();

        await loadLatest();


        console.log(
            "[ThermoLink] Interface carregada."
        );


    } catch (error) {

        console.error(
            "[ThermoLink] Erro:",
            error
        );


        $("ovenGrid")
            .innerHTML = `

                <div class="empty">

                    Não foi possível
                    carregar os fornos.

                </div>

            `;

    }

}


init();
