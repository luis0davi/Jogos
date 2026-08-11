const state = {
  apiUrl: localStorage.getItem("mf_api_url") || "",
  selected: null,
  ovens: [
    {id:"forno1", name:"Forno 1", temp:1280, target:1300, status:"Em operação", mode:"running", updated:10, min:1100, max:1290},
    {id:"forno2", name:"Forno 2", temp:860, target:1200, status:"Aquecendo", mode:"running", updated:10, min:30, max:860},
    {id:"forno3", name:"Forno 3", temp:32, target:1200, status:"Inativo", mode:"off", updated:60, min:28, max:40}
  ],
  alerts: [
    {type:"high", title:"Forno 1 — Temperatura alta", detail:"Temperatura próxima do limite configurado.", time:"Hoje • 12:30"},
    {type:"warn", title:"Forno 2 — Conexão instável", detail:"Verifique a conexão do dispositivo.", time:"Hoje • 11:15"},
    {type:"info", title:"Forno 3 — Operação concluída", detail:"Ciclo finalizado com sucesso.", time:"Ontem • 09:45"}
  ]
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function fmt(n){ return Math.round(n).toLocaleString("pt-BR"); }
function spark(seed=1, n=22){
  let y=40+seed*3, pts=[];
  for(let i=0;i<n;i++){ y += (Math.random()-.35)*7; y=Math.max(10,Math.min(65,y)); pts.push([i/(n-1)*100,y]); }
  return pts.map(p=>p.join(",")).join(" ");
}
function chartSVG(oven, big=false){
  const pts=[]; let y=big?220:40;
  for(let i=0;i<32;i++){ y += (Math.random()-.42)*(big?18:6); y=Math.max(big?35:10,Math.min(big?250:65,y)); pts.push(`${i/(31)*100},${y}`); }
  return `<svg viewBox="0 0 100 ${big?280:75}" preserveAspectRatio="none">
    <polyline points="${pts.join(" ")}" fill="none" stroke="#ff7d20" stroke-width="${big?2:2}" vector-effect="non-scaling-stroke"/>
    ${big?'<line x1="0" y1="255" x2="100" y2="255" stroke="#dce3e8"/><line x1="0" y1="140" x2="100" y2="140" stroke="#eef1f3"/><line x1="0" y1="25" x2="100" y2="25" stroke="#eef1f3"/>':''}
  </svg>`;
}
function renderDashboard(){
  const running=state.ovens.filter(o=>o.mode==="running").length;
  const avg=state.ovens.reduce((a,o)=>a+o.temp,0)/state.ovens.length;
  $("#stat-running").textContent=running;
  $("#stat-avg").textContent=fmt(avg)+"°C";
  $("#stat-alerts").textContent=state.alerts.length;
  $("#oven-grid").innerHTML=state.ovens.map(o=>`
    <article class="oven-card" data-oven="${o.id}">
      <div class="oven-head"><span class="oven-name">${o.name}</span><span class="status ${o.mode==='off'?'off':''} ${o.mode==='warn'?'warn':''}">${o.status}</span></div>
      <div class="temp">${fmt(o.temp)}<small>°C</small></div>
      <div class="mini-chart">${chartSVG(o)}</div>
      <div class="oven-meta"><span>Meta: ${fmt(o.target)}°C</span><span>há ${o.updated}s</span></div>
    </article>`).join("");
  $$(".oven-card").forEach(el=>el.onclick=()=>openDetail(el.dataset.oven));
}
function openDetail(id){
  state.selected=id;
  const o=state.ovens.find(x=>x.id===id);
  const pct=Math.max(0,Math.min(100,o.temp/o.target*100));
  $("#detail-content").innerHTML=`
    <div class="detail-header"><div><p class="eyebrow">${o.status.toUpperCase()}</p><h2>${o.name}</h2><p>Monitoramento em tempo real</p></div><button class="secondary">⚙ Configurar</button></div>
    <div class="detail-grid">
      <div class="panel">
        <div class="detail-temp">${fmt(o.temp)}<small>°C</small></div>
        <div class="tabs"><button class="tab active">Tempo real</button><button class="tab">Gráfico</button><button class="tab">Histórico</button></div>
        <div class="chart-box">${chartSVG(o,true)}</div>
      </div>
      <div class="panel">
        <div class="gauge"><div class="gauge-ring" style="--pct:${pct}%"><div class="gauge-inner"><div><strong>${Math.round(pct)}%</strong><small>da meta</small></div></div></div></div>
        <div class="detail-stats">
          <div class="small-stat"><span>Meta</span><b>${fmt(o.target)}°C</b></div>
          <div class="small-stat"><span>Atualização</span><b>10s</b></div>
          <div class="small-stat"><span>Mínima</span><b>${fmt(o.min)}°C</b></div>
          <div class="small-stat"><span>Máxima</span><b>${fmt(o.max)}°C</b></div>
        </div>
      </div>
    </div>`;
  showScreen("detail","Forno");
}
function renderHistory(){
  $("#history-oven").innerHTML=state.ovens.map(o=>`<option value="${o.id}">${o.name}</option>`).join("");
  $("#history-table").innerHTML=`
    <div class="history-row header"><span>Data</span><span>Máxima</span><span>Média</span><span>Tempo</span></div>
    ${[0,1,2,3,4,5].map(i=>`<div class="history-row"><span>${String(11-i).padStart(2,"0")}/08/2026</span><b>${fmt(1290-i*18)}°C</b><span>${fmt(850-i*22)}°C</span><span>04:${25-i}:30</span></div>`).join("")}`;
}
function renderAlerts(){
  $("#alerts-list").innerHTML=state.alerts.map(a=>`<div class="alert ${a.type==='high'?'high':''}"><b>${a.type==='high'?'🔴':a.type==='warn'?'🟠':'🔵'} ${a.title}</b><div>${a.detail}</div><small>${a.time}</small></div>`).join("");
}
function showScreen(name,title){
  $$(".screen").forEach(s=>s.classList.remove("active"));
  $("#screen-"+name).classList.add("active");
  $("#page-title").textContent=title;
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===name));
  if(name==="history") renderHistory();
  if(name==="alerts") renderAlerts();
}
$$(".nav-btn").forEach(btn=>btn.onclick=()=>showScreen(btn.dataset.screen, btn.textContent.trim()));
$("#back-dashboard").onclick=()=>showScreen("dashboard","Meus Fornos");
$("#refresh-btn").onclick=()=>simulate(false);
$("#simulate-btn").onclick=()=>simulate(true);
function simulate(showMsg=true){
  state.ovens.forEach(o=>{ if(o.mode==="running") o.temp=Math.max(0,Math.min(1600,o.temp+(Math.random()*34-8))); o.updated=10; });
  renderDashboard(); if(state.selected) openDetail(state.selected);
  $("#last-update").textContent="Atualizado agora";
  if(showMsg) alert("Leitura simulada atualizada.");
}
$("#add-oven-btn").onclick=()=>$("#modal").classList.remove("hidden");
$("#close-modal").onclick=()=>$("#modal").classList.add("hidden");
$("#create-oven").onclick=()=>{
  const name=$("#new-name").value.trim()||`Forno ${state.ovens.length+1}`;
  const target=Number($("#new-target").value)||1200;
  state.ovens.push({id:"f"+Date.now(),name,temp:25,target,status:"Inativo",mode:"off",updated:1,min:25,max:25});
  $("#modal").classList.add("hidden"); $("#new-name").value=""; $("#new-target").value=""; renderDashboard();
};
$("#api-url").value=state.apiUrl;
$("#save-api").onclick=()=>{state.apiUrl=$("#api-url").value.trim();localStorage.setItem("mf_api_url",state.apiUrl);alert("Conexão salva. O próximo passo é apontar o ESP8266 para o endpoint.");};

async function loadFromApi(){
  if(!state.apiUrl) return;
  try{
    const r=await fetch(state.apiUrl+"?action=latest");
    const data=await r.json();
    if(Array.isArray(data)) data.forEach(d=>{
      const o=state.ovens.find(x=>x.id===d.id || x.name===d.nome);
      if(o && Number.isFinite(Number(d.temperatura))) o.temp=Number(d.temperatura);
    });
    renderDashboard();
  }catch(e){ console.warn("API indisponível; mantendo protótipo local.",e); }
}
renderDashboard(); renderAlerts(); loadFromApi(); setInterval(()=>{ if(state.apiUrl) loadFromApi(); },10000);
