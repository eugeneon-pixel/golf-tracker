const CLUBS=["","Driver","3W","5W","7W","4 Hybrid","2i","3i","4i","5i","6i","7i","8i","9i","PW","48°","GW","50°","52°","54°","56°","58°","60°","Putter","Other"];
const $=id=>document.getElementById(id);
let state={holes:9,current:1,round:null,lastSavedId:null,accessToken:null,user:null,spreadsheetId:null,spreadsheetUrl:null,tokenClient:null,supabase:null,sgRound:null,sgHole:1,sgReturnView:"homeView",sgRoundIsDraft:false,courseProfiles:[],selectedTee:"White",libraryTee:"White",courseReturnView:"homeView"};

function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`}
function today(){return new Date().toISOString().slice(0,10)}
function userKey(){return state.user?.sub?`golfRounds:${state.user.sub}`:"golfRounds:guest"}
function getRounds(){return JSON.parse(localStorage.getItem(userKey())||"[]")}
function setRounds(v){localStorage.setItem(userKey(),JSON.stringify(v))}
function workbookKey(){return state.user?.sub?`golfWorkbook:${state.user.sub}`:"golfWorkbook:guest"}
function config(){return window.GOLF_TRACKER_CONFIG||{}}
function pct(n){return `${Math.round((Number(n)||0)*100)}%`}
function fmt1(n){return Number(n||0).toFixed(1)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}



const TEE_COLORS=["White","Yellow","Blue","Red"];
const PLAYABLE_CLUBS=CLUBS.filter(Boolean).filter(c=>c!=="Putter"&&c!=="Other");
function median(a){const x=(a||[]).map(Number).filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return null;const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2}
function mode(a){const c={};for(const v of (a||[]).filter(Boolean))c[v]=(c[v]||0)+1;return Object.entries(c).sort((x,y)=>y[1]-x[1])[0]?.[0]||""}
function setTeeButton(rootAttr,value){document.querySelectorAll(`[${rootAttr}]`).forEach(b=>b.classList.toggle("active",b.getAttribute(rootAttr)===value))}
function roundTee(r){return r?.teeColor||r?.raw?.teeColor||"White"}
function profileKey(name,tee){return `${String(name||"").trim().toLowerCase()}|${tee||"White"}`}
const GOOGLE_SCOPES="openid email profile https://www.googleapis.com/auth/drive.file";
const ROUND_HEADERS=["Round ID","Date","Course","Holes","Score","To Par","Fairways","FW Opps","FW %","GIR","GIR %","Scrambles Made","Scramble Opps","Scramble %","Putts","3-Putts","Penalties","FW Miss L","FW Miss R","GIR Miss L","GIR Miss R","GIR Miss Short","GIR Miss Long","Synced At","Tee Good","Tee Playable","Tee Trouble","Tee Penalty","Good + Playable %","Destructive Tee %","Avg GIR First Putt (ft)","Avg Missed GIR First Putt (ft)","Schema Version","SG Enabled","SG Benchmark","SG Complete","SG vs Benchmark","Tee"];
const HOLE_HEADERS=["Round ID","Date","Course","Hole","Par","Score","Tee Club","Fairway","Tee Quality","Approach Yds","Approach Club","GIR","Approach Miss","1st Putt Dist (ft)","Putts","Scramble","Penalty","Notes","Approach Lie","Approach Proximity (ft)","Miss Leave to Hole (yds)","First Putt Result","Holed Out Off Green","Schema Version","Hole Length (yds)","Miss Lie","2nd Shot Yds","2nd Shot Club","2nd Shot Lie","2nd Shot Hit Green","Tee Penalty Re-hit","Re-tee Club","Re-tee Fairway","Re-tee Quality","Re-tee Hit Green","Tee"];
const SG_HEADERS=["Round ID","Date","Course","Hole","Shot","Start Lie","Distance","Unit","Club","Category","SG vs Tour","Updated At","Benchmark"];
const WORKBOOK_SHEETS=["Rounds","Hole Detail","Master Summary","Scratch Dashboard","Club & Distance Analysis","Driving Analysis","Putting Analysis","SG Shot Detail","Strokes Gained Summary"];

// Approximate Broadie-style expected-strokes model. Handicap comparisons are round-level
// benchmark offsets, not proprietary shot-state tables. See README for methodology.
const SG_LIES=["Tee","Fairway","First Cut","Rough","Bunker","Recovery","Green","Penalty"];
const SG_BENCHMARKS={
  "Tour":{ott:0,approach:0,around:0,putting:0,total:0,label:"Tour"},
  "+2":{ott:-0.5,approach:-0.9,around:-0.3,putting:-0.25,total:-1.95,label:"+2 (estimated)"},
  "Scratch":{ott:-0.8,approach:-1.5,around:-0.5,putting:-0.4,total:-3.2,label:"Scratch"},
  "5":{ott:-1.4,approach:-3.0,around:-1.0,putting:-0.8,total:-6.2,label:"5 HCP"},
  "10":{ott:-2.0,approach:-4.5,around:-1.5,putting:-1.2,total:-9.2,label:"10 HCP"},
  "15":{ott:-2.7,approach:-6.0,around:-2.0,putting:-1.5,total:-12.2,label:"15 HCP"},
  "20":{ott:-3.4,approach:-7.5,around:-2.5,putting:-1.8,total:-15.2,label:"20 HCP"}
};
const EXPECTED={
  Green:[[0,0],[1,1],[2,1.01],[3,1.04],[4,1.13],[5,1.23],[6,1.34],[8,1.50],[10,1.61],[15,1.78],[20,1.87],[30,1.98],[40,2.06],[60,2.16],[90,2.30]],
  Tee:[[80,2.85],[100,2.92],[150,2.99],[200,3.12],[250,3.24],[300,3.40],[350,3.55],[400,3.69],[450,3.86],[500,4.03],[550,4.20],[600,4.38]],
  Fairway:[[10,2.15],[20,2.40],[40,2.60],[60,2.70],[80,2.75],[100,2.80],[120,2.85],[140,2.91],[160,2.98],[180,3.08],[200,3.19],[220,3.32],[240,3.45],[260,3.58],[280,3.69],[320,3.83]],
  "First Cut":[[10,2.20],[20,2.45],[40,2.65],[60,2.75],[80,2.82],[100,2.88],[120,2.94],[140,3.01],[160,3.09],[180,3.19],[200,3.31],[220,3.44],[240,3.57],[280,3.82]],
  Rough:[[10,2.25],[20,2.50],[40,2.70],[60,2.80],[80,2.88],[100,2.95],[120,3.02],[140,3.10],[160,3.19],[180,3.30],[200,3.42],[220,3.55],[240,3.68],[280,3.92]],
  Bunker:[[10,2.45],[20,2.58],[30,2.70],[40,2.82],[60,3.00],[80,3.15],[100,3.30],[140,3.55],[180,3.82],[220,4.05]],
  Recovery:[[10,2.55],[20,2.70],[40,2.95],[60,3.15],[80,3.32],[100,3.48],[140,3.75],[180,4.00],[220,4.22],[280,4.55]]
};

function requireUser(){if(!state.user){alert("Sign in with Google first so this round is stored under the correct user.");return false}return true}
function migrateLegacyRoundsForFirstUser(){
  const legacy=JSON.parse(localStorage.getItem("golfRounds")||"[]");
  const existing=getRounds();
  if(legacy.length&&!existing.length&&confirm(`Found ${legacy.length} round(s) from the previous app version on this device. Import them into ${state.user.email}?`)){
    const migrated=legacy.map(r=>({...r,synced:false,syncedSpreadsheetId:null}));setRounds(migrated);localStorage.setItem("golfRounds:migrated","1");
  }
}
function startRoundGuarded(holes){if(requireUser())startRound(holes)}
function maybeResumeDraft(){
  if(!state.user||state.round)return;const key=`golfDraft:${state.user.sub}`,raw=localStorage.getItem(key);if(!raw)return;
  try{const d=JSON.parse(raw);if(d?.holesData&&confirm("Resume your unfinished round?")){state.round=d;state.holes=d.holesCount;state.current=1;d.holesData=d.holesData.map((h,i)=>({...blankHole(i+1),...h}));$("roundDate").value=d.date;refreshCourseSelect(d.course);state.selectedTee=roundTee(d);setTeeButton("data-tee",state.selectedTee);$("holesCount").value=d.holesCount;$("roundPar").value=d.roundPar;loadHole(1);show("roundView")}}catch{}
}

function normalizeSupabaseUser(u){return u?{id:u.id,sub:u.id,email:u.email||"",name:u.user_metadata?.full_name||u.user_metadata?.name||u.email?.split("@")[0]||"Golfer"}:null}

async function initV6Auth(){
  const c=config();
  if(!c.SUPABASE_URL||!c.SUPABASE_PUBLISHABLE_KEY||String(c.SUPABASE_URL).includes("YOUR-PROJECT")){
    setAuthStatus("Supabase is not configured yet. Complete the v6 README setup.",false);return;
  }
  state.supabase=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data:{session}}=await state.supabase.auth.getSession();
  if(session?.user)await applySupabaseSession(session.user);
  state.supabase.auth.onAuthStateChange(async(event,session)=>{
    if(session?.user){await applySupabaseSession(session.user)}
    else if(event==="SIGNED_OUT"){state.user=null;localStorage.removeItem("golfLastUser");renderHome()}
  });
}
async function applySupabaseSession(u){
  state.user=normalizeSupabaseUser(u);localStorage.setItem("golfLastUser",JSON.stringify(state.user));migrateLegacyRoundsForFirstUser();
  try{await loadRoundsFromDatabase()}catch(e){console.warn("Database load failed",e)}
  try{await loadCourseProfiles()}catch(e){console.warn("Course library load failed",e)}
  renderAuth();renderHome();maybeResumeDraft();
}
async function requestDatabaseSignIn(){
  if(!state.supabase){await initV6Auth();if(!state.supabase)return}
  const redirectTo=location.origin+location.pathname;
  const {error}=await state.supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo}});
  if(error)alert(error.message);
}
async function databaseSignOut(){if(state.supabase)await state.supabase.auth.signOut();state.user=null;state.accessToken=null;state.spreadsheetId=null;state.spreadsheetUrl=null;localStorage.removeItem("golfLastUser");renderHome()}
function setAuthStatus(message,signedIn){
  if($("signedOutPanel"))$("signedOutPanel").classList.toggle("hidden",!!signedIn);
  if($("signedInPanel"))$("signedInPanel").classList.toggle("hidden",!signedIn);
  if(message&&$("sheetStatus"))$("sheetStatus").textContent=message;
}
function renderAuth(){
  const signed=!!state.user;setAuthStatus(signed?"Cloud database connected":"Sign in to your secure cloud database",signed);
  if(signed){$("accountName").textContent=state.user.name||"Golfer";$("accountEmail").textContent=state.user.email||"";$("openSpreadsheet").disabled=!state.spreadsheetId;$("googleReconnect").textContent=state.accessToken?"Sheets connected":"Connect Sheets"}
  document.querySelectorAll("[data-holes]").forEach(b=>b.classList.toggle("auth-required",!signed));
}

// Optional Google Sheets export. Supabase remains the source of truth.
function initGoogleAuth(){
  const clientId=config().GOOGLE_CLIENT_ID||"";if(!clientId||clientId.startsWith("PASTE_"))return;
  if(!window.google?.accounts?.oauth2){setTimeout(initGoogleAuth,300);return}
  state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:GOOGLE_SCOPES,callback:handleTokenResponse});
}
function requestGoogleAccess({selectAccount=false}={}){if(!state.tokenClient){initGoogleAuth();setTimeout(()=>state.tokenClient?.requestAccessToken({prompt:selectAccount?"select_account":"consent"}),400);return}state.tokenClient.requestAccessToken({prompt:selectAccount?"select_account":""})}
async function handleTokenResponse(resp){if(resp.error){alert(`Google Sheets connection failed: ${resp.error}`);return}state.accessToken=resp.access_token;try{await ensureUserSpreadsheet();renderAuth();alert("Google Sheets export connected. The database remains the source of truth.")}catch(e){alert(e.message)}}
function loadCachedWorkbook(){const x=JSON.parse(localStorage.getItem(workbookKey())||"null");if(x){state.spreadsheetId=x.id;state.spreadsheetUrl=x.url}}
function cacheWorkbook(id,url){if(!id){state.spreadsheetId=null;state.spreadsheetUrl=null;localStorage.removeItem(workbookKey());return}state.spreadsheetId=id;state.spreadsheetUrl=url||`https://docs.google.com/spreadsheets/d/${id}/edit`;localStorage.setItem(workbookKey(),JSON.stringify({id:state.spreadsheetId,url:state.spreadsheetUrl}))}
async function googleFetch(url,opts={}){
  if(!state.accessToken)throw new Error("Google authorization is required. Tap Sign in with Google.");
  const headers={...(opts.headers||{}),Authorization:`Bearer ${state.accessToken}`};
  if(opts.body&&!headers["Content-Type"])headers["Content-Type"]="application/json";
  const res=await fetch(url,{...opts,headers});
  if(res.status===401){state.accessToken=null;throw new Error("Google authorization expired. Tap Sign in with Google to reconnect.")}
  if(!res.ok){let msg=`Google API error ${res.status}`;try{const j=await res.json();msg=j.error?.message||msg}catch{}throw new Error(msg)}
  return res.status===204?null:res.json();
}
async function ensureUserSpreadsheet(){
  loadCachedWorkbook();
  if(state.spreadsheetId){try{await googleFetch(`https://www.googleapis.com/drive/v3/files/${state.spreadsheetId}?fields=id,name,trashed,webViewLink`);await initializeWorkbook(state.spreadsheetId);return state.spreadsheetId}catch{cacheWorkbook(null,null)}}
  const q=encodeURIComponent("appProperties has { key='golfTrackerVersion' and value='3' } and trashed=false");
  const found=await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,webViewLink)&pageSize=10`);
  if(found.files?.length){const f=found.files[0];cacheWorkbook(f.id,f.webViewLink);await initializeWorkbook(f.id);return f.id}
  const label=(state.user?.name||state.user?.email||"User").replace(/[\\/:*?\"<>|]/g," ").trim();
  const name=`${config().SPREADSHEET_NAME||"Golf Performance Tracker"} - ${label}`;
  const f=await googleFetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",{method:"POST",body:JSON.stringify({name,mimeType:"application/vnd.google-apps.spreadsheet",parents:["root"],appProperties:{golfTrackerVersion:"3"}})});
  cacheWorkbook(f.id,f.webViewLink);await initializeWorkbook(f.id);return f.id;
}
async function initializeWorkbook(id){
  const meta=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`);
  const first=meta.sheets?.[0]?.properties;const requests=[];
  if(first?.title!=="Rounds")requests.push({updateSheetProperties:{properties:{sheetId:first.sheetId,title:"Rounds",gridProperties:{frozenRowCount:1}},fields:"title,gridProperties.frozenRowCount"}});
  const existing=new Set(meta.sheets.map(s=>s.properties.title));existing.add("Rounds");
  WORKBOOK_SHEETS.slice(1).forEach(title=>{if(!existing.has(title))requests.push({addSheet:{properties:{title,gridProperties:{frozenRowCount:1}}}})});
  if(requests.length)await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`,{method:"POST",body:JSON.stringify({requests})});
  await writeValues(id,"Rounds!A1",[ROUND_HEADERS]);await writeValues(id,"Hole Detail!A1",[HOLE_HEADERS]);await writeValues(id,"SG Shot Detail!A1",[SG_HEADERS]);
  await refreshWorkbookAnalytics(id);
}
async function writeValues(id,range,values){return googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,{method:"PUT",body:JSON.stringify({range,majorDimension:"ROWS",values})})}
async function appendValues(id,range,values){return googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,{method:"POST",body:JSON.stringify({majorDimension:"ROWS",values})})}
async function getValues(id,range){const j=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`);return j.values||[]}
function roundRow(r){const s=r.summary||summary(r),sg=sgSummary(r);return [r.id,r.date,r.course,r.holesCount,s.score,s.toPar,s.fairways,s.fwOpp,s.fwPct,s.gir,s.girPct,s.scrambleMade,s.scrambleOpp,s.scramblePct,s.putts,s.threePutts,s.penalties,s.fwL,s.fwR,s.missLeft,s.missRight,s.missShort,s.missLong,new Date().toISOString(),s.teeGood||0,s.teePlayable||0,s.teeTrouble||0,s.teePenalty||0,s.goodPlayablePct||0,s.destructivePct||0,s.avgGirFirstPutt??"",s.avgMissFirstPutt??"",6,!!r.sg?.enabled,r.sg?.benchmark||"",r.sg?.enabled?sg.complete:false,r.sg?.enabled&&sg.complete?sg.vsBenchmark.total:"",roundTee(r)]}
function holeRows(r){return (r.holesData||[]).map(h=>[r.id,r.date,r.course,h.hole,h.par,h.score,h.teeClub,h.fairway,h.teeQuality,h.approachYds,h.approachClub,h.gir,h.approachMiss,h.firstPutt,h.putts,h.scramble,h.penalty,h.notes,h.approachLie,h.approachProximityFt,h.missLeaveYds,h.firstPuttResult,!!h.holeOut,6,h.holeLengthYds??"",h.missLie||"",h.secondShotYds??"",h.secondShotClub||"",h.secondShotLie||"",!!h.secondShotHitGreen,!!h.teePenaltyRehit,h.reteeClub||"",h.reteeFairway||"",h.reteeQuality||"",!!h.reteeHitGreen,roundTee(r)])}
async function spreadsheetHasRound(id,roundId){const ids=await getValues(id,"Rounds!A2:A");return ids.some(r=>r[0]===roundId)}
async function clearValues(id,range){return googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}:clear`,{method:"POST",body:"{}"})}
function colLetter(n){let s="";while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
async function upsertByRoundId(id,sheet,headers,rowValues,roundId){
  const ids=await getValues(id,`${sheet}!A2:A`);const matches=[];ids.forEach((r,i)=>{if(r[0]===roundId)matches.push(i+2)});
  if(matches.length){await writeValues(id,`${sheet}!A${matches[0]}:${colLetter(headers.length)}${matches[0]}`,[rowValues]);return matches[0]}
  await appendValues(id,`${sheet}!A:${colLetter(headers.length)}`,[rowValues]);return null;
}
async function upsertHoleRows(id,round){
  const ids=await getValues(id,"Hole Detail!A2:A"),matches=[];ids.forEach((r,i)=>{if(r[0]===round.id)matches.push(i+2)});const rows=holeRows(round),last=colLetter(HOLE_HEADERS.length);
  for(let i=0;i<rows.length;i++){if(matches[i])await writeValues(id,`Hole Detail!A${matches[i]}:${last}${matches[i]}`,[rows[i]]);else await appendValues(id,`Hole Detail!A:${last}`,[rows[i]])}
  for(let i=rows.length;i<matches.length;i++)await clearValues(id,`Hole Detail!A${matches[i]}:${last}${matches[i]}`);
}
async function syncSgRows(id,round){
  const ids=await getValues(id,"SG Shot Detail!A2:A"),matches=[];ids.forEach((r,i)=>{if(r[0]===round.id)matches.push(i+2)});const sg=sgShotRows(round);
  for(let i=0;i<sg.length;i++){if(matches[i])await writeValues(id,`SG Shot Detail!A${matches[i]}:M${matches[i]}`,[sg[i]]);else await appendValues(id,"SG Shot Detail!A:M",[sg[i]])}
  for(let i=sg.length;i<matches.length;i++)await clearValues(id,`SG Shot Detail!A${matches[i]}:M${matches[i]}`);
}
async function syncOne(round,{refresh=true}={}){
  if(!requireUser())throw new Error("Sign in first.");if(!state.accessToken)throw new Error("Tap Sign in with Google to authorize spreadsheet sync.");
  await ensureUserSpreadsheet();
  await upsertByRoundId(state.spreadsheetId,"Rounds",ROUND_HEADERS,roundRow(round),round.id);await upsertHoleRows(state.spreadsheetId,round);await syncSgRows(state.spreadsheetId,round);
  let rounds=getRounds();const i=rounds.findIndex(r=>r.id===round.id);if(i>=0){rounds[i].synced=true;rounds[i].syncedAt=new Date().toISOString();rounds[i].syncedSpreadsheetId=state.spreadsheetId;setRounds(rounds)}
  if(refresh){await refreshWorkbookAnalytics(state.spreadsheetId);await refreshSgWorkbookSummary(state.spreadsheetId)}return {ok:true,id:round.id};
}
async function syncAll({silent=false}={}){
  if(!requireUser())return;const pending=getRounds().filter(r=>r.syncedSpreadsheetId!==state.spreadsheetId);
  if(!pending.length){if(!silent)alert("Everything is already synced to your personal spreadsheet.");return}
  if(!state.accessToken){if(!silent)requestGoogleAccess();return}
  await ensureUserSpreadsheet();for(const r of pending)await syncOne(r,{refresh:false});await refreshWorkbookAnalytics(state.spreadsheetId);renderHome();if(!silent)alert(`${pending.length} round(s) synced to your personal spreadsheet.`)
}

function show(view){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$(view).classList.add("active");window.scrollTo({top:0,behavior:"instant"})}
function populateClubs(){["teeClub","reteeClub","secondShotClub","approachClub"].forEach(id=>$(id).innerHTML=CLUBS.map(c=>`<option>${c}</option>`).join(""))}
function blankHole(n){return {hole:n,par:4,score:4,penalty:0,holeLengthYds:"",teeClub:"",fairway:"",teeQuality:"",teePenaltyRehit:false,reteeClub:"",reteeFairway:"",reteeQuality:"",reteeHitGreen:false,secondShotYds:"",secondShotClub:"",secondShotLie:"",secondShotHitGreen:false,approachYds:"",approachClub:"",approachLie:"",gir:"",approachMiss:"",approachProximityFt:"",missLeaveYds:"",missLie:"",firstPutt:"",putts:"",scramble:"",firstPuttResult:"",holeOut:false,notes:"",saved:false}}


function inferredCourseProfiles(){
  const groups=new Map();
  for(const r of getRounds()){
    const name=String(r.course||"").trim();if(!name)continue;const tee=roundTee(r),key=profileKey(name,tee);
    if(!groups.has(key))groups.set(key,{id:null,name,tee_color:tee,holes_count:Number(r.holesCount)||18,round_par:Number(r.roundPar)||0,source:"history",holes:{}});
    const g=groups.get(key);for(const h of r.holesData||[]){const n=Number(h.hole);if(!g.holes[n])g.holes[n]={pars:[],yards:[]};if(h.par)g.holes[n].pars.push(Number(h.par));if(h.holeLengthYds)g.holes[n].yards.push(Number(h.holeLengthYds))}
  }
  return [...groups.values()].map(g=>({...g,holes:Object.fromEntries(Object.entries(g.holes).map(([n,v])=>[n,{hole_number:Number(n),par:Number(mode(v.pars.map(String)))||4,yardage:median(v.yards)||null}]))}));
}
function mergedCourseProfiles(){const map=new Map();for(const p of inferredCourseProfiles())map.set(profileKey(p.name,p.tee_color),p);for(const p of state.courseProfiles||[])map.set(profileKey(p.name,p.tee_color),p);return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name)||TEE_COLORS.indexOf(a.tee_color)-TEE_COLORS.indexOf(b.tee_color))}
function courseNames(){return [...new Set(mergedCourseProfiles().map(p=>p.name))].sort((a,b)=>a.localeCompare(b))}
function refreshCourseSelect(selected=""){
  const sel=$("course");if(!sel)return;const names=courseNames();const cur=selected||sel.value||state.round?.course||"";sel.innerHTML=`<option value="">Select course</option>${names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}<option value="__new__">＋ Add new course</option>`;
  if(cur&&names.includes(cur))sel.value=cur;else if(cur){sel.insertAdjacentHTML("beforeend",`<option value="${esc(cur)}">${esc(cur)}</option>`);sel.value=cur}else sel.value="";
}
function currentCourseProfile(){const name=$("course")?.value||state.round?.course||"";return mergedCourseProfiles().find(p=>profileKey(p.name,p.tee_color)===profileKey(name,state.selectedTee))||null}
function applyCourseProfileToRound({force=false}={}){
  if(!state.round)return;const p=currentCourseProfile();state.round.teeColor=state.selectedTee;
  if(!p){$("courseAutoNote").textContent="New course/tee — values you enter will be learned for future rounds.";return}
  const holes=Number(state.round.holesCount)||18;const ph=Array.from({length:holes},(_,i)=>p.holes?.[i+1]).filter(Boolean);const rp=ph.length?ph.reduce((a,h)=>a+Number(h.par||0),0):(Number(p.round_par)||state.round.roundPar);
  state.round.roundPar=rp;$("roundPar").value=rp;
  for(let i=0;i<holes;i++){const h=state.round.holesData[i],cfg=p.holes?.[i+1];if(!cfg)continue;const oldPar=Number(h.par)||4;if(force||!h.saved){h.par=Number(cfg.par)||oldPar;h.holeLengthYds=cfg.yardage??h.holeLengthYds;if(!h.saved&&(h.score===""||Number(h.score)===oldPar))h.score=h.par}}
  $("courseAutoNote").textContent=`Auto-filled from ${p.source==="history"?"previous rounds":"Course Library"}: ${p.name} • ${p.tee_color} tees.`;
  if(state.current)loadHole(state.current);
}
async function loadCourseProfiles(){
  if(!state.supabase||!state.user){refreshCourseSelect();return}
  const {data,error}=await state.supabase.from("course_profiles").select("id,name,tee_color,holes_count,round_par,source,course_holes(hole_number,par,yardage)").order("name");
  if(error){console.warn("Course library unavailable until v6.3 SQL migration is run",error);state.courseProfiles=[];refreshCourseSelect();return}
  state.courseProfiles=(data||[]).map(p=>({...p,holes:Object.fromEntries((p.course_holes||[]).map(h=>[h.hole_number,h]))}));refreshCourseSelect();renderSavedCourseProfiles();
}
function personalClubStats(){
  const byClub={};for(const r of getRounds())for(const h of r.holesData||[]){for(const pair of [[h.approachClub,h.approachYds],[h.secondShotClub,h.secondShotYds]]){const [club,dist]=pair;if(club&&Number(dist)>0){(byClub[club]??=[]).push(Number(dist))}}}
  return Object.fromEntries(Object.entries(byClub).map(([c,v])=>[c,{n:v.length,median:median(v)}]));
}
function exactHistoricalClub(type,hole){const name=state.round?.course,tee=state.selectedTee;if(!name)return"";const vals=[];for(const r of getRounds()){if(String(r.course||"").toLowerCase()!==String(name).toLowerCase()||roundTee(r)!==tee)continue;const h=r.holesData?.[hole-1];if(!h)continue;const c=type==="tee"?h.teeClub:type==="second"?h.secondShotClub:h.approachClub;if(c)vals.push(c)}return mode(vals)}
function suggestClub(type,distance,hole=state.current){
  const exact=exactHistoricalClub(type,hole);if(type==="tee")return exact?{club:exact,why:"Most used on this course / tee / hole"}:{club:"",why:""};
  const d=Number(distance);if(d){const stats=personalClubStats();let best=null;for(const [club,s] of Object.entries(stats)){if(s.n<1||!s.median)continue;const delta=Math.abs(s.median-d);if(!best||delta<best.delta)best={club,delta,median:s.median,n:s.n}}if(best)return {club:best.club,why:`Suggested from your history: ${Math.round(best.median)} yd median (${best.n} shot${best.n===1?"":"s"})`}}
  return exact?{club:exact,why:"Most used on this course / tee / hole"}:{club:"",why:""};
}
function applyClubSuggestion(id,type,distance,{force=false}={}){const el=$(id);if(!el)return;const s=suggestClub(type,distance);if(s.club&&(force||!el.value)){el.value=s.club;const hint=$(id+"Hint");if(hint)hint.textContent=s.why}else if($(id+"Hint")&&!el.value)$(id+"Hint").textContent=""}
function stepClub(id,dir){const el=$(id),cur=el.value;let i=PLAYABLE_CLUBS.indexOf(cur);if(i<0)i=dir>0?0:PLAYABLE_CLUBS.length-1;else i=Math.max(0,Math.min(PLAYABLE_CLUBS.length-1,i+Number(dir)));el.value=PLAYABLE_CLUBS[i];const hint=$(id+"Hint");if(hint)hint.textContent="Manual selection"}
function recalcRoundParFromHoles(){if(!state.round)return;state.round.roundPar=state.round.holesData.slice(0,state.holes).reduce((a,h)=>a+Number(h.par||0),0);$("roundPar").value=state.round.roundPar}
function adjustPar(delta){const old=Number($("par").value)||4,n=Math.max(3,Math.min(5,old+delta)),score=Number($("score").value)||old;$("par").value=n;if(score===old)$("score").value=n;state.round.holesData[state.current-1].par=n;state.round.holesData[state.current-1].score=Number($("score").value);recalcRoundParFromHoles();updateConditionalFields()}
function adjustScore(delta){const n=Math.max(1,(Number($("score").value)||Number($("par").value)||4)+delta);$("score").value=n}
function renderCourseHoleEditor(){const holes=Number($("libraryHoles").value)||18,existing=mergedCourseProfiles().find(p=>profileKey(p.name,p.tee_color)===profileKey($("libraryCourseName").value,state.libraryTee));$("courseHoleEditor").innerHTML=Array.from({length:holes},(_,i)=>{const h=existing?.holes?.[i+1]||{};return `<div class="course-hole-row"><strong>${i+1}</strong><input data-course-par="${i+1}" type="number" min="3" max="5" value="${h.par||4}" aria-label="Hole ${i+1} par"><input data-course-yard="${i+1}" type="number" value="${h.yardage||""}" placeholder="yards" aria-label="Hole ${i+1} yardage"></div>`}).join("")}
function renderSavedCourseProfiles(){const root=$("savedCourseProfiles");if(!root)return;const ps=mergedCourseProfiles();root.innerHTML=ps.length?ps.map(p=>`<div class="course-profile-item"><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.tee_color)} • ${p.holes_count} holes • par ${p.round_par||Object.values(p.holes||{}).reduce((a,h)=>a+Number(h.par||0),0)} ${p.source==="history"?"• learned":""}</div></div><div class="course-profile-actions"><button class="secondary" data-edit-course="${esc(p.name)}" data-edit-tee="${esc(p.tee_color)}">Edit</button></div></div>`).join(""):"<p class=\"muted\">No courses yet. Play a round or add/import one here.</p>"}
async function saveCourseProfileObject(obj){
  if(!state.supabase||!state.user)throw new Error("Sign in first.");const base={user_id:state.user.sub,name:obj.name.trim(),tee_color:obj.tee_color,holes_count:obj.holes_count,round_par:obj.round_par,source:obj.source||"manual",updated_at:new Date().toISOString()};
  let {data,error}=await state.supabase.from("course_profiles").upsert(base,{onConflict:"user_id,name,tee_color"}).select("id").single();if(error)throw error;const id=data.id;
  await state.supabase.from("course_holes").delete().eq("course_profile_id",id);const rows=Object.values(obj.holes).map(h=>({course_profile_id:id,user_id:state.user.sub,hole_number:h.hole_number,par:h.par,yardage:h.yardage||null}));if(rows.length){const q=await state.supabase.from("course_holes").insert(rows);if(q.error)throw q.error}await loadCourseProfiles();return id;
}
async function saveCourseFromEditor(){const name=$("libraryCourseName").value.trim();if(!name){alert("Enter a course name.");return}const holes=Number($("libraryHoles").value)||18,hmap={};for(let i=1;i<=holes;i++){const par=Number(document.querySelector(`[data-course-par="${i}"]`).value)||4,y=Number(document.querySelector(`[data-course-yard="${i}"]`).value)||null;hmap[i]={hole_number:i,par,yardage:y}}const rp=Object.values(hmap).reduce((a,h)=>a+h.par,0);try{await saveCourseProfileObject({name,tee_color:state.libraryTee,holes_count:holes,round_par:rp,holes:hmap,source:"manual"});if(state.courseReturnView==="roundView"&&state.round){state.round.course=name;state.selectedTee=state.libraryTee;refreshCourseSelect(name);setTeeButton("data-tee",state.selectedTee);applyCourseProfileToRound({force:false})}alert("Course / tee saved.");renderSavedCourseProfiles()}catch(e){alert(e.message)}}
function parseCsvLine(line){const out=[];let s="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++}else q=!q}else if(c===','&&!q){out.push(s.trim());s=""}else s+=c}out.push(s.trim());return out}
async function importCourseCsv(){const f=$("courseCsv").files?.[0];if(!f){alert("Choose a CSV file first.");return}const text=await f.text(),lines=text.split(/\r?\n/).filter(x=>x.trim());if(lines.length<2){alert("CSV has no data rows.");return}const hdr=parseCsvLine(lines[0]).map(x=>x.toLowerCase().trim()),need=["course","tee","hole","par","yardage"];if(need.some(x=>!hdr.includes(x))){alert(`CSV must contain: ${need.join(", ")}`);return}const groups={};for(const line of lines.slice(1)){const a=parseCsvLine(line),o=Object.fromEntries(hdr.map((h,i)=>[h,a[i]??""])),name=o.course.trim(),tee=(TEE_COLORS.find(t=>t.toLowerCase()===o.tee.toLowerCase())||o.tee||"White");if(!name)continue;const key=profileKey(name,tee);groups[key]??={name,tee_color:tee,holes_count:Number(o.holes)||18,holes:{},source:"csv"};groups[key].holes[Number(o.hole)]={hole_number:Number(o.hole),par:Number(o.par)||4,yardage:Number(o.yardage)||null}}
  try{for(const g of Object.values(groups)){g.holes_count=Math.max(g.holes_count,...Object.keys(g.holes).map(Number));g.round_par=Object.values(g.holes).reduce((a,h)=>a+h.par,0);await saveCourseProfileObject(g)}alert(`${Object.keys(groups).length} course / tee profile(s) imported.`)}catch(e){alert(e.message)}}
function downloadCourseTemplate(){const rows=["course,tee,hole,par,yardage,holes"];for(let i=1;i<=18;i++)rows.push(`Example Golf Club,White,${i},${[4,4,3,5][(i-1)%4]},,18`);const blob=new Blob([rows.join("\n")],{type:"text/csv"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="golf_course_import_template.csv";a.click();URL.revokeObjectURL(a.href)}

function startRound(holes){
  state.holes=holes;state.current=1;
  state.round={id:uid(),createdAt:new Date().toISOString(),date:today(),course:"",holesCount:holes,roundPar:holes===9?36:72,synced:false,schemaVersion:6.3,sg:{enabled:false,benchmark:"Scratch",holes:{}},holesData:Array.from({length:holes},(_,i)=>blankHole(i+1))};
  $("roundDate").value=state.round.date;refreshCourseSelect("");$("holesCount").value=holes;$("roundPar").value=state.round.roundPar;state.selectedTee="White";setTeeButton("data-tee",state.selectedTee);
  loadHole(1);show("roundView");
}
function readRoundHeader(){state.round.date=$("roundDate").value;state.round.course=$("course").value==="__new__"?"":$("course").value.trim();state.round.teeColor=state.selectedTee;state.round.roundPar=Number($("roundPar").value)||0}
function selectedSegment(target){const el=document.querySelector(`.segmented[data-target="${target}"] button.active`);return el?el.dataset.value:""}
function setSegment(target,val){document.querySelectorAll(`.segmented[data-target="${target}"] button`).forEach(b=>b.classList.toggle("active",b.dataset.value===val))}
function currentForm(){return {
  hole:state.current,par:Number($("par").value)||0,score:$("score").value===""?"":Number($("score").value),penalty:Number($("penalty").value)||0,holeLengthYds:$("holeLengthYds").value===""?"":Number($("holeLengthYds").value),
  teeClub:$("teeClub").value,fairway:selectedSegment("fairway"),teeQuality:selectedSegment("teeQuality"),
  teePenaltyRehit:$("teePenaltyRehit").checked,reteeClub:$("reteeClub").value,reteeFairway:selectedSegment("reteeFairway"),reteeQuality:selectedSegment("reteeQuality"),reteeHitGreen:$("reteeHitGreen").checked,
  secondShotYds:$("secondShotYds").value===""?"":Number($("secondShotYds").value),secondShotClub:$("secondShotClub").value,secondShotLie:$("secondShotLie").value,secondShotHitGreen:$("secondShotHitGreen").checked,
  approachYds:$("approachYds").value===""?"":Number($("approachYds").value),approachClub:$("approachClub").value,approachLie:$("approachLie").value,
  gir:selectedSegment("gir"),approachMiss:$("approachMiss").value,approachProximityFt:$("approachProximityFt").value===""?"":Number($("approachProximityFt").value),missLeaveYds:$("missLeaveYds").value===""?"":Number($("missLeaveYds").value),missLie:$("missLie").value,
  firstPutt:$("firstPutt").value===""?"":Number($("firstPutt").value),putts:$("putts").value===""?"":Number($("putts").value),scramble:$("scramble").value,
  firstPuttResult:$("firstPuttResult").value,holeOut:$("holeOut").checked,notes:$("notes").value.trim(),saved:true
}}

function applySmartDefaults(h){
  if(h.teePenaltyRehit){h.penalty=Math.max(1,Number(h.penalty)||0);h.gir="Miss";if(h.reteeHitGreen)h.approachMiss="Hit"}
  if(h.par===3){h.fairway="N/A";h.approachYds="";h.approachClub="";h.approachLie="";h.secondShotYds="";h.secondShotClub="";h.secondShotLie="";h.secondShotHitGreen=false}
  if(h.par!==5){h.secondShotYds="";h.secondShotClub="";h.secondShotLie="";h.secondShotHitGreen=false}
  if(h.par===5&&h.secondShotHitGreen){h.gir=h.teePenaltyRehit?"Miss":"Hit";h.approachMiss="Hit";h.approachYds="";h.approachClub="";h.approachLie=""}
  if(h.gir==="Hit"){h.approachMiss="Hit";h.scramble="N/A";h.missLeaveYds="";h.missLie="";if(h.approachProximityFt!==""&&h.approachProximityFt!=null)h.firstPutt=Number(h.approachProximityFt)}
  if(h.gir==="Miss"){if(h.approachMiss==="Hit"||h.reteeHitGreen||h.secondShotHitGreen){h.missLeaveYds="";h.missLie="";if(h.approachProximityFt!==""&&h.approachProximityFt!=null)h.firstPutt=Number(h.approachProximityFt)}else{h.approachProximityFt=""}if(h.scramble==="N/A")h.scramble=""}
  if(h.holeOut){h.putts=0;h.firstPutt="";h.firstPuttResult=""}
  if(Number(h.putts)===1 && !h.holeOut && !h.firstPuttResult)h.firstPuttResult="Holed";
  return h;
}
function validateHole(h,{finishing=false}={}){
  const errors=[],warnings=[];
  if(!h.par)errors.push("Par is required.");
  if(h.score==="")errors.push("Score is required.");
  if(h.par>3 && !h.fairway)warnings.push("Fairway result is blank.");
  if(!h.teeQuality)warnings.push("Tee quality is blank.");
  if(h.par===5&&h.secondShotYds!==""&&!h.secondShotClub)warnings.push("Second-shot club is blank.");
  if(h.par===5&&h.secondShotYds!==""&&!h.secondShotLie)warnings.push("Second-shot lie is blank.");
  if(h.par===5&&!h.secondShotHitGreen&&h.secondShotYds==="")warnings.push("Par 5 second-shot distance is blank.");
  if(h.par!==3&&!h.secondShotHitGreen&&h.approachYds!=="" && !h.approachClub)warnings.push("Approach club is blank.");
  if(h.par!==3&&!h.secondShotHitGreen&&h.approachYds!=="" && !h.approachLie)warnings.push("Approach lie is blank.");
  if(!h.gir)warnings.push("GIR result is blank.");
  if(h.gir==="Hit" && h.approachMiss && h.approachMiss!=="Hit")errors.push("GIR is Hit but approach result is a miss. Choose one consistent result.");
  if(h.gir==="Miss" && h.approachMiss==="Hit" && !h.teePenaltyRehit)warnings.push("Green was reached after regulation; this is correctly recorded as GIR Miss.");
  if(h.gir==="Miss" && h.approachMiss!=="Hit" && !h.scramble)warnings.push("Scramble result is blank on a missed green.");
  if(h.gir==="Miss" && h.approachMiss!=="Hit" && h.missLeaveYds!=="" && !h.missLie)warnings.push("Miss lie is blank; SG enrichment can add it later.");
  if(h.gir==="Hit" && h.scramble && h.scramble!=="N/A")errors.push("Scrambling should be N/A when GIR is hit.");
  if(h.putts===0 && !h.holeOut)errors.push("Zero putts requires ‘Holed out from off the green’.");
  if(h.holeOut && h.putts!==0)errors.push("An off-green hole-out should have 0 putts.");
  if(h.putts>0 && h.firstPutt==="")warnings.push("First-putt distance is blank.");
  if(h.putts===1 && h.firstPuttResult && h.firstPuttResult!=="Holed")errors.push("One putt means the first putt was holed.");
  if(h.putts>=2 && h.firstPuttResult==="Holed")errors.push("First putt cannot be Holed when total putts are 2 or more.");
  if(h.teePenaltyRehit&&!h.reteeClub)warnings.push("Re-tee club is blank.");
  if(h.penalty>0 && h.teeQuality!=="Penalty")warnings.push("Penalty shots recorded but tee quality is not marked Penalty; this is fine if the penalty occurred later in the hole.");
  if(finishing && !h.saved)warnings.push("This hole has not been saved yet.");
  return {errors,warnings};
}
function showValidation(v){
  const box=$("validationBox");
  if(!v.errors.length&&!v.warnings.length){box.classList.add("hidden");return}
  box.className=`validation-box ${v.errors.length?"error":""}`;
  box.innerHTML=[...v.errors.map(x=>`<div><strong>Fix:</strong> ${esc(x)}</div>`),...v.warnings.map(x=>`<div><strong>Check:</strong> ${esc(x)}</div>`)].join("");
}
function saveCurrentHole({silent=false}={}){
  readRoundHeader();let h=applySmartDefaults(currentForm());const v=validateHole(h);showValidation(v);if(v.errors.length)return false;
  state.round.holesData[state.current-1]=h;localStorage.setItem(`golfDraft:${state.user?.sub||"guest"}`,JSON.stringify(state.round));renderProgress();if(!silent)$("holeStatus").textContent="Saved";return true;
}
function loadHole(n){
  state.current=n;$("holeNumber").textContent=n;const h=state.round.holesData[n-1]||blankHole(n);
  $("par").value=h.par;$("score").value=h.score===""?h.par:h.score;$("penalty").value=h.penalty;$("holeLengthYds").value=h.holeLengthYds??"";$("teeClub").value=h.teeClub;setSegment("fairway",h.fairway);setSegment("teeQuality",h.teeQuality);
  $("teePenaltyRehit").checked=!!h.teePenaltyRehit;$("reteeClub").value=h.reteeClub||h.teeClub||"";setSegment("reteeFairway",h.reteeFairway);setSegment("reteeQuality",h.reteeQuality);$("reteeHitGreen").checked=!!h.reteeHitGreen;
  $("secondShotYds").value=h.secondShotYds??"";$("secondShotClub").value=h.secondShotClub||"";$("secondShotLie").value=h.secondShotLie||"";$("secondShotHitGreen").checked=!!h.secondShotHitGreen;
  $("approachYds").value=h.approachYds;$("approachClub").value=h.approachClub;$("approachLie").value=h.approachLie||"";setSegment("gir",h.gir);$("approachMiss").value=h.approachMiss;
  $("approachProximityFt").value=h.approachProximityFt??"";$("missLeaveYds").value=h.missLeaveYds??"";$("missLie").value=h.missLie||"";$("firstPutt").value=h.firstPutt;$("putts").value=h.putts;$("scramble").value=h.scramble;
  $("firstPuttResult").value=h.firstPuttResult||"";$("holeOut").checked=!!h.holeOut;$("notes").value=h.notes;$("holeStatus").textContent=h.saved?"Saved":"Not saved";
  $("prevHole").disabled=n===1;$("nextHole").disabled=n===state.holes;showValidation({errors:[],warnings:[]});updateConditionalFields();renderProgress();
  applyClubSuggestion("teeClub","tee",h.holeLengthYds,{force:false});applyClubSuggestion("secondShotClub","second",h.secondShotYds,{force:false});applyClubSuggestion("approachClub","approach",h.approachYds,{force:false});
}
function renderProgress(){
  $("progressDots").innerHTML=state.round.holesData.map((h,i)=>`<span class="progress-dot ${h.saved?"complete":""} ${i===state.current-1?"current":""}"></span>`).join("");
}
function updateConditionalFields(){
  const par=Number($("par").value)||4,teePenaltyRehit=$("teePenaltyRehit").checked,par5Hit=par===5&&$("secondShotHitGreen").checked,reteeHit=$("reteeHitGreen").checked;
  const penaltyN=Number($("penalty").value)||0;
  $("teePenaltyCard").classList.toggle("hidden",penaltyN<1&&selectedSegment("teeQuality")!=="Penalty"&&!teePenaltyRehit);
  $("reteeFields").classList.toggle("hidden",!teePenaltyRehit);
  if(teePenaltyRehit&&penaltyN<1)$("penalty").value=1;
  $("par5SecondShotCard").classList.toggle("hidden",par!==5||reteeHit);
  $("par5SecondHeading").textContent=teePenaltyRehit?"Par 5 — next shot after re-tee":"Par 5 — second shot";
  $("par5SecondHelp").textContent=teePenaltyRehit?"This is the next played stroke after the re-tee (normally stroke 4). It cannot create a GIR because the penalty already consumed a stroke.":"Record the ball position before shot two. If it reaches the green, no separate approach entry is needed.";
  $("secondShotHitGreenLabel").textContent=teePenaltyRehit?"Next shot after re-tee reached the green":"2nd shot reached the green";
  $("secondShotHitGreenHelp").textContent=teePenaltyRehit?"The ball is on the green, but this is not a GIR because it was reached after the regulation-stroke limit.":"For a par 5 GIR in two; the separate approach fields will be hidden.";
  $("approachCoreFields").classList.toggle("hidden",par===3||par5Hit||reteeHit);
  $("approachHeading").textContent=par===3?"Par 3 tee shot / approach":((par5Hit||reteeHit)?"Green result":"Approach");
  $("approachHelp").textContent=par===3?(teePenaltyRehit?"The original tee shot incurred a penalty. The re-tee is stroke 3; even if it reaches the green this is not a GIR.":"The tee shot is the approach. Use hole length and tee club; no duplicate approach entry is needed."):(par5Hit?(teePenaltyRehit?"The green was reached after the penalty/re-tee, so record the green result but GIR remains Miss.":"Your second shot reached the green; record GIR proximity and putting below."):(reteeHit?"The re-tee reached the green, but because it is stroke 3 after a penalty it is not a GIR.":"Capture distance, lie, club and dispersion."));
  if(par===3)setSegment("fairway","N/A");
  if(teePenaltyRehit){setSegment("gir","Miss");const hitBtn=document.querySelector('.segmented[data-target="gir"] button[data-value="Hit"]');if(hitBtn)hitBtn.disabled=true;if(reteeHit)$("approachMiss").value="Hit"}
  else{const hitBtn=document.querySelector('.segmented[data-target="gir"] button[data-value="Hit"]');if(hitBtn)hitBtn.disabled=false}
  if(par5Hit){setSegment("gir",teePenaltyRehit?"Miss":"Hit");$("approachMiss").value="Hit";$("approachYds").value="";$("approachClub").value="";$("approachLie").value=""}
  const girNow=selectedSegment("gir"),greenReached=girNow==="Hit"||$("approachMiss").value==="Hit"||par5Hit||reteeHit;
  $("girProximityWrap").classList.toggle("hidden",!greenReached);$("missLeaveWrap").classList.toggle("hidden",girNow!=="Miss"||greenReached);$("missLieWrap").classList.toggle("hidden",girNow!=="Miss"||greenReached);
  if(girNow==="Hit"){$("approachMiss").value="Hit";$("scramble").value="N/A"}
  if(greenReached&&$("approachProximityFt").value!=="")$("firstPutt").value=$("approachProximityFt").value;
  $("firstPutt").readOnly=greenReached;
  const ho=$("holeOut").checked;if(ho){$("putts").value=0;$("firstPutt").value="";$("firstPuttResult").value=""}
}


function effectiveApproach(h){
  if(Number(h.par)===3)return {distance:Number(h.holeLengthYds)||0,club:h.teeClub||"",lie:"Tee",result:h.approachMiss||"",gir:h.gir||""};
  if(Number(h.par)===5&&h.secondShotHitGreen)return {distance:Number(h.secondShotYds)||0,club:h.secondShotClub||"",lie:h.secondShotLie||"",result:"Hit",gir:"Hit"};
  return {distance:Number(h.approachYds)||0,club:h.approachClub||"",lie:h.approachLie||"",result:h.approachMiss||"",gir:h.gir||""};
}
function summary(round){
  const hs=round.holesData;const score=hs.reduce((a,h)=>a+(Number(h.score)||0),0),par=hs.reduce((a,h)=>a+(Number(h.par)||0),0);
  const fwOpp=hs.filter(h=>Number(h.par)>3).length,fw=hs.filter(h=>h.fairway==="Hit").length,fwL=hs.filter(h=>h.fairway==="L").length,fwR=hs.filter(h=>h.fairway==="R").length;
  const gir=hs.filter(h=>h.gir==="Hit").length,putts=hs.reduce((a,h)=>a+(Number(h.putts)||0),0),three=hs.filter(h=>Number(h.putts)>=3).length,pens=hs.reduce((a,h)=>a+(Number(h.penalty)||0),0);
  const scrambleOpp=hs.filter(h=>h.scramble==="Yes"||h.scramble==="No").length,scrambleMade=hs.filter(h=>h.scramble==="Yes").length;
  const tq={Good:0,Playable:0,Trouble:0,Penalty:0};hs.forEach(h=>{if(tq[h.teeQuality]!==undefined)tq[h.teeQuality]++});
  const misses={Left:0,Right:0,Short:0,Long:0};hs.forEach(h=>{const m=String(h.approachMiss||"");if(m==="Hit")return;if(m.includes("Left"))misses.Left++;if(m.includes("Right"))misses.Right++;if(m.includes("Short"))misses.Short++;if(m.includes("Long"))misses.Long++});
  const girPutts=hs.filter(h=>h.gir==="Hit"&&Number(h.firstPutt)>0).map(h=>Number(h.firstPutt)),missPutts=hs.filter(h=>h.gir==="Miss"&&Number(h.firstPutt)>0).map(h=>Number(h.firstPutt));
  return {score,par,toPar:score-par,fairways:fw,fwOpp,fwPct:fwOpp?fw/fwOpp:0,fwL,fwR,gir,girPct:gir/round.holesCount,putts,threePutts:three,penalties:pens,scrambleMade,scrambleOpp,scramblePct:scrambleOpp?scrambleMade/scrambleOpp:0,missLeft:misses.Left,missRight:misses.Right,missShort:misses.Short,missLong:misses.Long,teeGood:tq.Good,teePlayable:tq.Playable,teeTrouble:tq.Trouble,teePenalty:tq.Penalty,goodPlayablePct:round.holesCount?(tq.Good+tq.Playable)/round.holesCount:0,destructivePct:round.holesCount?(tq.Trouble+tq.Penalty)/round.holesCount:0,avgGirFirstPutt:girPutts.length?girPutts.reduce((a,b)=>a+b,0)/girPutts.length:null,avgMissFirstPutt:missPutts.length?missPutts.reduce((a,b)=>a+b,0)/missPutts.length:null};
}
function finishRound(){
  if(!saveCurrentHole({silent:true}))return;
  const problems=[];state.round.holesData.forEach(h=>{const v=validateHole(h,{finishing:true});if(v.errors.length)problems.push(`Hole ${h.hole}: ${v.errors[0]}`);if(h.score==="")problems.push(`Hole ${h.hole}: score missing`) });
  if(problems.length){showValidation({errors:problems.slice(0,5),warnings:[]});return}
  const unsaved=state.round.holesData.filter(h=>!h.saved).length;if(unsaved&& !confirm(`${unsaved} hole(s) have not been saved. Finish anyway?`))return;
  state.round.summary=summary(state.round);state.round.synced=false;state.round.syncedBackend=null;let rounds=getRounds();const old=rounds.findIndex(r=>r.id===state.round.id);if(old>=0)rounds[old]=state.round;else rounds.unshift(state.round);setRounds(rounds);localStorage.removeItem(`golfDraft:${state.user?.sub||"guest"}`);state.lastSavedId=state.round.id;renderSummary(state.round);renderHome();show("summaryView");
}
function renderSummary(round){
  const s=round.summary||summary(round);$("summaryCourse").textContent=`${round.course||"Course not entered"} • ${round.holesCount} holes • ${round.date}`;
  const vals=[["Score",`${s.score} (${s.toPar>=0?"+":""}${s.toPar})`],["Fairways",`${s.fairways}/${s.fwOpp} • ${pct(s.fwPct)}`],["GIR",`${s.gir}/${round.holesCount} • ${pct(s.girPct)}`],["Scrambling",`${s.scrambleMade}/${s.scrambleOpp} • ${pct(s.scramblePct)}`],["Putts",s.putts],["3-putts",s.threePutts],["Penalties",s.penalties],["Good + Playable",pct(s.goodPlayablePct)]];
  $("summaryStats").innerHTML=vals.map(([k,v])=>`<div class="summary-stat"><span>${k}</span><strong>${v}</strong></div>`).join("");
  const signals=[];const p18=s.penalties*18/round.holesCount;if(p18>=2)signals.push(["red",`${fmt1(p18)} penalties per 18 is the clearest scoring leak.`]);else signals.push(["green",`Penalty rate is controlled at ${fmt1(p18)} per 18.`]);
  if(s.girPct<.5)signals.push(["amber",`GIR is ${pct(s.girPct)}; approach dispersion remains an improvement area.`]);else signals.push(["green",`GIR is ${pct(s.girPct)} for this round.`]);
  if(s.scramblePct>=.5)signals.push(["green",`Scrambling at ${pct(s.scramblePct)} protected the score.`]);
  $("roundSignals").innerHTML=`<h3>Round signals</h3>${signals.map(([c,t])=>`<div class="signal ${c}">${esc(t)}</div>`).join("")}`;
  const sg=sgSummary(round);$("summarySg").innerHTML=round.sg?.enabled&&sg.complete?`<div class="signal green"><strong>SG vs ${esc(round.sg.benchmark||"Scratch")}: ${signed1(sg.vsBenchmark.total)}</strong><br><span class="muted">OTT ${signed1(sg.vsBenchmark.ott)} • APP ${signed1(sg.vsBenchmark.approach)} • ARG ${signed1(sg.vsBenchmark.around)} • PUTT ${signed1(sg.vsBenchmark.putting)} • PEN ${signed1(sg.tour.penalty)}</span></div>`:`<p class="muted">Strokes Gained details can be added now or later.</p>`;
}
function renderHome(){
  const rounds=getRounds();
  $("roundCount").textContent=rounds.length;$("unsyncedCount").textContent=rounds.filter(r=>!r.synced||r.syncedBackend!=="supabase").length;
  $("recentRounds").innerHTML=rounds.slice(0,8).map(r=>{const ss=r.summary||summary(r),ok=!!r.synced&&r.syncedBackend==="supabase",sg=sgSummary(r);return `<div class="recent-item"><div><strong>${esc(r.course||"Unnamed course")}</strong><div class="muted">${esc(r.date)} • ${r.holesCount} holes</div><div class="round-actions"><button class="mini-action" data-edit-round="${r.id}">Edit</button><button class="mini-action sg-action" data-sg-round="${r.id}">${r.sg?.enabled?(sg.complete?"SG ✓":"Complete SG"):"Add SG"}</button></div></div><div style="text-align:right"><strong>${ss.score} (${ss.toPar>=0?"+":""}${ss.toPar})</strong><div class="badge ${ok?"":"unsynced"}">${ok?"Synced":"Unsynced"}</div>${r.sg?.enabled&&sg.complete?`<div class="muted">SG ${signed1(sg.vsBenchmark.total)} vs ${esc(r.sg.benchmark||"Scratch")}</div>`:""}</div></div>`}).join("")||`<p class="muted">${state.user?"No rounds yet.":"Sign in to start your personal round history."}</p>`;
  document.querySelectorAll("[data-sg-round]").forEach(b=>b.onclick=()=>openSgRound(b.dataset.sgRound));
  document.querySelectorAll("[data-edit-round]").forEach(b=>b.onclick=()=>editSavedRound(b.dataset.editRound));
  renderAuth();
}

function dashboardCourseList(rounds){return [...new Set((rounds||[]).map(r=>String(r.course||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
function buildSgDashboard(rounds,benchmark){
  const complete=(rounds||[]).filter(r=>r.sg?.enabled&&sgSummary(r).complete),tot={ott:0,approach:0,around:0,putting:0,penalty:0,total:0,holes:0};
  for(const r of complete){const s=sgSummary(r),scale=(r.holesCount||18)/18,b=SG_BENCHMARKS[benchmark]||SG_BENCHMARKS.Scratch;tot.ott+=s.tour.ott-b.ott*scale;tot.approach+=s.tour.approach-b.approach*scale;tot.around+=s.tour.around-b.around*scale;tot.putting+=s.tour.putting-b.putting*scale;tot.penalty+=s.tour.penalty;tot.total+=s.tour.total-b.total*scale;tot.holes+=Number(r.holesCount)||0}
  const f=tot.holes?18/tot.holes:0;return {rounds:complete.length,holes:tot.holes,benchmark,ott:tot.ott*f,approach:tot.approach*f,around:tot.around*f,putting:tot.putting*f,penalty:tot.penalty*f,total:tot.total*f};
}
function buildDashboardFromRounds(rounds,source,courseFilter="",benchmark="Scratch"){
  const filtered=(rounds||[]).filter(r=>!courseFilter||String(r.course||"")===courseFilter);const holes=filtered.flatMap(r=>(r.holesData||[]).map(h=>({...h,roundId:r.id,course:r.course,date:r.date})));let d=holes.length?buildDashboardFromHoles(holes,filtered.length,source):{source,roundCount:0,holes:0,toPar18:0,fwPct:0,girPct:0,scramblePct:0,putts18:0,three18:0,penalties18:0,goodPlayablePct:0,troublePct:0,penaltyTeePct:0,distanceBands:[],puttingBands:[],priorities:[]};d.courses=dashboardCourseList(rounds);d.courseFilter=courseFilter;d.sg=buildSgDashboard(filtered,benchmark);return d;
}
function localDashboard(){return buildDashboardFromRounds(getRounds(),"Phone data",$("dashboardCourse")?.value||"",$("dashboardBenchmark")?.value||"Scratch")}
function buildDashboardFromHoles(holes,roundCount,source){
  const completed=holes.filter(h=>h.score!=="");const holesN=completed.length,scoreToPar=completed.reduce((a,h)=>a+(Number(h.score)||0)-(Number(h.par)||0),0);
  const fwOpp=completed.filter(h=>Number(h.par)>3).length,fw=completed.filter(h=>h.fairway==="Hit").length,gir=completed.filter(h=>h.gir==="Hit").length;
  const sm=completed.filter(h=>h.scramble==="Yes").length,so=completed.filter(h=>["Yes","No"].includes(h.scramble)).length,putts=completed.reduce((a,h)=>a+(Number(h.putts)||0),0),three=completed.filter(h=>Number(h.putts)>=3).length,pens=completed.reduce((a,h)=>a+(Number(h.penalty)||0),0);
  const good=completed.filter(h=>["Good","Playable"].includes(h.teeQuality)).length,trouble=completed.filter(h=>h.teeQuality==="Trouble").length,penT=completed.filter(h=>h.teeQuality==="Penalty").length;
  const bands=[{name:"≤100",min:0,max:100},{name:"101–130",min:101,max:130},{name:"131–150",min:131,max:150},{name:"151–170",min:151,max:170},{name:"171–190",min:171,max:190},{name:"191+",min:191,max:9999}].map(b=>{const x=completed.map(h=>({h,a:effectiveApproach(h)})).filter(x=>x.a.distance>=b.min&&x.a.distance<=b.max),g=x.filter(x=>x.a.gir==="Hit").length,l=x.filter(x=>String(x.a.result).includes("Left")).length,r=x.filter(x=>String(x.a.result).includes("Right")).length;return {band:b.name,shots:x.length,gir:g,girPct:x.length?g/x.length:0,left:l,right:r}});
  const puttBands=[{name:"0–3 ft",min:0,max:3},{name:"4–6 ft",min:4,max:6},{name:"7–10 ft",min:7,max:10},{name:"11–15 ft",min:11,max:15},{name:"16–25 ft",min:16,max:25},{name:"26+ ft",min:26,max:999}].map(b=>{const x=completed.filter(h=>Number(h.firstPutt)>=b.min&&Number(h.firstPutt)<=b.max&&Number(h.putts)>0),made=x.filter(h=>Number(h.putts)===1||h.firstPuttResult==="Holed").length;return {band:b.name,putts:x.length,made,makePct:x.length?made/x.length:0,threePutts:x.filter(h=>Number(h.putts)>=3).length}});
  const long=bands.find(b=>b.band==="171–190");const priorities=[];
  if(holesN&&pens*18/holesN>=1.5)priorities.push({title:"Reduce destructive tee shots",detail:`${fmt1(pens*18/holesN)} penalties per 18`,status:"red"});
  if(long&&long.shots>=3&&long.girPct<.3)priorities.push({title:"171–190 yd approach play",detail:`${pct(long.girPct)} GIR; ${long.left}L / ${long.right}R`,status:"red"});
  if(holesN&&gir/holesN<.5)priorities.push({title:"Raise overall GIR",detail:`Current GIR ${pct(gir/holesN)}`,status:"amber"});
  if(so&&sm/so>=.5)priorities.push({title:"Maintain short game",detail:`Scrambling ${pct(sm/so)}`,status:"green"});
  if(holesN&&putts*18/holesN<=31)priorities.push({title:"Maintain putting",detail:`${fmt1(putts*18/holesN)} putts per 18`,status:"green"});
  return {source,roundCount,holes:holesN,toPar18:holesN?scoreToPar*18/holesN:0,fwPct:fwOpp?fw/fwOpp:0,girPct:holesN?gir/holesN:0,scramblePct:so?sm/so:0,putts18:holesN?putts*18/holesN:0,three18:holesN?three*18/holesN:0,penalties18:holesN?pens*18/holesN:0,goodPlayablePct:holesN?good/holesN:0,troublePct:holesN?trouble/holesN:0,penaltyTeePct:holesN?penT/holesN:0,distanceBands:bands,puttingBands:puttBands,priorities};
}
async function fetchDashboard(){
  if(!state.spreadsheetId||!state.accessToken)return null;
  const values=await getValues(state.spreadsheetId,"Hole Detail!A:AD");if(values.length<2)return null;
  const headers=values[0],rows=values.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
  const holes=rows.map(r=>({par:Number(r.Par)||0,score:r.Score===""?"":Number(r.Score),holeLengthYds:r["Hole Length (yds)"],teeClub:r["Tee Club"],fairway:r.Fairway,teeQuality:r["Tee Quality"],secondShotYds:r["2nd Shot Yds"],secondShotClub:r["2nd Shot Club"],secondShotLie:r["2nd Shot Lie"],secondShotHitGreen:String(r["2nd Shot Hit Green"]).toLowerCase()==="true",approachYds:r["Approach Yds"],approachClub:r["Approach Club"],approachLie:r["Approach Lie"],gir:r.GIR,approachMiss:r["Approach Miss"],firstPutt:r["1st Putt Dist (ft)"],putts:r.Putts,scramble:r.Scramble,penalty:r.Penalty,firstPuttResult:r["First Putt Result"]}));
  return buildDashboardFromHoles(holes,new Set(rows.map(r=>r["Round ID"])).size,"Personal Google Sheet");
}
async function refreshWorkbookAnalytics(id){
  const values=await getValues(id,"Hole Detail!A:AD");
  if(values.length<2){await writeValues(id,"Master Summary!A1",[["Metric","Value"],["Rounds Logged",0],["Holes Logged",0]]);return}
  const headers=values[0],objects=values.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""]))),holes=objects.map(r=>({par:Number(r.Par)||0,score:r.Score===""?"":Number(r.Score),holeLengthYds:r["Hole Length (yds)"],teeClub:r["Tee Club"],fairway:r.Fairway,teeQuality:r["Tee Quality"],secondShotYds:r["2nd Shot Yds"],secondShotClub:r["2nd Shot Club"],secondShotLie:r["2nd Shot Lie"],secondShotHitGreen:String(r["2nd Shot Hit Green"]).toLowerCase()==="true",approachYds:r["Approach Yds"],approachClub:r["Approach Club"],approachLie:r["Approach Lie"],gir:r.GIR,approachMiss:r["Approach Miss"],firstPutt:r["1st Putt Dist (ft)"],putts:r.Putts,scramble:r.Scramble,penalty:r.Penalty,firstPuttResult:r["First Putt Result"]}));
  const d=buildDashboardFromHoles(holes,new Set(objects.map(r=>r["Round ID"])).size,"Personal Google Sheet");
  await writeValues(id,"Master Summary!A1",[["Metric","Value"],["Rounds Logged",d.roundCount],["Holes Logged",d.holes],["Score to Par / 18",d.toPar18],["Fairway %",d.fwPct],["GIR %",d.girPct],["Scrambling %",d.scramblePct],["Putts / 18",d.putts18],["3-Putts / 18",d.three18],["Penalties / 18",d.penalties18],["Good + Playable Tee %",d.goodPlayablePct],["Trouble Tee %",d.troublePct],["Penalty Tee %",d.penaltyTeePct]]);
  const priorityRows=(d.priorities||[]).map(p=>[p.title,p.detail,p.status.toUpperCase()]);
  await writeValues(id,"Scratch Dashboard!A1",[["SCRATCH PERFORMANCE DASHBOARD"],["Rounds",d.roundCount],["Holes",d.holes],["To Par / 18",d.toPar18],["Fairway %",d.fwPct],["GIR %",d.girPct],["Scrambling %",d.scramblePct],["Putts / 18",d.putts18],["Penalties / 18",d.penalties18],[],["Priority","Evidence","Status"],...priorityRows,[],["Distance Band","Shots","GIR","GIR %","Miss L","Miss R"],...d.distanceBands.map(x=>[x.band,x.shots,x.gir,x.girPct,x.left,x.right])]);
  const clubMap={};objects.forEach(r=>{const c=r["Approach Club"];if(c)(clubMap[c]||(clubMap[c]=[])).push(r)});const clubRows=Object.entries(clubMap).map(([c,x])=>{const g=x.filter(r=>r.GIR==="Hit").length;return[c,x.length,avgNum(x.map(r=>r["Approach Yds"])),g,x.length?g/x.length:0,x.filter(r=>String(r["Approach Miss"]).includes("Left")).length,x.filter(r=>String(r["Approach Miss"]).includes("Right")).length,x.filter(r=>String(r["Approach Miss"]).includes("Short")).length,x.filter(r=>String(r["Approach Miss"]).includes("Long")).length]});
  await writeValues(id,"Club & Distance Analysis!A1",[["Distance Band","Shots","GIR","GIR %","Miss Left","Miss Right"],...d.distanceBands.map(x=>[x.band,x.shots,x.gir,x.girPct,x.left,x.right]),[],["Approach Club","Shots","Avg Yds","GIR","GIR %","Miss L","Miss R","Short","Long"],...clubRows]);
  const teeMap={};objects.forEach(r=>{const c=r["Tee Club"];if(c)(teeMap[c]||(teeMap[c]=[])).push(r)});const driveRows=Object.entries(teeMap).map(([c,x])=>{const opp=x.filter(r=>Number(r.Par)>3),fw=opp.filter(r=>r.Fairway==="Hit").length,g=x.filter(r=>r["Tee Quality"]==="Good").length,p=x.filter(r=>r["Tee Quality"]==="Playable").length,t=x.filter(r=>r["Tee Quality"]==="Trouble").length,pen=x.filter(r=>r["Tee Quality"]==="Penalty").length;return[c,x.length,fw,opp.length?fw/opp.length:0,g,p,t,pen,x.length?(t+pen)/x.length:0,avgNum(x.map(r=>Number(r.Score)-Number(r.Par)))]});
  await writeValues(id,"Driving Analysis!A1",[["Tee Club","Shots","Fairways","FW %","Good","Playable","Trouble","Penalty","Destructive %","Avg Score to Par"],...driveRows]);
  await writeValues(id,"Putting Analysis!A1",[["First Putt Band","Attempts","Holed","Make %","3-Putts"],...d.puttingBands.map(x=>[x.band,x.putts,x.made,x.makePct,x.threePutts])]);
  await refreshSgWorkbookSummary(id);
}
function avgNum(xs){const a=xs.map(Number).filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function renderDashboard(d){
  if(!d){$("dashboardSource").textContent="No round data yet.";$("dashboardKpis").innerHTML="";return}
  const courseSel=$("dashboardCourse"),current=courseSel.value;courseSel.innerHTML=`<option value="">All courses</option>${(d.courses||[]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("")}`;courseSel.value=(d.courses||[]).includes(current)?current:(d.courseFilter||"");
  $("dashboardSource").textContent=`${d.source||"Data"} • ${d.roundCount||0} rounds • ${d.holes||0} holes${d.courseFilter?` • ${d.courseFilter}`:""}`;
  const kpis=[["To par / 18",`${Number(d.toPar18)>=0?"+":""}${fmt1(d.toPar18)}`],["Fairways",pct(d.fwPct)],["GIR",pct(d.girPct)],["Scrambling",pct(d.scramblePct)],["Putts / 18",fmt1(d.putts18)],["Penalties / 18",fmt1(d.penalties18)]];
  $("dashboardKpis").innerHTML=kpis.map(([k,v])=>`<div class="summary-stat"><span>${k}</span><strong>${v}</strong></div>`).join("");
  const sg=d.sg||{rounds:0};$("sgDashboardSubtitle").textContent=sg.rounds?`${sg.rounds} completed SG round${sg.rounds===1?"":"s"} • normalized per 18`:`No completed SG rounds in this selection`;
  $("sgDashboardTotal").innerHTML=sg.rounds?`<div><div class="sg-number">${signed1(sg.total)}</div><div class="muted">strokes / 18</div></div><div class="sg-label">vs ${esc(sg.benchmark)}<br>${d.courseFilter?esc(d.courseFilter):"All courses"}</div>`:`<p class="muted">Complete SG shot detail on saved rounds to populate this panel.</p>`;
  const cats=[["Off tee",sg.ott],["Approach",sg.approach],["Around green",sg.around],["Putting",sg.putting],["Penalty",sg.penalty]];$("sgDashboardCategories").innerHTML=sg.rounds?cats.map(([k,v])=>`<div class="sg-category"><span>${k}</span><strong>${signed1(v)}</strong></div>`).join(""):"";$("sgDashboardNote").textContent=sg.rounds?"Positive numbers mean strokes gained against the selected benchmark; negative numbers mean strokes lost.":"";
  $("priorityList").innerHTML=(d.priorities||[]).map((p,i)=>`<div class="priority-item"><span class="priority-rank">${i+1}</span><div class="priority-text"><strong>${esc(p.title)}</strong><small>${esc(p.detail)}</small></div><span class="priority-status ${p.status}">${p.status==="red"?"Priority":p.status==="amber"?"Develop":"Maintain"}</span></div>`).join("")||`<p class="muted">More rounds are needed before priorities can be ranked.</p>`;
  const dm=[["Good + Playable",pct(d.goodPlayablePct)],["Trouble",pct(d.troublePct)],["Penalty tee quality",pct(d.penaltyTeePct)],["Penalties / 18",fmt1(d.penalties18)]];$("drivingMetrics").innerHTML=dm.map(([a,b])=>`<div class="metric-row"><span>${a}</span><strong>${b}</strong></div>`).join("");
  $("distanceAnalysis").innerHTML=`<table><thead><tr><th>Distance</th><th>Shots</th><th>GIR</th><th>GIR%</th><th>L</th><th>R</th></tr></thead><tbody>${(d.distanceBands||[]).map(x=>`<tr><td>${esc(x.band)}</td><td>${x.shots}</td><td>${x.gir}</td><td>${pct(x.girPct)}</td><td>${x.left}</td><td>${x.right}</td></tr>`).join("")}</tbody></table>`;
  $("puttingAnalysis").innerHTML=`<table><thead><tr><th>1st putt</th><th>N</th><th>Made</th><th>Make%</th><th>3P</th></tr></thead><tbody>${(d.puttingBands||[]).map(x=>`<tr><td>${esc(x.band)}</td><td>${x.putts}</td><td>${x.made}</td><td>${pct(x.makePct)}</td><td>${x.threePutts}</td></tr>`).join("")}</tbody></table>`;
}
async function refreshDashboardView(){try{const remote=await fetchDashboard();renderDashboard(remote||localDashboard())}catch(e){renderDashboard(localDashboard());$("dashboardSource").textContent+=` • cloud refresh unavailable`}}
async function openDashboard(){show("dashboardView");renderDashboard(localDashboard());await refreshDashboardView()}


function signed1(n){n=Number(n)||0;return `${n>=0?"+":""}${n.toFixed(1)}`}
function interp(points,x){x=Math.max(0,Number(x)||0);if(x<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++){if(x<=points[i][0]){const[a,av]=points[i-1],[b,bv]=points[i];return av+(bv-av)*(x-a)/(b-a)}}const[a,av]=points[points.length-2],[b,bv]=points[points.length-1];return bv+(bv-av)*(x-b)/(b-a)}
function expectedStrokes(lie,distance){if(lie==="Penalty")return null;const table=EXPECTED[lie]||EXPECTED.Rough;return interp(table,Number(distance)||0)}
function sgCategory(shot,index,hole){if(shot.lie==="Penalty")return "penalty";if(shot.lie==="Green")return "putting";if(Number(hole.par)>3&&shot.lie==="Tee")return "ott";const yd=shot.unit==="ft"?(Number(shot.distance)||0)/3:Number(shot.distance)||0;return yd<=50?"around":"approach"}
function calculateHoleSg(hole,sgHole){const shots=sgHole?.shots||[];const out=[];for(let i=0;i<shots.length;i++){const sh=shots[i],cat=sgCategory(sh,i,hole);let sg;if(sh.lie==="Penalty")sg=-1;else{const start=expectedStrokes(sh.lie,sh.distance);let j=i+1;while(j<shots.length&&shots[j].lie==="Penalty")j++;const next=shots[j];const end=next?expectedStrokes(next.lie,next.distance):0;sg=start-end-1}out.push({...sh,category:cat,sg:Number.isFinite(sg)?sg:0})}return out}
function sgSummary(round){const cats={ott:0,approach:0,around:0,putting:0,penalty:0,total:0},missing=[];if(!round.sg?.enabled)return {complete:false,tour:cats,vsBenchmark:{...cats},missing:["SG not enabled"]};
  for(const h of round.holesData||[]){const sh=round.sg.holes?.[h.hole]?.shots||[],requiredPen=Math.max(0,Number(h.penalty)||0),actualPen=sh.filter(x=>x.lie==="Penalty").length;if(!h.score||sh.length!==Number(h.score)||actualPen!==requiredPen||sh.some(x=>x.lie!=="Penalty"&&(x.distance===""||!x.lie))||sh.some(x=>x.lie==="Penalty"&&(x.penaltyAfterStroke===""||x.penaltyAfterStroke==null)))missing.push(h.hole);calculateHoleSg(h,round.sg.holes?.[h.hole]).forEach(x=>{cats[x.category]+=x.sg;cats.total+=x.sg})}
  const b=SG_BENCHMARKS[round.sg.benchmark||"Scratch"]||SG_BENCHMARKS.Scratch,scale=(round.holesCount||18)/18;const vs={};["ott","approach","around","putting"].forEach(k=>vs[k]=cats[k]-b[k]*scale);vs.penalty=cats.penalty;vs.total=cats.total-b.total*scale;return {complete:missing.length===0,tour:cats,vsBenchmark:vs,missing,benchmark:b};
}
function seedSgHole(round,h){
  const total=Math.max(0,Number(h.score)||0),penalties=Math.min(total,Math.max(0,Number(h.penalty)||0)),physical=Math.max(0,total-penalties),states=Array.from({length:physical},()=>({lie:"",distance:"",unit:"yd",club:""}));if(!total)return {shots:[]};
  if(physical>0)states[0]={lie:"Tee",distance:h.holeLengthYds||"",unit:"yd",club:h.teeClub||""};
  let idx=1;
  if(h.teePenaltyRehit&&physical>idx){states[idx++]={lie:"Tee",distance:h.holeLengthYds||"",unit:"yd",club:h.reteeClub||h.teeClub||""}}
  if(Number(h.par)===5&&!h.reteeHitGreen&&physical>idx&&h.secondShotYds!==""){states[idx++]={lie:h.secondShotLie||"Fairway",distance:h.secondShotYds,unit:"yd",club:h.secondShotClub||""};if(!h.secondShotHitGreen&&physical>idx&&h.approachYds!=="")states[idx++]={lie:h.approachLie||"Fairway",distance:h.approachYds,unit:"yd",club:h.approachClub||""}}
  else if(Number(h.par)>3&&!h.reteeHitGreen&&physical>idx&&h.approachYds!==""){states[idx++]={lie:h.approachLie||"Fairway",distance:h.approachYds,unit:"yd",club:h.approachClub||""}}
  const greenReached=h.gir==="Hit"||h.approachMiss==="Hit"||h.secondShotHitGreen||h.reteeHitGreen;
  if(greenReached&&Number(h.firstPutt)>0&&idx<physical){states[idx++]={lie:"Green",distance:Number(h.firstPutt),unit:"ft",club:"Putter"}}
  else if(h.gir==="Miss"&&h.missLeaveYds!==""&&idx<physical){states[idx++]={lie:h.missLie||"",distance:h.missLeaveYds,unit:"yd",club:""};if(Number(h.firstPutt)>0&&idx<physical)states[idx++]={lie:"Green",distance:Number(h.firstPutt),unit:"ft",club:"Putter"}}
  let firstGreen=states.findIndex(x=>x.lie==="Green");if(firstGreen>=0)for(let i=firstGreen+1;i<physical;i++)if(!states[i].lie)states[i]={lie:"Green",distance:"",unit:"ft",club:"Putter"};
  const shots=[...states];for(let p=0;p<penalties;p++)shots.push({lie:"Penalty",distance:"",unit:"yd",club:"",penaltyAfterStroke:"",penaltyMode:"drop"});
  while(shots.length<total)shots.push({lie:"",distance:"",unit:"yd",club:""});
  if(h.teePenaltyRehit&&penalties>0&&shots.length>=3){const pi=shots.findIndex(x=>x.lie==="Penalty");if(pi>=0){const [pen]=shots.splice(pi,1);pen.penaltyAfterStroke=1;pen.penaltyMode="replay";shots.splice(1,0,pen)}if(shots[2]&&shots[2].lie!=="Penalty"){shots[2].lie="Tee";shots[2].distance=h.holeLengthYds||shots[2].distance;shots[2].unit="yd";shots[2].club=h.reteeClub||h.teeClub||shots[2].club}}
  return {shots:shots.slice(0,total)};
}
function movePenaltyAfter(data,penIndex,targetIndex,mode){
  if(penIndex<0||targetIndex<0)return;const shots=data.shots;const pen={...shots[penIndex],lie:"Penalty",penaltyMode:mode||shots[penIndex].penaltyMode||"drop"};shots.splice(penIndex,1);let adjusted=targetIndex;if(penIndex<targetIndex)adjusted--;const insertAt=Math.min(adjusted+1,shots.length);shots.splice(insertAt,0,pen);const p=insertAt,prev=shots[p-1],next=shots[p+1];pen.penaltyAfterStroke=p; // stroke number of preceding played stroke equals array index here
  if(pen.penaltyMode==="replay"&&prev&&next&&next.lie!=="Penalty"){next.lie=prev.lie;next.distance=prev.distance;next.unit=prev.unit;next.club=prev.club}
}
function normalizePenaltyRows(h,data){
  const total=Math.max(0,Number(h.score)||0),need=Math.max(0,Number(h.penalty)||0);data=data||{shots:[]};let shots=(data.shots||[]).map(x=>({...x})),have=shots.filter(x=>x.lie==="Penalty").length;
  if(have<need){for(let n=have;n<need;n++)shots.push({lie:"Penalty",distance:"",unit:"yd",club:"",penaltyAfterStroke:"",penaltyMode:"drop"})}
  if(have>need){let remove=have-need;shots=shots.filter(x=>{if(remove>0&&x.lie==="Penalty"){remove--;return false}return true})}
  while(shots.length>total){let i=shots.map((x,i)=>({x,i})).reverse().find(o=>o.x.lie!=="Penalty"&&!o.x.lie)?.i;if(i==null)i=shots.length-1;shots.splice(i,1)}
  while(shots.length<total)shots.push({lie:"",distance:"",unit:"yd",club:""});
  shots.forEach(sh=>{if(sh.lie==="Penalty"){sh.distance="";sh.club="";sh.unit="yd";sh.penaltyMode=sh.penaltyMode||"drop";if(sh.penaltyAfterStroke===undefined)sh.penaltyAfterStroke=""}});
  if(h.teePenaltyRehit&&total>=3){let p=shots.findIndex(x=>x.lie==="Penalty");if(p>=0){shots[p].penaltyAfterStroke=1;shots[p].penaltyMode="replay";if(p!==1){const [pen]=shots.splice(p,1);shots.splice(1,0,pen)}}if(shots[2]&&shots[2].lie!=="Penalty"){shots[2].lie="Tee";shots[2].distance=h.holeLengthYds||shots[2].distance;shots[2].unit="yd";shots[2].club=h.reteeClub||h.teeClub||shots[2].club}}
  data.shots=shots;return data;
}
function ensureSg(round){round.sg=round.sg||{enabled:true,benchmark:"Scratch",holes:{}};round.sg.enabled=true;round.sg.benchmark=round.sg.benchmark||"Scratch";round.sg.holes=round.sg.holes||{};(round.holesData||[]).forEach(h=>{if(!round.sg.holes[h.hole])round.sg.holes[h.hole]=seedSgHole(round,h);else round.sg.holes[h.hole]=normalizePenaltyRows(h,round.sg.holes[h.hole])});return round.sg}
function openSgRound(id){const r=getRounds().find(x=>x.id===id);if(!r)return;ensureSg(r);state.sgRound=r;state.sgRoundIsDraft=false;state.sgReturnView="homeView";state.sgHole=1;$("sgBenchmark").value=r.sg.benchmark||"Scratch";renderSgHole();renderSgHeader();show("sgView")}
function openSgDuringRound(){if(!state.round)return;if(!saveCurrentHole({silent:true}))return;ensureSg(state.round);state.sgRound=state.round;state.sgRoundIsDraft=true;state.sgReturnView="roundView";state.sgHole=state.current;$("sgBenchmark").value=state.round.sg.benchmark||"Scratch";renderSgHole();renderSgHeader();show("sgView")}
function renderSgHeader(){const r=state.sgRound,s=sgSummary(r);$("sgRoundTitle").textContent=`${r.course||"Unnamed course"} • ${r.date}`;$("sgStatus").textContent=s.complete?`Complete • SG ${signed1(s.vsBenchmark.total)} vs ${r.sg.benchmark}`:`Needs detail on ${s.missing.length} hole(s)`;$("sgPrevHole").disabled=state.sgHole===1;$("sgNextHole").disabled=state.sgHole===r.holesCount}
function renderSgHole(){const r=state.sgRound,h=r.holesData[state.sgHole-1],data=r.sg.holes[h.hole]||seedSgHole(r,h);r.sg.holes[h.hole]=data;$("sgHoleNumber").textContent=h.hole;data.shots=normalizePenaltyRows(h,data).shots;$("sgHoleMeta").textContent=`Par ${h.par} • Score ${h.score} • ${Math.max(0,Number(h.score)-Number(h.penalty||0))} played + ${Number(h.penalty||0)} penalty`;
  $("sgShotList").innerHTML=data.shots.map((sh,i)=>{const unit=sh.lie==="Green"?"ft":"yd";sh.unit=unit;if(sh.lie==="Penalty"){const opts=data.shots.map((x,j)=>x.lie!=="Penalty"&&j<i?`<option value="${j}" ${Number(sh.penaltyAfterStroke)===j+1?"selected":""}>After stroke ${j+1}</option>`:"").join("");return `<div class="sg-shot-row penalty-row"><div class="sg-shot-label"><strong>${i+1}</strong><span>Penalty stroke</span></div><span class="penalty-pill">+1 penalty stroke</span><div class="penalty-tools"><div class="grid2"><div class="field"><label>Penalty occurred after</label><select data-penalty-after="${i}"><option value="">Choose stroke</option>${opts}</select></div><div class="field"><label>Next stroke</label><select data-penalty-mode="${i}"><option value="replay" ${sh.penaltyMode==="replay"?"selected":""}>Replay previous position</option><option value="drop" ${sh.penaltyMode!=="replay"?"selected":""}>Penalty drop / continue</option></select></div></div><p class="penalty-help">Use Replay for lost ball/OB/stroke-and-distance. Use Drop for a penalty-area or other relief position.</p></div></div>`}
    return `<div class="sg-shot-row"><div class="sg-shot-label"><strong>${i+1}</strong><span>${esc(sgCategory(sh,i,h).replace("ott","Off tee").replace("approach","Approach").replace("around","Around green").replace("putting","Putting"))}</span></div><div class="grid2"><div class="field"><label>Start lie</label><select data-sg-lie="${i}">${["",...SG_LIES.filter(x=>x!=="Penalty")].map(x=>`<option ${x===sh.lie?"selected":""}>${x}</option>`).join("")}</select></div><div class="field"><label>Distance to hole (${unit})</label><input data-sg-distance="${i}" type="number" inputmode="decimal" value="${sh.distance??""}"></div></div><div class="field"><label>Club (optional)</label><select data-sg-club="${i}">${CLUBS.map(c=>`<option ${c===sh.club?"selected":""}>${c}</option>`).join("")}</select></div>${Number(h.penalty)>0?`<button class="penalty-action" data-place-penalty="${i}">Place / move penalty after stroke ${i+1}</button>`:""}</div>`}).join("");
  document.querySelectorAll("[data-sg-lie]").forEach(el=>el.onchange=()=>{const i=Number(el.dataset.sgLie),sh=data.shots[i];sh.lie=el.value;sh.unit=sh.lie==="Green"?"ft":"yd";renderSgHole();renderSgHeader()});document.querySelectorAll("[data-sg-distance]").forEach(el=>el.oninput=()=>{data.shots[Number(el.dataset.sgDistance)].distance=el.value===""?"":Number(el.value);renderSgHeader()});document.querySelectorAll("[data-sg-club]").forEach(el=>el.onchange=()=>data.shots[Number(el.dataset.sgClub)].club=el.value);
  document.querySelectorAll("[data-place-penalty]").forEach(el=>el.onclick=()=>{const target=Number(el.dataset.placePenalty),unplaced=data.shots.findIndex(x=>x.lie==="Penalty"&&(x.penaltyAfterStroke===""||x.penaltyAfterStroke==null)),p=unplaced>=0?unplaced:data.shots.findIndex(x=>x.lie==="Penalty");if(p<0)return;movePenaltyAfter(data,p,target,data.shots[p].penaltyMode||"drop");renderSgHole();renderSgHeader()});
  document.querySelectorAll("[data-penalty-after]").forEach(el=>el.onchange=()=>{if(el.value==="")return;const p=Number(el.dataset.penaltyAfter),target=Number(el.value),mode=data.shots[p]?.penaltyMode||"drop";movePenaltyAfter(data,p,target,mode);renderSgHole();renderSgHeader()});
  document.querySelectorAll("[data-penalty-mode]").forEach(el=>el.onchange=()=>{const p=Number(el.dataset.penaltyMode),pen=data.shots[p];pen.penaltyMode=el.value;const prev=data.shots[p-1],next=data.shots[p+1];if(el.value==="replay"&&prev&&next&&next.lie!=="Penalty"){next.lie=prev.lie;next.distance=prev.distance;next.unit=prev.unit;next.club=prev.club}renderSgHole();renderSgHeader()});
  const calc=calculateHoleSg(h,data),total=calc.reduce((a,x)=>a+x.sg,0);$("sgHoleResult").innerHTML=`<strong>SG vs Tour: ${signed1(total)}</strong><div class="muted">${calc.map((x,i)=>`#${i+1} ${x.category==="penalty"?"Penalty ":""}${signed1(x.sg)}`).join(" • ")}</div>`;
}
function reconcileGirFromSg(round){
  for(const h of round.holesData||[]){const shots=round.sg?.holes?.[h.hole]?.shots||[],firstGreen=shots.findIndex(x=>x.lie==="Green");if(firstGreen>0){const reachedGreenOnStroke=firstGreen,limit=Math.max(1,Number(h.par)-2);h.gir=reachedGreenOnStroke<=limit?"Hit":"Miss"}}
  round.summary=summary(round);return round;
}
function saveSgRound({silent=false}={}){const r=state.sgRound;reconcileGirFromSg(r);r.sg.benchmark=$("sgBenchmark").value;r.sg.updatedAt=new Date().toISOString();r.synced=false;r.syncedSpreadsheetId=null;if(state.sgRoundIsDraft){state.round=r;localStorage.setItem(`golfDraft:${state.user?.sub||"guest"}`,JSON.stringify(r))}else{let rounds=getRounds(),i=rounds.findIndex(x=>x.id===r.id);if(i>=0)rounds[i]=r;setRounds(rounds);state.lastSavedId=r.id;renderHome()}renderSgHeader();if(!silent)alert("Strokes Gained details saved. You can return and add or change them at any time.")}
function editSavedRound(id){const r=getRounds().find(x=>x.id===id);if(!r)return;state.round=JSON.parse(JSON.stringify(r));state.holes=r.holesCount;state.current=1;state.round.holesData=state.round.holesData.map((h,i)=>({...blankHole(i+1),...h}));$("roundDate").value=r.date;refreshCourseSelect(r.course);state.selectedTee=roundTee(r);setTeeButton("data-tee",state.selectedTee);$("holesCount").value=r.holesCount;$("roundPar").value=r.roundPar||r.holesData.reduce((a,h)=>a+Number(h.par||0),0);loadHole(1);show("roundView")}
function sgShotRows(r){if(!r.sg?.enabled)return[];const rows=[];(r.holesData||[]).forEach(h=>calculateHoleSg(h,r.sg.holes?.[h.hole]).forEach((sh,i)=>rows.push([r.id,r.date,r.course,h.hole,i+1,sh.lie,sh.distance,sh.unit,sh.club,sh.category,sh.sg,new Date().toISOString(),r.sg.benchmark||"Scratch"])));return rows}
function renderSgSummaryCard(round){const s=sgSummary(round);return s.complete?`SG ${signed1(s.vsBenchmark.total)} vs ${esc(round.sg.benchmark)}`:`SG incomplete`}
async function refreshSgWorkbookSummary(id){
  const rv=await getValues(id,"Rounds!A:AK"),sv=await getValues(id,"SG Shot Detail!A:M");
  const rows=rv.length>1?rv.slice(1):[],roundMeta={};rows.forEach(r=>{if(r[0])roundMeta[r[0]]={date:r[1]||"",course:r[2]||"",holes:Number(r[3])||18,enabled:String(r[33]).toLowerCase()==="true",benchmark:r[34]||"Scratch",complete:String(r[35]).toLowerCase()==="true"}});
  const groups={};if(sv.length>1)sv.slice(1).forEach(r=>{const id0=r[0];if(!id0)return;const g=groups[id0]||(groups[id0]={ott:0,approach:0,around:0,putting:0,penalty:0,total:0,benchmark:r[12]||roundMeta[id0]?.benchmark||"Scratch"});const cat=r[9]||"approach",val=Number(r[10])||0;if(g[cat]!==undefined)g[cat]+=val;g.total+=val});
  const out=[["Round ID","Date","Course","Benchmark","Complete","SG vs Tour","SG vs Benchmark","Off Tee vs Benchmark","Approach vs Benchmark","Around Green vs Benchmark","Putting vs Benchmark","Penalty SG"]];
  Object.entries(roundMeta).filter(([,m])=>m.enabled).forEach(([rid,m])=>{const g=groups[rid]||{ott:0,approach:0,around:0,putting:0,penalty:0,total:0,benchmark:m.benchmark},b=SG_BENCHMARKS[m.benchmark]||SG_BENCHMARKS.Scratch,scale=m.holes/18;out.push([rid,m.date,m.course,m.benchmark,m.complete,g.total,g.total-b.total*scale,g.ott-b.ott*scale,g.approach-b.approach*scale,g.around-b.around*scale,g.putting-b.putting*scale,g.penalty])});
  await writeValues(id,"Strokes Gained Summary!A1",out)
}

// v6 Supabase persistence -------------------------------------------------------
async function loadRoundsFromDatabase(){
  if(!state.supabase||!state.user)return;
  const {data,error}=await state.supabase.from("rounds").select("id,raw,updated_at").order("date",{ascending:false}).order("created_at",{ascending:false});
  if(error)throw error;
  const cloud=(data||[]).map(x=>({...x.raw,synced:true,syncedBackend:"supabase",dbUpdatedAt:x.updated_at}));
  const local=getRounds();const map=new Map(cloud.map(r=>[r.id,r]));
  for(const r of local){if(!r.synced||r.syncedBackend!=="supabase")map.set(r.id,r)}
  setRounds([...map.values()].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))));
}
function dbRoundRow(r){const sm=r.summary||summary(r);return {id:r.id,user_id:state.user.sub,date:r.date||null,course:r.course||"",holes_count:Number(r.holesCount)||0,round_par:Number(r.roundPar)||0,score:Number(sm.score)||0,to_par:Number(sm.toPar)||0,sg_enabled:!!r.sg?.enabled,sg_benchmark:r.sg?.benchmark||"Scratch",raw:r,updated_at:new Date().toISOString()}}
function dbHoleRows(r){return (r.holesData||[]).map(h=>({round_id:r.id,hole_number:Number(h.hole),user_id:state.user.sub,par:Number(h.par)||0,score:h.score===""?null:Number(h.score),penalty:Number(h.penalty)||0,tee_club:h.teeClub||null,fairway:h.fairway||null,tee_quality:h.teeQuality||null,gir:h.gir||null,putts:h.putts===""?null:Number(h.putts),raw:h}))}
function dbShotRows(r){const rows=[];if(!r.sg?.enabled)return rows;for(const h of r.holesData||[]){calculateHoleSg(h,r.sg.holes?.[h.hole]).forEach((sh,i)=>rows.push({round_id:r.id,hole_number:Number(h.hole),shot_number:i+1,user_id:state.user.sub,start_lie:sh.lie||null,distance:sh.distance===""?null:Number(sh.distance),unit:sh.unit||"yd",club:sh.club||null,category:sh.category||null,sg_vs_tour:Number(sh.sg)||0,is_penalty:sh.lie==="Penalty",raw:sh}))}return rows}
async function syncOne(round,{refresh=true}={}){
  if(!state.supabase||!state.user)throw new Error("Sign in to the cloud database first.");
  let q=await state.supabase.from("rounds").upsert(dbRoundRow(round),{onConflict:"id"});if(q.error)throw q.error;
  q=await state.supabase.from("holes").delete().eq("round_id",round.id);if(q.error)throw q.error;
  const hr=dbHoleRows(round);if(hr.length){q=await state.supabase.from("holes").insert(hr);if(q.error)throw q.error}
  q=await state.supabase.from("shots").delete().eq("round_id",round.id);if(q.error)throw q.error;
  const sr=dbShotRows(round);if(sr.length){q=await state.supabase.from("shots").insert(sr);if(q.error)throw q.error}
  let rounds=getRounds(),i=rounds.findIndex(r=>r.id===round.id);if(i>=0){rounds[i]={...rounds[i],synced:true,syncedBackend:"supabase",syncedAt:new Date().toISOString()};setRounds(rounds)}
  refreshCourseSelect(round.course);
  return {ok:true,id:round.id};
}
async function syncAll({silent=false}={}){
  if(!state.user||!state.supabase){if(!silent)alert("Sign in to the cloud database first.");return}
  const pending=getRounds().filter(r=>!r.synced||r.syncedBackend!=="supabase");if(!pending.length){if(!silent)alert("Everything is already saved to the cloud database.");return}
  for(const r of pending)await syncOne(r,{refresh:false});renderHome();if(!silent)alert(`${pending.length} round(s) saved to the cloud database.`)
}
async function fetchDashboard(){
  if(!state.supabase||!state.user)return null;
  const {data,error}=await state.supabase.from("rounds").select("raw").order("date",{ascending:false});if(error)throw error;
  const rounds=(data||[]).map(x=>x.raw).filter(Boolean);return buildDashboardFromRounds(rounds,"Cloud database",$("dashboardCourse")?.value||"",$("dashboardBenchmark")?.value||"Scratch");
}
async function exportAllToGoogleSheets(){
  if(!state.accessToken){requestGoogleAccess({selectAccount:true});return}
  await ensureUserSpreadsheet();for(const r of getRounds())await exportOneToSheet(r,{refresh:false});await refreshWorkbookAnalytics(state.spreadsheetId);await refreshSgWorkbookSummary(state.spreadsheetId);alert("Google Sheets export refreshed from the app data.")
}
async function exportOneToSheet(round,{refresh=true}={}){await ensureUserSpreadsheet();await upsertByRoundId(state.spreadsheetId,"Rounds",ROUND_HEADERS,roundRow(round),round.id);await upsertHoleRows(state.spreadsheetId,round);await syncSgRows(state.spreadsheetId,round);if(refresh){await refreshWorkbookAnalytics(state.spreadsheetId);await refreshSgWorkbookSummary(state.spreadsheetId)}}

// Events
document.querySelectorAll("[data-holes]").forEach(b=>b.addEventListener("click",()=>startRoundGuarded(Number(b.dataset.holes))));
document.querySelectorAll(".segmented button").forEach(b=>b.addEventListener("click",()=>{b.parentElement.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");updateConditionalFields()}));
document.querySelectorAll("[data-club-step]").forEach(b=>b.addEventListener("click",()=>stepClub(b.dataset.clubStep,Number(b.dataset.dir))));
document.querySelectorAll("[data-tee]").forEach(b=>b.addEventListener("click",()=>{state.selectedTee=b.dataset.tee;setTeeButton("data-tee",state.selectedTee);applyCourseProfileToRound({force:false})}));
document.querySelectorAll("[data-library-tee]").forEach(b=>b.addEventListener("click",()=>{state.libraryTee=b.dataset.libraryTee;setTeeButton("data-library-tee",state.libraryTee);renderCourseHoleEditor()}));
$("course").addEventListener("change",()=>{if($("course").value==="__new__"){state.courseReturnView="roundView";show("courseLibraryView");$("libraryCourseName").focus();return}if(state.round){state.round.course=$("course").value;applyCourseProfileToRound({force:false})}});
$("addCourseQuick").onclick=()=>{state.courseReturnView="roundView";show("courseLibraryView");$("libraryCourseName").value="";renderCourseHoleEditor()};
$("parMinus").onclick=()=>adjustPar(-1);$("parPlus").onclick=()=>adjustPar(1);$("scoreMinus").onclick=()=>adjustScore(-1);$("scorePlus").onclick=()=>adjustScore(1);
$("holeLengthYds").addEventListener("change",()=>applyClubSuggestion("teeClub","tee",$("holeLengthYds").value,{force:false}));
$("secondShotYds").addEventListener("change",()=>applyClubSuggestion("secondShotClub","second",$("secondShotYds").value,{force:true}));
$("approachYds").addEventListener("change",()=>applyClubSuggestion("approachClub","approach",$("approachYds").value,{force:true}));
$("par").addEventListener("change",updateConditionalFields);
$("penalty").addEventListener("input",updateConditionalFields);
$("teePenaltyRehit").addEventListener("change",()=>{if($("teePenaltyRehit").checked&&Number($("penalty").value)<1)$("penalty").value=1;updateConditionalFields()});
$("reteeHitGreen").addEventListener("change",updateConditionalFields);
$("secondShotHitGreen").addEventListener("change",updateConditionalFields);
$("putts").addEventListener("change",()=>{const p=Number($("putts").value);if(p===1)$("firstPuttResult").value="Holed";if(p>=2&&$("firstPuttResult").value==="Holed")$("firstPuttResult").value=""});
$("holeOut").addEventListener("change",updateConditionalFields);
$("approachMiss").addEventListener("change",updateConditionalFields);
$("approachProximityFt").addEventListener("input",()=>{if(selectedSegment("gir")==="Hit"||$("approachMiss").value==="Hit")$("firstPutt").value=$("approachProximityFt").value});
$("prevHole").onclick=()=>{if(saveCurrentHole()&&state.current>1){loadHole(state.current-1);window.scrollTo({top:0,behavior:"smooth"})}};
$("nextHole").onclick=()=>{if(saveCurrentHole()&&state.current<state.holes){loadHole(state.current+1);window.scrollTo({top:0,behavior:"smooth"})}};
$("saveHole").onclick=()=>{if(saveCurrentHole()&&state.current<state.holes){loadHole(state.current+1);window.scrollTo({top:0,behavior:"smooth"})}else if(state.current===state.holes)alert("Final hole saved. Tap Finish round when ready.")};
$("finishRound").onclick=finishRound;
$("cancelRound").onclick=()=>{if(confirm("Cancel this round? The current draft will be removed.")){localStorage.removeItem(`golfDraft:${state.user?.sub||"guest"}`);show("homeView")}};
$("backHome").onclick=()=>{renderHome();show("homeView")};
$("googleSignIn").onclick=requestDatabaseSignIn;
$("googleReconnect").onclick=()=>requestGoogleAccess({selectAccount:true});
$("switchAccount").onclick=databaseSignOut;
$("openSpreadsheet").onclick=async()=>{try{if(state.spreadsheetUrl)window.open(state.spreadsheetUrl,"_blank");else await exportAllToGoogleSheets()}catch(e){alert(e.message)}};
$("syncBtn").onclick=()=>syncAll().catch(e=>alert(e.message));
$("syncRound").onclick=async()=>{try{const r=getRounds().find(x=>x.id===state.lastSavedId);if(r){await syncOne(r);renderHome();alert("Round saved to the cloud database.")}}catch(e){alert(e.message)}};
$("addSgFromSummary").onclick=()=>{const id=state.lastSavedId||state.round?.id;if(id)openSgRound(id)};$("sgDuringRound").onclick=openSgDuringRound;
$("sgBack").onclick=()=>{saveSgRound({silent:true});if(state.sgReturnView==="roundView"){loadHole(state.current);show("roundView")}else{renderHome();show("homeView")}};$("sgSave").onclick=saveSgRound;$("sgSaveBottom").onclick=saveSgRound;$("sgBenchmark").onchange=()=>{state.sgRound.sg.benchmark=$("sgBenchmark").value;renderSgHeader();renderSgHole()};$("sgPrevHole").onclick=()=>{if(state.sgHole>1){state.sgHole--;renderSgHole();renderSgHeader()}};$("sgNextHole").onclick=()=>{if(state.sgHole<state.sgRound.holesCount){state.sgHole++;renderSgHole();renderSgHeader()}};
$("openDashboard").onclick=openDashboard;$("openCourseLibrary").onclick=()=>{state.courseReturnView="homeView";state.libraryTee="White";setTeeButton("data-library-tee",state.libraryTee);renderCourseHoleEditor();renderSavedCourseProfiles();show("courseLibraryView")};$("courseLibraryBack").onclick=()=>{refreshCourseSelect(state.round?.course||"");show(state.courseReturnView||"homeView")};$("libraryHoles").onchange=renderCourseHoleEditor;$("libraryCourseName").addEventListener("change",renderCourseHoleEditor);$("saveCourseProfile").onclick=saveCourseFromEditor;$("importCourseCsv").onclick=importCourseCsv;$("downloadCourseTemplate").onclick=downloadCourseTemplate;$("savedCourseProfiles").addEventListener("click",e=>{const b=e.target.closest("[data-edit-course]");if(!b)return;$("libraryCourseName").value=b.dataset.editCourse;state.libraryTee=b.dataset.editTee;setTeeButton("data-library-tee",state.libraryTee);const p=mergedCourseProfiles().find(x=>profileKey(x.name,x.tee_color)===profileKey(b.dataset.editCourse,b.dataset.editTee));if(p)$("libraryHoles").value=p.holes_count;renderCourseHoleEditor();window.scrollTo({top:0,behavior:"smooth"})});
$("openDashboard").onclick=openDashboard;$("dashboardBack").onclick=()=>{renderHome();show("homeView")};$("refreshDashboard").onclick=refreshDashboardView;$("dashboardCourse").onchange=refreshDashboardView;$("dashboardBenchmark").onchange=refreshDashboardView;

populateClubs();setTeeButton("data-tee",state.selectedTee);setTeeButton("data-library-tee",state.libraryTee);renderCourseHoleEditor();refreshCourseSelect();
renderHome();initGoogleAuth();initV6Auth();
const draftKey=()=>`golfDraft:${state.user?.sub||"guest"}`;
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js");
