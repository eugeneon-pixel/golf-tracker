
const CLUBS = ["","Driver","3W","5W","7W","2i","3i","4i","5i","6i","7i","8i","9i","PW","GW","50°","52°","54°","56°","58°","60°","Putter","Other"];
const $ = id => document.getElementById(id);
let state = { holes: 9, current: 1, round: null, lastSavedId: null };

function uid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function today(){ return new Date().toISOString().slice(0,10); }
function getRounds(){ return JSON.parse(localStorage.getItem("golfRounds") || "[]"); }
function setRounds(v){ localStorage.setItem("golfRounds", JSON.stringify(v)); }
function settings(){ return JSON.parse(localStorage.getItem("golfSettings") || "{}"); }

function show(view){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(view).classList.add("active");
  window.scrollTo({top:0,behavior:"instant"});
}
function populateClubs(){
  ["teeClub","approachClub"].forEach(id => $(id).innerHTML = CLUBS.map(c=>`<option>${c}</option>`).join(""));
}
function blankHole(n){ return {hole:n,par:4,score:"",penalty:0,teeClub:"",fairway:"",teeQuality:"",approachYds:"",approachClub:"",gir:"",approachMiss:"",firstPutt:"",putts:"",scramble:"",notes:""}; }

function startRound(holes){
  state.holes = holes; state.current = 1;
  state.round = {
    id:uid(), createdAt:new Date().toISOString(), date:today(), course:"",
    holesCount:holes, roundPar:holes===9?36:72, synced:false,
    holesData:Array.from({length:holes},(_,i)=>blankHole(i+1))
  };
  $("roundDate").value = state.round.date; $("course").value=""; $("holesCount").value=holes; $("roundPar").value=state.round.roundPar;
  loadHole(1); show("roundView");
}
function readRoundHeader(){
  state.round.date=$("roundDate").value; state.round.course=$("course").value.trim();
  state.round.roundPar=Number($("roundPar").value)||0;
}
function selectedSegment(target){
  const el=document.querySelector(`.segmented[data-target="${target}"] button.active`);
  return el ? el.dataset.value : "";
}
function setSegment(target,val){
  document.querySelectorAll(`.segmented[data-target="${target}"] button`).forEach(b=>b.classList.toggle("active",b.dataset.value===val));
}
function saveCurrentHole(){
  readRoundHeader();
  const h=state.round.holesData[state.current-1];
  h.par=Number($("par").value)||0; h.score=Number($("score").value)||"";
  h.penalty=Number($("penalty").value)||0; h.teeClub=$("teeClub").value;
  h.fairway=selectedSegment("fairway"); h.teeQuality=selectedSegment("teeQuality");
  h.approachYds=Number($("approachYds").value)||""; h.approachClub=$("approachClub").value;
  h.gir=selectedSegment("gir"); h.approachMiss=$("approachMiss").value;
  h.firstPutt=$("firstPutt").value===""?"":Number($("firstPutt").value);
  h.putts=$("putts").value===""?"":Number($("putts").value);
  h.scramble=$("scramble").value; h.notes=$("notes").value.trim();
  localStorage.setItem("golfDraft",JSON.stringify(state.round));
}
function loadHole(n){
  state.current=n; $("holeNumber").textContent=n;
  const h=state.round.holesData[n-1];
  $("par").value=h.par; $("score").value=h.score; $("penalty").value=h.penalty;
  $("teeClub").value=h.teeClub; setSegment("fairway",h.fairway); setSegment("teeQuality",h.teeQuality);
  $("approachYds").value=h.approachYds; $("approachClub").value=h.approachClub;
  setSegment("gir",h.gir); $("approachMiss").value=h.approachMiss; $("firstPutt").value=h.firstPutt;
  $("putts").value=h.putts; $("scramble").value=h.scramble; $("notes").value=h.notes;
  $("prevHole").disabled=n===1; $("nextHole").disabled=n===state.holes;
}
function summary(round){
  const hs=round.holesData;
  const score=hs.reduce((a,h)=>a+(Number(h.score)||0),0);
  const par=hs.reduce((a,h)=>a+(Number(h.par)||0),0);
  const fwOpp=hs.filter(h=>Number(h.par)>3).length;
  const fw=hs.filter(h=>h.fairway==="Hit").length;
  const fwL=hs.filter(h=>h.fairway==="L").length, fwR=hs.filter(h=>h.fairway==="R").length;
  const gir=hs.filter(h=>h.gir==="Hit").length;
  const putts=hs.reduce((a,h)=>a+(Number(h.putts)||0),0);
  const three=hs.filter(h=>Number(h.putts)>=3).length;
  const pens=hs.reduce((a,h)=>a+(Number(h.penalty)||0),0);
  const scrambleOpp=hs.filter(h=>h.scramble==="Yes"||h.scramble==="No").length;
  const scrambleMade=hs.filter(h=>h.scramble==="Yes").length;
  const misses={Left:0,Right:0,Short:0,Long:0};
  hs.forEach(h=>{
    if(!h.approachMiss || h.approachMiss==="Hit") return;
    if(h.approachMiss.includes("Left")) misses.Left++;
    if(h.approachMiss.includes("Right")) misses.Right++;
    if(h.approachMiss.includes("Short")) misses.Short++;
    if(h.approachMiss.includes("Long")) misses.Long++;
  });
  return {
    score, par, toPar:score-par, fairways:fw, fwOpp, fwPct:fwOpp?fw/fwOpp:0, fwL, fwR,
    gir, girPct:gir/round.holesCount, putts, threePutts:three, penalties:pens,
    scrambleMade,scrambleOpp,scramblePct:scrambleOpp?scrambleMade/scrambleOpp:0,
    missLeft:misses.Left,missRight:misses.Right,missShort:misses.Short,missLong:misses.Long
  };
}
function finishRound(){
  saveCurrentHole();
  const s=summary(state.round);
  state.round.summary=s;
  let rounds=getRounds(); rounds.unshift(state.round); setRounds(rounds);
  localStorage.removeItem("golfDraft"); state.lastSavedId=state.round.id;
  renderSummary(state.round); renderHome(); show("summaryView");
}
function renderSummary(round){
  const s=round.summary||summary(round);
  $("summaryCourse").textContent=`${round.course||"Course not entered"} • ${round.holesCount} holes • ${round.date}`;
  const vals=[
    ["Score",`${s.score} (${s.toPar>=0?"+":""}${s.toPar})`],
    ["Fairways",`${s.fairways}/${s.fwOpp} • ${Math.round(s.fwPct*100)}%`],
    ["GIR",`${s.gir}/${round.holesCount} • ${Math.round(s.girPct*100)}%`],
    ["Scrambling",`${s.scrambleMade}/${s.scrambleOpp} • ${Math.round(s.scramblePct*100)}%`],
    ["Putts",s.putts],["3-putts",s.threePutts],["Penalties",s.penalties],["FW misses",`${s.fwL}L / ${s.fwR}R`]
  ];
  $("summaryStats").innerHTML=vals.map(([k,v])=>`<div class="summary-stat"><span>${k}</span><strong>${v}</strong></div>`).join("");
}
function renderHome(){
  const rounds=getRounds();
  $("roundCount").textContent=rounds.length; $("unsyncedCount").textContent=rounds.filter(r=>!r.synced).length;
  $("recentRounds").innerHTML=rounds.slice(0,5).map(r=>{
    const s=r.summary||summary(r);
    return `<div class="recent-item"><div><strong>${r.course||"Unnamed course"}</strong><div class="muted">${r.date} • ${r.holesCount} holes</div></div><div style="text-align:right"><strong>${s.score} (${s.toPar>=0?"+":""}${s.toPar})</strong><div class="badge ${r.synced?"":"unsynced"}">${r.synced?"Synced":"Unsynced"}</div></div></div>`;
  }).join("") || `<p class="muted">No rounds yet.</p>`;
  const cfg=settings(); $("endpoint").value=cfg.endpoint||""; $("syncToken").value=cfg.token||"";
}
async function syncOne(round){
  const cfg=settings();
  if(!cfg.endpoint) throw new Error("Add the Apps Script URL first.");
  const res=await fetch(cfg.endpoint,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({token:cfg.token||"",round})
  });
  const out=await res.json();
  if(!out.ok) throw new Error(out.error||"Sync failed");
  let rounds=getRounds(); const i=rounds.findIndex(r=>r.id===round.id);
  if(i>=0){ rounds[i].synced=true; rounds[i].syncedAt=new Date().toISOString(); setRounds(rounds); }
  return out;
}
async function syncAll(){
  const rounds=getRounds(); const pending=rounds.filter(r=>!r.synced);
  if(!pending.length){ alert("Everything is already synced."); return; }
  for(const r of pending) await syncOne(r);
  renderHome(); alert(`${pending.length} round(s) synced.`);
}
document.querySelectorAll("[data-holes]").forEach(b=>b.addEventListener("click",()=>startRound(Number(b.dataset.holes))));
document.querySelectorAll(".segmented button").forEach(b=>b.addEventListener("click",()=>{b.parentElement.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");}));
$("prevHole").onclick=()=>{saveCurrentHole();if(state.current>1)loadHole(state.current-1)}
$("nextHole").onclick=()=>{saveCurrentHole();if(state.current<state.holes)loadHole(state.current+1)}
$("saveHole").onclick=()=>{saveCurrentHole(); if(state.current<state.holes) loadHole(state.current+1); else alert("Hole saved.");}
$("finishRound").onclick=finishRound;
$("cancelRound").onclick=()=>{if(confirm("Cancel this round? Unsaved draft data will be removed.")){localStorage.removeItem("golfDraft");show("homeView")}}
$("backHome").onclick=()=>{renderHome();show("homeView")}
$("saveSettings").onclick=()=>{localStorage.setItem("golfSettings",JSON.stringify({endpoint:$("endpoint").value.trim(),token:$("syncToken").value}));alert("Connection saved.");}
$("syncBtn").onclick=()=>syncAll().catch(e=>alert(e.message));
$("syncRound").onclick=async()=>{try{const r=getRounds().find(x=>x.id===state.lastSavedId);if(r){await syncOne(r);renderHome();alert("Round synced.");}}catch(e){alert(e.message)}}

populateClubs(); renderHome();
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
