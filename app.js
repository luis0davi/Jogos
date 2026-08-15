const SUPABASE_URL="https://zawnluboujbovpgrgdcx.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_gJiVQXVjiuSPY3vHt2f8OA_CiES-4Ak";
const {createClient}=window.supabase;
const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const state={ovens:[],readings:new Map(),filtered:[],selectedModule:null,charts:{history:null,modal:null},realtime:null};

const $=id=>document.getElementById(id);
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const temp=v=>{const n=num(v);return n===null?"--":`${n.toLocaleString("pt-BR",{maximumFractionDigits:1})} °C`};
const time=v=>{if(!v)return"--";const d=new Date(v);return Number.isNaN(d.getTime())?"--":d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})};
const age=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?Infinity:Date.now()-d.getTime()};
const online=r=>r&&age(r.created_at)<=3*60*1000; // CORREÇÃO: data_hora -> created_at
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"'"}[c]));
function ovenName(m){const o=state.ovens.find(x=>Number(x.numero)===Number(m));return o?.nome||`Forno ${String(m).padStart(2,"0")}`}

function setConnection(ok,text){if($("connectionText"))$("connectionText").textContent=text;const d=document.querySelector(".connection .dot");if(d)d.className="dot "+(ok===true?"ok":ok===false?"bad":"")}
async function loadCompany(){try{const{data,error}=await sb.from("empresas").select("id,nome,ativo").eq("ativo",true).order("id").limit(1);if(!error&&data?.[0]){if($("companyName"))$("companyName").textContent=data[0].nome;if($("companyNameTop"))$("companyNameTop").textContent=data[0].nome}}catch(e){console.warn("Tabela empresas ausente.")}}

async function loadOvens(){
  try{
    const{data,error}=await sb.from("fornos").select("id,dispositivo_id,numero,nome,ativo").eq("ativo",true).order("numero",{ascending:true});
    if(error||!data||!data.length)throw new Error();
    state.ovens=data;
  }catch(e){
    // CORREÇÃO CRÍTICA: Fallback de contingência caso a tabela 'fornos' esteja vazia/inexistente
    state.ovens=[];
    for(let i=1;i<=31;i++){
      state.ovens.push({id:i,numero:i,nome:`Forno ${String(i).padStart(2,"0")}`,ativo:true});
    }
  }
}

async function loadLatest(){
  // CORREÇÃO: Alinhamento das colunas conforme gravação real do ESP8266
  const{data,error}=await sb.from("leituras").select("id,dispositivo_id,forno_id,modulo_alutal,canal_1,canal_2,created_at").order("created_at",{ascending:false}).limit(1000);
  if(error){setConnection(false,"Erro na telemetria");throw error;}
  setConnection(true,"ThermoLink Conectado");
  const m=new Map();
  for(const r of data||[]){
    const mod=Number(r.modulo_alutal); // CORREÇÃO: módulo_atual -> modulo_alutal
    if(Number.isFinite(mod)&&!m.has(mod))m.set(mod,r);
  }
  state.readings=m;
  render();
}

function render(){
  const searchIn=$("searchInput");const q=searchIn?searchIn.value.trim().toLowerCase():"";
  state.filtered=state.ovens.filter(o=>!q||(o.nome||"").toLowerCase().includes(q)||String(o.numero).includes(q));
  if($("totalFornos"))$("totalFornos").textContent=state.ovens.length;
  let on=0;state.ovens.forEach(o=>{if(online(state.readings.get(Number(o.numero))))on++});
  if($("activeFornos"))$("activeFornos").textContent=on;
  if($("offlineFornos"))$("offlineFornos").textContent=Math.max(0,state.ovens.length-on);
  renderGrid();renderTable();renderSelect();
  const newest=[...state.readings.values()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
  if($("lastUpdate"))$("lastUpdate").textContent=newest?`Atualizado ${time(newest.created_at)}`:"Aguardando dados...";
}

function renderGrid(){
  const g=$("ovenGrid");if(!g)return;
  if(!state.filtered.length){g.innerHTML='<div class="loading-card"><p>Nenhum forno encontrado.</p></div>';return}
  g.innerHTML=state.filtered.map(o=>{const mod=Number(o.numero),r=state.readings.get(mod),ok=online(r);return `<article class="oven-card" data-module="${mod}"><div class="oven-head"><div class="oven-name">${escapeHtml(o.nome||ovenName(mod))}</div><span class="status ${ok?"online":"offline"}">${ok?"● Online":"● Offline"}</span></div><div class="oven-main"><div><div class="temperature">${temp(r?.canal_1)}</div><div class="temp-caption">Canal 1 • Módulo ${mod}</div></div><div class="mini-chart"><canvas id="mini-${mod}"></canvas></div></div><div class="oven-footer"><div class="mini-metric"><span>Canal 2</span><strong>${r?.canal_2!==undefined&&r?.canal_2!==null?r.canal_2+" °C":"--"}</strong></div><div class="mini-metric" style="text-align:right"><span>Última leitura</span><strong>${time(r?.created_at)}</strong></div></div></article>`}).join("");
  g.querySelectorAll(".oven-card").forEach(c=>c.onclick=()=>openOven(Number(c.dataset.module)));
  state.filtered.forEach(o=>drawMini(Number(o.numero)));
}

async function drawMini(module){const canvas=$(`mini-${module}`);if(!canvas)return;const rows=await getHistory(module,35);const vals=rows.map(r=>num(r.canal_1)).filter(v=>v!==null);if(!vals.length)return;new Chart(canvas,{type:"line",data:{labels:vals.map(()=>""),datasets:[{data:vals,borderColor:"#f97316",borderWidth:2,tension:.35,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false}}}})}

function renderTable(){
  const wrap=$("ovensTableWrap");if(!wrap)return;
  wrap.innerHTML=`<table><thead><tr><th>Forno</th><th>Módulo</th><th>Canal 1</th><th>Canal 2</th><th>Status</th><th>Última leitura</th></tr></thead><tbody>${state.ovens.map(o=>{const r=state.readings.get(Number(o.numero)),ok=online(r);return `<tr><td><b>${escapeHtml(o.nome||ovenName(o.numero))}</b></td><td>${o.numero}</td><td>${temp(r?.canal_1)}</td><td>${r?.canal_2??"--"}</td><td><span class="status ${ok?"online":"offline"}">${ok?"● Online":"● Offline"}</span></td><td>${time(r?.created_at)}</td></tr>`}).join("")}</tbody></table>`;
}

function renderSelect(){const s=$("historySelect");if(!s)return;const old=s.value;s.innerHTML=state.ovens.map(o=>`<option value="${o.numero}">${escapeHtml(o.nome||ovenName(o.numero))}</option>`).join("");if(old)s.value=old}

async function getHistory(module,limit=120){
  // CORREÇÃO: módulo_atual -> modulo_alutal e data_hora -> created_at
  const {data,error}=await sb.from("leituras").select("canal_1,canal_2,modulo_alutal,created_at").eq("modulo_alutal",module).order("created_at",{ascending:false}).limit(limit);
  if(error){console.error(error);return[]}return(data||[]).reverse();
}

function chartOptions(){return{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:7,font:{size:9}}},y:{grid:{color:"#edf0f4"},ticks:{font:{size:9}}}}}}

async function drawHistory(module){const rows=await getHistory(module);$("historyCurrent").textContent=temp(rows.at(-1)?.canal_1);$("historyRange").textContent=rows.length?`${time(rows[0].created_at)} → ${time(rows.at(-1).created_at)}`:"Sem dados";if(state.charts.history)state.charts.history.destroy();state.charts.history=new Chart($("historyChart"),{type:"line",data:{labels:rows.map(r=>new Date(r.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})),datasets:[{data:rows.map(r=>num(r.canal_1)),borderColor:"#f97316",backgroundColor:"rgba(249,115,22,.08)",borderWidth:2,tension:.3,pointRadius:0,fill:true}]},options:chartOptions()})}

async function openOven(module){
  state.selectedModule=module;const r=state.readings.get(module),ok=online(r);
  $("modalOvenName").textContent=ovenName(module);$("modalTemperature").textContent=temp(r?.canal_1);$("liveTemp").textContent=temp(r?.canal_1);
  $("modalCanal1").textContent=r?.canal_1??"--";$("modalCanal2").textContent=r?.canal_2??"--";$("modalModule").textContent=module;
  $("modalTime").textContent=time(r?.created_at);$("modalStatus").className=`status ${ok?"online":"offline"}`;
  $("modalStatus").textContent=ok?"● Online":"● Offline";$("modalStatusText").textContent=ok?"Online":"Offline";
  $("ovenModal").classList.remove("hidden");activateTab("tempo");
  const rows=await getHistory(module);
  if(state.charts.modal)state.charts.modal.destroy();
  state.charts.modal=new Chart($("modalChart"),{type:"line",data:{labels:rows.map(r=>new Date(r.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})),datasets:[{data:rows.map(r=>num(r.canal_1)),borderColor:"#f97316",borderWidth:2,tension:.3,pointRadius:0,fill:true,backgroundColor:"rgba(249,115,22,.08)"}]},options:chartOptions()});
  $("detailHistoryList").innerHTML=rows.slice(-12).reverse().map(r=>`<div class="history-row"><span>${time(r.created_at)}</span><strong>${temp(r.canal_1)}</strong></div>`).join("");
}

function closeModal(){$("ovenModal").classList.add("hidden");if(state.charts.modal){state.charts.modal.destroy();state.charts.modal=null}}
function activateTab(name){document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));document.querySelectorAll(".detail-panel").forEach(p=>p.classList.remove("active"));$(`panel${name[0].toUpperCase()+name.slice(1)}`).classList.add("active")}

// EVENTO DE INICIALIZAÇÃO FIXADO
document.addEventListener("DOMContentLoaded",async()=>{
  setConnection(null,"Conectando ao ThermoLink...");
  await loadCompany();
  await loadOvens();
  await loadLatest();
  // Loop de atualização constante a cada 12 segundos
  setInterval(loadLatest,12000);
});
