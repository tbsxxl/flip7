/* app.js */
/* ---------- Helpers ---------- */
const $ = (id)=>document.getElementById(id);
function vib(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
function lockScroll(lock){ document.body.style.overflow = lock ? "hidden" : ""; }
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* iOS keyboard vh fix */
function setVh(){
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", vh + "px");
}
setVh();
window.addEventListener("resize", setVh, {passive:true});
window.addEventListener("orientationchange", setVh, {passive:true});

/* Top/bottom bar alpha changes with scroll */
function updateBarAlpha(){
  const y = window.scrollY || 0;
  const a = Math.max(0.86, 0.94 - (y/120)*0.08);
  document.documentElement.style.setProperty("--barAlpha", a.toFixed(3));
}
updateBarAlpha();
window.addEventListener("scroll", updateBarAlpha, {passive:true});

/* Haptik */
const HAPT = {
  finish:18,
  bust:28,
  win:40,
  sheetOpen:12,
  sheetSnap:10,
  delete:18,
  fx:12
};

/* Number colors */
const numStyle = {
  0: { bg:"linear-gradient(135deg,#0cb5be 0%,#0cb5be 20%,#e70200 20%,#e70200 40%,#c2549b 40%,#c2549b 60%,#fd8803 60%,#fd8803 80%,#ffffff 80%,#ffffff 100%)", fg:"#0b1220" },
  1: { bg:"#cbb59e" },
  2: { bg:"#dce100" },
  3: { bg:"#f14355", fg:"#fff" },
  4: { bg:"#0cb5be", fg:"#fff" },
  5: { bg:"#329a4c", fg:"#fff" },
  6: { bg:"#c2549b", fg:"#fff" },
  7: { bg:"#d87665", fg:"#fff" },
  8: { bg:"#b6e076" },
  9: { bg:"#fd8803", fg:"#fff" },
  10:{ bg:"#e70200", fg:"#fff" },
  11:{ bg:"#8eabda" },
  12:{ bg:"#937972", fg:"#fff" }
};

let players=[];
let roundNumber=0;
let gameLocked=false;

let selectedPlayer=null;
let popupCards=[];
let popupOverride=null;
let popupActionStack=[];
let lastDirectScore=null;

let undoStack=[];
let undoRoundStack=[];

let statsOpen=false;
let lastLeaderName=null;
let lastLeaderScore=0;

let popupStatePushed=false;
let sheetStatePushed=false;

const palette=[
  "#2563eb","#16a34a","#ea580c","#9333ea",
  "#0ea5e9","#dc2626","#14b8a6","#eab308",
  "#111827","#f97316","#22c55e","#3b82f6"
];
const numbers=[...Array(13).keys()];

/* ---------- Persistenz ---------- */
function snapshot(){
  return JSON.parse(JSON.stringify({
    players, roundNumber, gameLocked,
    target:Number($("targetPoints").value)||200,
    statsOpen, lastLeaderName, lastLeaderScore, lastDirectScore,
    compact:document.body.classList.contains("compact"),
    contrast:document.body.classList.contains("highContrast"),
  }));
}
function restore(s){
  players=s.players||[];
  roundNumber=typeof s.roundNumber==="number"?s.roundNumber:0;
  gameLocked=!!s.gameLocked;
  if(typeof s.target==="number") $("targetPoints").value=s.target;
  statsOpen=!!s.statsOpen;
  lastLeaderName = s.lastLeaderName ?? null;
  lastLeaderScore = typeof s.lastLeaderScore==="number" ? s.lastLeaderScore : 0;
  lastDirectScore = (typeof s.lastDirectScore==="number") ? s.lastDirectScore : null;

  document.body.classList.toggle("compact", !!s.compact);
  document.body.classList.toggle("highContrast", !!s.contrast);

  syncTogglesUI();
  renderAll();
  save();
}
function pushUndo(){
  undoStack.push(snapshot());
  if(undoStack.length>60) undoStack.shift();
}
/* FIX: removed broken variable name that could crash */
function pushUndoRound(){
  undoRoundStack.push(snapshot());
  if(undoRoundStack.length>30) undoRoundStack.shift();
}
function save(){ localStorage.setItem("flip7_state_v10", JSON.stringify(snapshot())); }
function load(){
  const raw=localStorage.getItem("flip7_state_v10");
  if(!raw) return;
  try{ restore(JSON.parse(raw)); }catch(e){}
}

/* ---------- Regeln ---------- */
function scoreFromCards(cards){
  const nums=cards.filter(c=>typeof c==="number");
  const mods=cards.filter(c=>typeof c==="string");

  const isBust = (nums.length===0) || (new Set(nums).size !== nums.length);
  if(isBust) return {score:0,isBust:true,numbersCount:nums.length, reason:(nums.length===0?"Keine Zahl gewählt":"Doppelte Zahl")};

  const sumNums = nums.reduce((a,b)=>a+b,0);

  let multi=1;
  for(const m of mods){ if(m==="x2") multi*=2; }

  let modSum=0;
  for(const m of mods){ if(m.startsWith("+")) modSum += Number(m.slice(1)); }

  const bonus = (nums.length===7) ? 15 : 0;

  return { score:(sumNums*multi)+modSum+bonus, isBust:false, numbersCount:nums.length, reason:"", multi };
}

function getRanking(){
  return [...players].map(p=>{
    const live = (p.override!==null) ? p.override : scoreFromCards(p.cards).score;
    return {name:p.name,color:p.color,score:p.total+live};
  }).sort((a,b)=>b.score-a.score);
}

/* ---------- Count up ---------- */
function animateCountUpText(el, from, to, ms){
  if(reduceMotion() || from===to){
    el.textContent = to;
    return;
  }
  const start=performance.now();
  function step(now){
    const t=Math.min((now-start)/ms,1);
    const eased=1-Math.pow(1-t,2);
    el.textContent = Math.round(from+(to-from)*eased);
    if(t<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------- Top render ---------- */
function renderTop(){
  const target=Number($("targetPoints").value)||200;

  const compact = document.body.classList.contains("compact");
  $("roundBadge").textContent = compact ? String(roundNumber) : ("Runde: "+roundNumber);
  $("goalBadge").textContent  = compact ? String(target) : ("Ziel: "+target);

  if(!players.length){
    $("leaderHint").style.display="block";
    $("leaderDot").style.background="#cbd5e1";
    $("leaderName").textContent="Noch keine Spieler";
    $("leaderScore").textContent="";
    return;
  }
  $("leaderHint").style.display="none";
  const list=getRanking();
  const leader=list[0];

  $("leaderDot").style.background=leader.color;

  const changed = (lastLeaderName !== null && leader.name !== lastLeaderName);
  const scoreChanged = leader.score !== lastLeaderScore;

  if(changed){
    $("leaderStrip").classList.add("spotlight");
    setTimeout(()=>$("leaderStrip").classList.remove("spotlight"), 650);

    $("leaderCrown").classList.add("pop","shimmer");
    setTimeout(()=> $("leaderCrown").classList.remove("pop","shimmer"), 380);

    $("leaderDot").classList.add("halo");
    setTimeout(()=>$("leaderDot").classList.remove("halo"), 320);

    $("leaderName").classList.add("crossfade");
    setTimeout(()=>$("leaderName").classList.remove("crossfade"), 170);
  }

  $("leaderName").textContent = leader.name;

  const scoreEl = $("leaderScore");
  scoreEl.classList.toggle("crossfade", changed || scoreChanged);
  setTimeout(()=>scoreEl.classList.remove("crossfade"), 170);

  animateCountUpText(scoreEl, lastLeaderScore, leader.score, 160);

  lastLeaderName = leader.name;
  lastLeaderScore = leader.score;
}

/* ---------- Ranking panel ---------- */
function renderRanking(){
  const list=getRanking();
  const panel=$("rankingPanel");

  panel.innerHTML = list.length ? list.map((p,i)=>`
    <div class="rankItem">
      <div class="rankNo">${i+1}.</div>
      <div class="rankDot" style="background:${p.color}"></div>
      <div class="rankName">${escapeHtml(p.name)}</div>
      <div class="rankScore">${p.score}</div>
    </div>
  `).join("") : `<div style="font-weight:700;color:#555;">Noch keine Spieler</div>`;
}

/* Track bar % */
const prevBarPct = new Map();
/* Track live segment % for sweep */
const prevLivePct = new Map();

/* ---------- Chips fade helpers ---------- */
function updateFadeFor(wrapper){
  const sc = wrapper.querySelector(".card-container");
  if(!sc) return;
  const max = Math.max(0, sc.scrollWidth - sc.clientWidth);
  const left = sc.scrollLeft;
  wrapper.classList.toggle("showLeft", left > 2);
  wrapper.classList.toggle("showRight", left < max - 2);
}
function wireChipFades(){
  document.querySelectorAll(".cardFade").forEach(w=>{
    const sc = w.querySelector(".card-container");
    if(!sc) return;
    const on = ()=>updateFadeFor(w);
    sc.addEventListener("scroll", on, {passive:true});
    requestAnimationFrame(on);
  });
}

/* ---------- Players render ---------- */
function renderPlayers(){
  const target=Number($("targetPoints").value)||200;
  const rank=getRanking();
  const leaderName = rank.length ? rank[0].name : null;
  const compact = document.body.classList.contains("compact");

  const wrap=$("playersContainer");
  wrap.innerHTML="";

  players.forEach((p,i)=>{
    const res = (p.override!==null)
      ? {score:p.override,isBust:(p.override===0),numbersCount:0, reason:"", multi:1}
      : scoreFromCards(p.cards);

    const live=res.score;
    const total=p.total+live;

    const bonusBadge = (p.cards.length && !res.isBust && res.numbersCount===7) ? `<span class="miniBadge action">+15</span>` : "";
    const manualBadge = (p.override!==null) ? `<span class="miniBadge">manuell</span>` : "";

    const div=document.createElement("div");
    div.className="player-box"+(leaderName===p.name?" leader":"");
    div.style.borderLeftColor=p.color;

    /* FIX: base + live segment (instead of live being total width) */
    const pctBase  = target ? Math.min((p.total/target)*100,100) : 0;
    const pctLive  = target ? Math.min((live/target)*100, Math.max(0, 100 - pctBase)) : 0;
    const pctTotal = Math.min(pctBase + pctLive, 100);

    const prev = prevBarPct.get(p.name);
    const barGlow = (prev!=null && Math.abs(prev-pctTotal) > 0.01);
    prevBarPct.set(p.name, pctTotal);

    const prevL = prevLivePct.get(p.name);
    const liveChanged = (prevL!=null && Math.abs(prevL - pctLive) > 0.01);
    prevLivePct.set(p.name, pctLive);

    const left = Math.max(target-total,0);

    const leftLabel = compact
      ? `<button class="sub" data-direct="1" data-i="${i}" style="border:none;background:transparent;padding:0;text-decoration:underline;cursor:pointer">${live}</button>
         <span id="delta_${i}"></span>`
      : `<button class="sub" data-direct="1" data-i="${i}" style="border:none;background:transparent;padding:0;text-decoration:underline;cursor:pointer">Runde: ${live}</button>
         <span id="delta_${i}"></span>`;

    const rightLabel = compact
      ? `<span><span class="totalBig" id="total_${i}">${total}</span>/<span>${target}</span> <span class="dim">(−<span id="left_${i}">${left}</span>)</span></span>`
      : `<span><span class="totalBig" id="total_${i}">${total}</span>/<span>${target}</span> <span class="dim">(noch <span id="left_${i}">${left}</span>)</span></span>`;

    div.innerHTML=`
      <div class="player-top">
        <div class="player-name">
          <span class="player-dot" style="background:${p.color}"></span>
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</span>
          ${bonusBadge} ${manualBadge}
        </div>
        <button class="plusBtn" type="button" data-i="${i}" aria-label="Punkte/Karten"><span>+</span></button>
      </div>

      <div class="progress-container ${barGlow ? "barGlow":""}" id="pc_${i}">
        <div class="pbBase" id="pbBase_${i}" style="width:${pctBase}%; background:${p.color}"></div>
        <div class="pbLive ${liveChanged ? "sweep":""}" id="pbLive_${i}"
             style="left:${pctBase}%; width:${pctLive}%; background:${p.color}"></div>
      </div>

      <div class="divider"></div>

      <div class="player-line">
        <span class="sub">${leftLabel}</span>
        ${rightLabel}
      </div>

      ${p.cards.length?`
        <div class="cardFade" id="fade_${i}">
          <div class="card-container" id="chips_${i}">
            ${p.cards.map((c,ci)=>`<span class="cardchip" data-rem="${ci}" data-i="${i}">${escapeHtml(String(c))}</span>`).join("")}
          </div>
        </div>
      `:""}
    `;
    wrap.appendChild(div);

    if(liveChanged){
      const el = div.querySelector("#pbLive_"+i);
      setTimeout(()=>el?.classList.remove("sweep"), 280);
    }
  });

  wireChipFades();
}

/* ---------- Stats ---------- */
function renderStats(){
  const box=$("stats");
  if(!players.length){ box.innerHTML=`<div style="font-weight:700;color:#555;">Noch keine Daten</div>`; return; }
  box.innerHTML = players.map(p=>{
    const avg=(p.rounds.reduce((a,b)=>a+b,0)/(p.rounds.length||1)).toFixed(1);
    const bustQ=p.rounds.length?Math.round((p.busts/p.rounds.length)*100):0;
    return `<div style="margin:6px 0;"><b>${escapeHtml(p.name)}</b>: Ø ${avg} • Bust ${bustQ}% (${p.busts}/${p.rounds.length})</div>`;
  }).join("");
}

/* ---------- Locks ---------- */
function updateLocks(){
  $("targetRow").style.display = gameLocked ? "none" : "flex";
  $("emptyState").style.display = players.length? "none" : "block";
  $("endRoundBtn").disabled = players.length===0;

  const canManage = (!gameLocked && roundNumber===0);
  $("sheetAddBtn").disabled = !canManage;

  const colors = players.map(p=>p.color);
  const hasDup = new Set(colors).size !== colors.length;
  $("colorsBtn").disabled = (players.length < 2);

  $("undoBtn").disabled = undoStack.length===0;
  $("undoRoundBtn").disabled = undoRoundStack.length===0;
}

/* ---------- Render all ---------- */
function renderAll(){
  renderTop();
  renderRanking();
  renderPlayers();
  renderStats();
  $("stats").style.display = statsOpen ? "block" : "none";
  $("statsChevron").textContent = statsOpen ? "▲" : "▼";
  updateLocks();
}

/* ---------- Tools Menu ---------- */
const toolsBtnEl = $("toolsBtn");
const toolsMenuEl = $("toolsMenu");
document.body.appendChild(toolsMenuEl);

let toolsMenuOpen=false;

function positionToolsMenu(){
  const r = toolsBtnEl.getBoundingClientRect();
  const w = toolsMenuEl.offsetWidth || 240;
  const margin = 8;
  let left = r.right - w;
  let top  = r.bottom + margin;
  left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
  top  = Math.max(margin, Math.min(top, window.innerHeight - toolsMenuEl.offsetHeight - margin));
  toolsMenuEl.style.left = left + "px";
  toolsMenuEl.style.top  = top + "px";
}
function closeToolsMenu(){
  toolsMenuOpen=false;
  toolsMenuEl.classList.remove("open");
  toolsBtnEl.setAttribute("aria-expanded","false");
}
function openToolsMenu(){
  toolsMenuOpen=true;
  toolsMenuEl.classList.add("open");
  toolsBtnEl.setAttribute("aria-expanded","true");
  positionToolsMenu();
}
function toggleToolsMenu(){ toolsMenuOpen ? closeToolsMenu() : openToolsMenu(); }

toolsBtnEl.addEventListener("pointerdown",(e)=>{ e.preventDefault(); e.stopPropagation(); }, {passive:false});
toolsBtnEl.addEventListener("pointerup",(e)=>{ e.preventDefault(); e.stopPropagation(); toggleToolsMenu(); }, {passive:false});
toolsMenuEl.addEventListener("pointerdown",(e)=>{ e.stopPropagation(); }, {passive:true});
toolsMenuEl.addEventListener("pointerup",(e)=>{ e.stopPropagation(); }, {passive:true});

document.addEventListener("pointerdown",(e)=>{
  if(!toolsMenuOpen) return;
  if(e.target === toolsBtnEl) return;
  if(toolsMenuEl.contains(e.target)) return;
  closeToolsMenu();
}, {passive:true, capture:true});

window.addEventListener("resize",()=>{ if(toolsMenuOpen) positionToolsMenu(); }, {passive:true});
window.addEventListener("scroll",()=>{ if(toolsMenuOpen) positionToolsMenu(); }, {passive:true});

/* ---------- Ranking toggle ---------- */
$("rankBtn").addEventListener("pointerup",(e)=>{
  e.preventDefault(); e.stopPropagation();
  const open = $("rankingPanel").classList.toggle("open");
  $("rankBtn").setAttribute("aria-expanded", open ? "true" : "false");
  closeToolsMenu();
}, {passive:false});

/* ---------- Bottom sheet ---------- */
const sheetOverlay=$("sheetOverlay");
const sheet=$("sheet");
const sheetBody=$("sheetBody");
const sheetTitle=$("sheetTitle");
let sheetOpen=false;
let sheetSnap="half";
let sheetDrag=false;
let sheetStartY=0;
let sheetStartTranslate=0;
let sheetLastY=0;
let sheetStartT=0;

function computeSnapTranslate(which){
  const vh = window.innerHeight;
  const fullH = Math.round(vh * 0.90);
  const halfVisible = Math.round(vh * 0.55);
  const halfTranslate = Math.max(0, fullH - halfVisible);
  return (which==="full") ? 0 : halfTranslate;
}
function applySheetTranslate(px, withTransition){
  sheet.style.transition = withTransition ? "transform .22s cubic-bezier(.2,.8,.2,1)" : "none";
  sheet.style.setProperty("--sheetTranslate", px+"px");
}
function setSheetTitleBySnap(which){
  sheetTitle.classList.add("crossfade");
  sheetTitle.textContent = (which==="full") ? "Spieler & Einstellungen" : "Spieler";
  setTimeout(()=>sheetTitle.classList.remove("crossfade"), 160);
}
function snapSheet(which, reason){
  sheetSnap = which;
  const px = computeSnapTranslate(which);
  applySheetTranslate(px, true);
  setSheetTitleBySnap(which);
  if(reason==="user") vib(HAPT.sheetSnap);
}
function openSheet(){
  closeToolsMenu();
  sheetOverlay.style.display="block";
  requestAnimationFrame(()=>sheetOverlay.classList.add("open"));
  sheet.classList.add("open");
  sheetOverlay.classList.add("open");
  sheet.setAttribute("aria-hidden","false");
  lockScroll(true);
  sheetOpen=true;
  renderSheetPlayers();
  vib(HAPT.sheetOpen);
  snapSheet("half", "program");

  if(!sheetStatePushed){
    history.pushState({sheet:true}, "");
    sheetStatePushed=true;
  }
}
function closeSheet(){
  sheetOpen=false;
  sheet.classList.remove("open");
  sheetOverlay.classList.remove("open");
  sheet.setAttribute("aria-hidden","true");
  setTimeout(()=>{ sheetOverlay.style.display="none"; }, 180);
  lockScroll(false);
  save();

  if(sheetStatePushed){
    sheetStatePushed=false;
    try{ history.back(); }catch(e){}
  }
}
sheetOverlay.addEventListener("pointerdown",()=>{ if(sheetOpen) closeSheet(); }, {passive:true});

window.addEventListener("popstate",()=>{
  if(sheetOpen){
    sheetOpen=false;
    sheet.classList.remove("open");
    sheetOverlay.classList.remove("open");
    sheet.setAttribute("aria-hidden","true");
    setTimeout(()=>{ sheetOverlay.style.display="none"; }, 180);
    lockScroll(false);
    save();
  }
  if(popupEl && popupEl.style.display==="block"){
    popupStatePushed=false;
    internalClosePopup(true);
  }
});

function rubberBand(dy){
  const sign = dy < 0 ? -1 : 1;
  const abs = Math.abs(dy);
  const damp = abs / (abs + 260);
  return sign * abs * (1 - damp);
}
function beginSheetDrag(clientY){
  sheetDrag=true;
  sheetStartY=clientY;
  sheetLastY=clientY;
  sheetStartT=performance.now();
  sheetStartTranslate = computeSnapTranslate(sheetSnap);
  applySheetTranslate(sheetStartTranslate, false);
}
function moveSheetDrag(clientY){
  if(!sheetDrag) return;
  sheetLastY=clientY;
  const dy = sheetLastY - sheetStartY;
  let next = sheetStartTranslate + dy;

  if(next < 0) next = rubberBand(next);
  const half = computeSnapTranslate("half");
  if(next > half) next = half + rubberBand(next - half);

  applySheetTranslate(next, false);
}
function endSheetDrag(){
  if(!sheetDrag) return;
  sheetDrag=false;

  const dy = sheetLastY - sheetStartY;
  const dt = Math.max(1, performance.now() - sheetStartT);
  const v = dy / dt;

  const half = computeSnapTranslate("half");
  const current = sheetStartTranslate + dy;

  if(sheetSnap==="half"){
    const closeThresh = half + 110;
    const shouldClose = (current > closeThresh) || (v > 0.85);
    if(shouldClose){
      applySheetTranslate(half+320, true);
      setTimeout(()=>closeSheet(), 180);
      return;
    }
  }

  const toFull = (current < (half * 0.55)) || (v < -0.65);
  if(toFull) snapSheet("full", "user");
  else snapSheet("half", "user");

  sheet.style.transition = "";
}

$("sheetGrabHit").addEventListener("pointerdown",(e)=>{
  if(!sheetOpen) return;
  if(sheetBody.scrollTop > 0) return;
  beginSheetDrag(e.clientY);
  sheet.setPointerCapture?.(e.pointerId);
},{passive:true});

sheet.addEventListener("pointermove",(e)=>{ if(sheetDrag) moveSheetDrag(e.clientY); },{passive:true});
sheet.addEventListener("pointerup",()=>{ if(sheetDrag) endSheetDrag(); },{passive:true});
window.addEventListener("resize",()=>{ if(sheetOpen) snapSheet(sheetSnap, "program"); }, {passive:true});

/* ---------- Sheet players ---------- */
let editingIdx = null;

function renderSheetPlayers(){
  const list=$("sheetPlayersList");
  const canManage = (!gameLocked && roundNumber===0);
  $("sheetAddBtn").disabled = !canManage;

  if(!players.length){
    list.innerHTML = `<div style="padding:12px;font-weight:700;color:var(--sub2);">Noch keine Spieler.</div>`;
    return;
  }

  list.innerHTML = players.map((p,idx)=>{
    const isEdit = (editingIdx === idx);
    const nameCell = isEdit
      ? `
        <div class="renameRow">
          <input data-ren-inp="${idx}" value="${escapeHtml(p.name)}" />
          <button type="button" data-ren-done="${idx}">Done</button>
        </div>`
      : `<div class="liName">${escapeHtml(p.name)}</div>`;

    return `
      <div class="listItem">
        <div class="liDot" style="background:${p.color}"></div>
        ${nameCell}
        <div class="liBtns">
          <button type="button" data-ren="${idx}" ${canManage?"":"disabled"} aria-label="Umbenennen">✎</button>
          <button type="button" class="del" data-del="${idx}" ${canManage?"":"disabled"} aria-label="Löschen">🗑️</button>
        </div>
      </div>
    `;
  }).join("");

  if(editingIdx !== null){
    const inp = list.querySelector(`[data-ren-inp="${editingIdx}"]`);
    if(inp){
      setTimeout(()=>{ inp.focus(); inp.select(); }, 60);
    }
  }
}

function addPlayerFromSheet(){
  const canManage = (!gameLocked && roundNumber===0);
  if(!canManage) return;

  const name = $("sheetAddName").value.trim();
  if(!name) return;

  pushUndo();
  const used=new Set(players.map(x=>x.color));
  const free=palette.find(c=>!used.has(c)) || palette[players.length % palette.length];

  players.push({name, color:free, cards:[], total:0, rounds:[], busts:0, override:null});
  $("sheetAddName").value="";
  editingIdx = null;
  renderAll();
  renderSheetPlayers();
  save();
}

function startRename(idx){
  const canManage = (!gameLocked && roundNumber===0);
  if(!canManage) return;
  editingIdx = idx;
  renderSheetPlayers();
}
function commitRename(idx){
  const canManage = (!gameLocked && roundNumber===0);
  if(!canManage) return;
  const inp = $("sheetPlayersList").querySelector(`[data-ren-inp="${idx}"]`);
  if(!inp) return;
  const next = inp.value.trim();
  if(!next){ editingIdx = null; renderSheetPlayers(); return; }
  pushUndo();
  players[idx].name = next;
  editingIdx = null;
  renderAll();
  renderSheetPlayers();
  save();
}

function deletePlayer(idx){
  const canManage = (!gameLocked && roundNumber===0);
  if(!canManage) return;

  const ok = confirm(`Spieler "${players[idx].name}" entfernen?`);
  if(!ok) return;

  vib(HAPT.delete);
  pushUndo();
  players.splice(idx,1);
  editingIdx = null;
  renderAll();
  renderSheetPlayers();
  save();
}

function syncTogglesUI(){
  const c = document.body.classList.contains("compact");
  const h = document.body.classList.contains("highContrast");

  const tc=$("toggleCompact");
  tc.classList.toggle("on", c);
  tc.setAttribute("aria-checked", c ? "true" : "false");

  const th=$("toggleContrast");
  th.classList.toggle("on", h);
  th.setAttribute("aria-checked", h ? "true" : "false");
}

function toggleClassSwitch(which){
  if(which==="compact"){
    document.body.classList.toggle("compact");
  }else if(which==="contrast"){
    document.body.classList.toggle("highContrast");
  }
  syncTogglesUI();
  renderAll();
  save();
}

$("manageBtn").addEventListener("pointerup",(e)=>{ e.preventDefault(); openSheet(); }, {passive:false});
$("sheetCloseBtn").addEventListener("pointerup",(e)=>{ e.preventDefault(); closeSheet(); }, {passive:false});

$("sheetAddBtn").addEventListener("pointerup",(e)=>{ e.preventDefault(); addPlayerFromSheet(); }, {passive:false});
$("sheetAddName").addEventListener("keydown",(e)=>{ if(e.key==="Enter") addPlayerFromSheet(); });

$("sheetPlayersList").addEventListener("click",(e)=>{
  const ren = e.target.closest("[data-ren]");
  const del = e.target.closest("[data-del]");
  const done = e.target.closest("[data-ren-done]");
  if(done) commitRename(Number(done.dataset.renDone));
  if(ren) startRename(Number(ren.dataset.ren));
  if(del) deletePlayer(Number(del.dataset.del));
});

$("sheetPlayersList").addEventListener("keydown",(e)=>{
  const inp = e.target.closest("[data-ren-inp]");
  if(!inp) return;
  const idx = Number(inp.dataset.renInp);
  if(e.key === "Enter") commitRename(idx);
  if(e.key === "Escape"){ editingIdx=null; renderSheetPlayers(); }
});

$("toggleCompact").addEventListener("pointerup",()=>toggleClassSwitch("compact"));
$("toggleContrast").addEventListener("pointerup",()=>toggleClassSwitch("contrast"));
$("toggleCompact").addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" ") toggleClassSwitch("compact"); });
$("toggleContrast").addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" ") toggleClassSwitch("contrast"); });

/* ---------- Popup ---------- */
const overlayEl=$("overlay"), popupEl=$("popup");
const tabCardsEl=$("tabCards"), tabDirectEl=$("tabDirect");
const cardsView=$("popupCardsView"), directView=$("popupDirectView");
let lastUndoTap=0;

let popupFxPrev = { bonus:false, x2:false };

function stackPopupState(){
  popupActionStack.push(JSON.parse(JSON.stringify({cards:popupCards, override:popupOverride, free:$("freeScoreInput").value})));
  if(popupActionStack.length>40) popupActionStack.shift();
}
function popupUndo(){
  if(!popupActionStack.length) return;
  const s=popupActionStack.pop();
  popupCards=s.cards;
  popupOverride=s.override;
  $("freeScoreInput").value=s.free;
  renderPopupSelection();
}
function popupUndoTap(){
  const now=Date.now();
  if(now-lastUndoTap < 260){
    clearPopup();
    lastUndoTap=0;
    return;
  }
  lastUndoTap=now;
  popupUndo();
}
function clearPopup(){
  stackPopupState();
  popupCards=[]; popupOverride=null; $("freeScoreInput").value="";
  renderPopupSelection();
}
function popupAdd(x){
  stackPopupState();
  popupCards.push(x);
  popupOverride=null;
  $("freeScoreInput").value="";
  renderPopupSelection();
}
function popupRemoveAt(idx, el){
  if(el){
    el.classList.add("removing");
    setTimeout(()=>{
      stackPopupState();
      popupCards.splice(idx,1);
      popupOverride=null;
      $("freeScoreInput").value="";
      renderPopupSelection();
    }, 120);
    return;
  }
  stackPopupState();
  popupCards.splice(idx,1);
  popupOverride=null;
  $("freeScoreInput").value="";
  renderPopupSelection();
}
function applyFree(){
  const v=Number($("freeScoreInput").value);
  if(!Number.isFinite(v) || v<0) return;
  stackPopupState();
  popupOverride=Math.floor(v);
  lastDirectScore = popupOverride;
  renderPopupSelection();
}

function triggerPreviewGlow(){
  const info=$("popupLiveInfo");
  info.classList.remove("fxGlow");
  void info.offsetWidth;
  info.classList.add("fxGlow");
  vib(HAPT.fx);
  setTimeout(()=>info.classList.remove("fxGlow"), 240);
}

function renderPopupSelection(){
  const chips=$("selectedChips");
  chips.innerHTML="";
  if(!popupCards.length){
    chips.innerHTML=`<span style="font-weight:700;color:#555;">Keine Karten ausgewählt.</span>`;
  }else{
    popupCards.forEach((c,idx)=>{
      const d=document.createElement("div");
      d.className="chip addAnim";
      d.textContent=String(c);
      d.addEventListener("pointerdown",(e)=>{ e.preventDefault(); popupRemoveAt(idx, d); }, {passive:false});
      chips.appendChild(d);
      setTimeout(()=>d.classList.remove("addAnim"), 140);
    });
  }

  const info=$("popupLiveInfo");

  if(popupOverride!==null){
    info.className="hint";
    info.textContent=`Vorschau: ${popupOverride} Punkte (manuell)`;
    popupFxPrev = { bonus:false, x2:false };
    return;
  }
  if(!popupCards.length){
    info.className="hint"; info.textContent="Vorschau: –";
    popupFxPrev = { bonus:false, x2:false };
    return;
  }

  const prev=scoreFromCards(popupCards);

  const hasX2 = !prev.isBust && popupCards.some(x=>x==="x2");
  const hasBonus = !prev.isBust && prev.numbersCount===7;

  const enteredBonus = hasBonus && !popupFxPrev.bonus;
  const enteredX2    = hasX2 && !popupFxPrev.x2;
  if(enteredBonus || enteredX2) triggerPreviewGlow();
  popupFxPrev = { bonus:hasBonus, x2:hasX2 };

  if(prev.isBust){
    info.className="hint bust";
    info.textContent=`Vorschau: BUST (0 Punkte) • ${prev.reason}`;
  }else{
    info.className="hint"+(hasBonus?" bonus":"");
    const parts=[];
    if(hasX2) parts.push("x2");
    if(hasBonus) parts.push("+15 Bonus");
    info.textContent=`Vorschau: ${prev.score} Punkte` + (parts.length ? (" • " + parts.join(" • ")) : "");
  }
}

function setTab(t){
  tabCardsEl.classList.toggle("active", t==="cards");
  tabDirectEl.classList.toggle("active", t==="direct");
  cardsView.style.display = (t==="cards")?"block":"none";
  directView.style.display = (t==="direct")?"block":"none";
  $("popupTitle").textContent = (t==="direct") ? "Direktpunkte" : "Karten";

  if(t==="direct"){
    if(typeof lastDirectScore==="number"){
      $("lastDirectVal").textContent = lastDirectScore;
      $("lastDirectChip").style.display="inline-flex";
    }else{
      $("lastDirectChip").style.display="none";
    }
    setTimeout(()=>{
      const inp=$("freeScoreInput");
      inp.focus();
      inp.select();
    }, 60);
  }else{
    $("lastDirectChip").style.display="none";
  }
}

function openPopup(i, direct){
  selectedPlayer=i;
  popupCards=[...players[i].cards];
  popupOverride=players[i].override;
  popupActionStack=[];
  popupFxPrev = { bonus:false, x2:false };
  $("popupPlayerBadge").textContent=players[i].name;
  $("freeScoreInput").value = popupOverride!==null ? popupOverride : "";

  popupEl.style.display="block";
  overlayEl.style.display="block";
  requestAnimationFrame(()=>{ popupEl.classList.add("open"); overlayEl.classList.add("open"); });
  lockScroll(true);

  if(!popupStatePushed){
    history.pushState({popup:true}, "");
    popupStatePushed=true;
  }

  setTab(direct ? "direct" : "cards");
  renderPopupSelection();
}

function internalClosePopup(cancel){
  popupEl.classList.remove("open");
  overlayEl.classList.remove("open");
  setTimeout(()=>{ popupEl.style.display="none"; overlayEl.style.display="none"; }, 180);
  lockScroll(false);

  if(!cancel && selectedPlayer!==null){
    pushUndo();
    players[selectedPlayer].cards=[...popupCards];
    players[selectedPlayer].override=popupOverride;
    save();
    vib(HAPT.finish);
  }

  selectedPlayer=null;
  renderAll();
}

function closePopup(cancel){
  if(popupStatePushed){
    popupStatePushed=false;
    internalClosePopup(cancel);
    try{ history.back(); }catch(e){}
    return;
  }
  internalClosePopup(cancel);
}

/* swipe-to-close (grabHit) */
let dragActive=false, dragStartY=0, dragLastY=0, dragStartT=0;
function setPopupDragTranslate(y){ popupEl.style.transform = `translateY(${y}px)`; }
function endPopupDrag(shouldClose){
  dragActive=false;
  popupEl.style.transition = "opacity .18s ease, transform .18s cubic-bezier(.2,.8,.2,1)";
  if(shouldClose) closePopup(true);
  else setPopupDragTranslate(0);
  setTimeout(()=>{ popupEl.style.transition=""; }, 220);
}

$("popupGrabHit").addEventListener("pointerdown",(e)=>{
  const activeView = (directView.style.display !== "none") ? directView : cardsView;
  if(activeView && activeView.scrollTop > 0) return;
  dragActive=true; dragStartY=e.clientY; dragLastY=e.clientY; dragStartT=performance.now();
  popupEl.setPointerCapture?.(e.pointerId);
  popupEl.style.transition="none";
},{passive:true});

popupEl.addEventListener("pointermove",(e)=>{
  if(!dragActive) return;
  dragLastY=e.clientY;
  const dy=Math.max(0, dragLastY - dragStartY);
  setPopupDragTranslate(Math.min(dy, 220));
},{passive:true});
popupEl.addEventListener("pointerup",()=>{
  if(!dragActive) return;
  const dy=Math.max(0, dragLastY - dragStartY);
  const dt=Math.max(1, performance.now()-dragStartT);
  const v=dy/dt;
  endPopupDrag(dy>90 || v>0.7);
},{passive:true});

/* ---------- Popup grids ---------- */
function buildPopupGrids(){
  const ng=$("numberGrid");
  ng.innerHTML="";
  numbers.forEach(n=>{
    const b=document.createElement("button");
    b.type="button"; b.className="cardBtn";
    const st=numStyle[n]||{bg:"#eef1f5",fg:"#0b1220"};
    b.style.background=st.bg; b.style.color=st.fg||"#0b1220";
    b.textContent=String(n);
    b.addEventListener("pointerdown",(e)=>{e.preventDefault(); popupAdd(n);},{passive:false});
    ng.appendChild(b);
  });

  const mg=$("modGrid");
  mg.innerHTML="";
  ["+2","+4","+6","+8","+10","x2"].forEach(m=>{
    const b=document.createElement("button");
    b.type="button"; b.className="cardBtn modBtn"+(m==="x2"?" x2":"");
    b.textContent=m;
    b.addEventListener("pointerdown",(e)=>{e.preventDefault(); popupAdd(m);},{passive:false});
    mg.appendChild(b);
  });
}

/* ---------- Round toast ---------- */
let toastTimer=null;
function showRoundToast(){
  const t=$("roundToast");
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>hideRoundToast(), 2600);
}
function hideRoundToast(){
  clearTimeout(toastTimer);
  $("roundToast").classList.remove("show");
}

/* Winner confetti */
function spawnConfetti(color){
  if(reduceMotion()) return;
  const card=$("winnerCard");
  [...card.querySelectorAll(".confetti")].forEach(x=>x.remove());
  const colors=[color, "#ffffff", "rgba(255,255,255,.65)", "rgba(15,23,42,.15)"];
  for(let i=0;i<8;i++){
    const s=document.createElement("div");
    s.className="confetti";
    s.style.background=colors[Math.floor(Math.random()*colors.length)];
    s.style.left = (40 + Math.random()*20) + "%";
    s.style.top  = (40 + Math.random()*10) + "%";
    s.style.setProperty("--dx", (Math.random()*160-80).toFixed(0)+"px");
    s.style.setProperty("--dy", (Math.random()*-220-80).toFixed(0)+"px");
    s.style.setProperty("--rot",(Math.random()*260-130).toFixed(0)+"deg");
    s.style.animationDelay = (Math.random()*80) + "ms";
    card.appendChild(s);
  }
}

/* ---------- End Round ---------- */
function crossed(prevPct, nextPct, tick){ return prevPct < tick && nextPct >= tick; }

function endRound(){
  if(!players.length) return;

  pushUndoRound();
  if(!gameLocked) gameLocked=true;

  const target=Number($("targetPoints").value)||200;

  const prevTotals = players.map(p => p.total);
  const prevPct = players.map((p,i)=> Math.min((prevTotals[i]/target)*100, 100));
  const roundScores=[];

  players.forEach(p=>{
    const res = (p.override!==null) ? {score:p.override,isBust:(p.override===0)} : scoreFromCards(p.cards);
    const s=res.score;
    roundScores.push(s);

    p.total+=s;
    p.rounds.push(s);
    if(res.isBust) p.busts+=1;

    p.cards=[];
    p.override=null;
  });

  roundNumber += 1;

  const btn=$("endRoundBtn");
  btn.classList.add("saved");
  setTimeout(()=>btn.classList.remove("saved"), 420);

  renderAll();
  showRoundToast();

  players.forEach((p,i)=>{
    const nextTotal=p.total;
    const nextP = Math.min((nextTotal/target)*100, 100);

    const pc=$("pc_"+i);
    const pbBase=$("pbBase_"+i);
    const pbLive=$("pbLive_"+i);

    if(crossed(prevPct[i], nextP, 50)){
      pc?.classList.add("tick50");
      setTimeout(()=>pc?.classList.remove("tick50"), 220);
      vib(HAPT.sheetSnap);
    }

    const totalEl=$("total_"+i);
    const leftEl=$("left_"+i);
    if(totalEl && leftEl){
      if(!reduceMotion()){
        const start=prevTotals[i], end=nextTotal, ms=380;
        const st=performance.now();
        function step(now){
          const t=Math.min((now-st)/ms,1);
          const eased=1-Math.pow(1-t,2);
          const val=Math.round(start+(end-start)*eased);
          totalEl.textContent=val;
          if(t<1) requestAnimationFrame(step);
          else leftEl.textContent = Math.max(target-end,0);
        }
        requestAnimationFrame(step);
      }else{
        totalEl.textContent=nextTotal;
        leftEl.textContent = Math.max(target-nextTotal,0);
      }
    }

    const deltaHost=$("delta_"+i);
    if(deltaHost){
      const s=roundScores[i];
      deltaHost.innerHTML="";
      const pill=document.createElement("span");
      pill.className="deltaPill"+(s===0 ? " bust": "");
      pill.textContent = (s===0) ? "0" : ("+"+s);
      deltaHost.appendChild(pill);
      setTimeout(()=>{ deltaHost.innerHTML=""; }, 800);
    }

    if(roundScores[i]===0){
      const row = document.querySelectorAll(".player-box")[i];

      row?.classList.add("bustAnim");
      setTimeout(()=>row?.classList.remove("bustAnim"), 300);

      if(row){
        const toast=document.createElement("div");
        toast.className="bustToast";
        toast.textContent="BUST";
        row.appendChild(toast);
        setTimeout(()=>toast.remove(), 520);
      }

      pc?.classList.add("bustRing","bustFlash");
      setTimeout(()=>pc?.classList.remove("bustRing","bustFlash"), 520);

      pbBase?.classList.add("resetBounce");
      pbLive?.classList.add("resetBounce");
      setTimeout(()=>{
        pbBase?.classList.remove("resetBounce");
        pbLive?.classList.remove("resetBounce");
      }, 260);

      vib(HAPT.bust);
    }
  });

  save();

  const win = players.find(p=>p.total>=target);
  if(win){
    $("winnerText").textContent = win.name+" gewinnt!";
    $("winnerScreen").style.display="flex";
    spawnConfetti(players.find(x=>x.name===win.name)?.color || "#22c55e");
    vib(HAPT.win);
  }
}

/* ---------- Menu actions ---------- */
function redistributeColors(){
  if(!players.length) return;
  pushUndo();
  const pool=[...palette];
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  players.forEach((p,i)=>p.color=pool[i%pool.length]);
  closeToolsMenu();
  renderAll(); save();
}
function undoAction(){
  if(!undoStack.length) return;
  closeToolsMenu();
  restore(undoStack.pop());
}
function undoRound(){
  if(!undoRoundStack.length) return;
  closeToolsMenu();
  hideRoundToast();
  restore(undoRoundStack.pop());
}
function newGame(){
  closeToolsMenu();
  const ok=confirm("Neues Spiel starten? (Alle Spieler werden entfernt)");
  if(!ok) return;
  players=[]; roundNumber=0; gameLocked=false;
  $("winnerScreen").style.display="none";
  $("rankingPanel").classList.remove("open");
  $("rankBtn").setAttribute("aria-expanded","false");
  editingIdx = null;
  save();
  renderAll();
  if(sheetOpen) renderSheetPlayers();
}

/* ---------- Wiring ---------- */
$("statsHead").addEventListener("click",()=>{
  statsOpen=!statsOpen;
  $("stats").style.display = statsOpen ? "block" : "none";
  $("statsChevron").textContent = statsOpen ? "▲" : "▼";
  save();
});

$("colorsBtn").addEventListener("click",(e)=>{ e.preventDefault(); redistributeColors(); });
$("undoBtn").addEventListener("click",(e)=>{ e.preventDefault(); undoAction(); });
$("undoRoundBtn").addEventListener("click",(e)=>{ e.preventDefault(); undoRound(); });
$("newGameBtn").addEventListener("click",(e)=>{ e.preventDefault(); newGame(); });
$("sheetNewGameBtn").addEventListener("click",(e)=>{ e.preventDefault(); newGame(); });

$("toastUndoBtn").addEventListener("click",(e)=>{ e.preventDefault(); undoRound(); });
$("endRoundBtn").addEventListener("click",(e)=>{ e.preventDefault(); endRound(); });

$("targetPoints").addEventListener("change",()=>{
  if(gameLocked) return;
  save(); renderAll();
});

$("tabCards").addEventListener("click",(e)=>{ e.preventDefault(); setTab("cards"); });
$("tabDirect").addEventListener("click",(e)=>{ e.preventDefault(); setTab("direct"); });
$("applyFreeBtn").addEventListener("click",(e)=>{ e.preventDefault(); applyFree(); });
$("clearBtn").addEventListener("click",(e)=>{ e.preventDefault(); clearPopup(); });
$("cancelBtn").addEventListener("click",(e)=>{ e.preventDefault(); closePopup(true); });
$("finishBtn").addEventListener("click",(e)=>{ e.preventDefault(); closePopup(false); });
$("popupUndoBtn").addEventListener("click",(e)=>{ e.preventDefault(); popupUndoTap(); });

$("freeScoreInput").addEventListener("keydown",(e)=>{ if(e.key==="Enter") applyFree(); });

$("lastDirectChip").addEventListener("click",(e)=>{
  e.preventDefault();
  if(typeof lastDirectScore==="number"){
    $("freeScoreInput").value = lastDirectScore;
    applyFree();
  }
});

$("winnerNewGame").addEventListener("click",(e)=>{
  e.preventDefault();
  $("winnerScreen").style.display="none";
  newGame();
});

overlayEl.addEventListener("pointerdown",()=>closePopup(true),{passive:true});

/* Delegation: chip remove, open popup (+), tap Runde for Direktpunkte */
let pressTimer=null;
let longPressFired=false;

$("playersContainer").addEventListener("pointerdown",(e)=>{
  const rem = e.target.closest(".cardchip");
  if(rem && rem.dataset.rem!=null){
    const i=Number(rem.dataset.i);
    const ci=Number(rem.dataset.rem);

    rem.style.animation = "chipOut .12s ease forwards";
    setTimeout(()=>{
      pushUndo();
      players[i].cards.splice(ci,1);
      players[i].override=null;
      renderAll(); save();
    }, 120);
    return;
  }

  const directBtn = e.target.closest('button[data-direct="1"]');
  if(directBtn){
    e.preventDefault();
    const i=Number(directBtn.dataset.i);
    openPopup(i, true);
    return;
  }

  const plus=e.target.closest(".plusBtn");
  if(plus){
    e.preventDefault();
    const i=Number(plus.dataset.i);
    longPressFired=false;
    clearTimeout(pressTimer);
    pressTimer=setTimeout(()=>{
      longPressFired=true;
      openPopup(i, true);
    }, 320);
    plus.setPointerCapture?.(e.pointerId);
  }
},{passive:false});

$("playersContainer").addEventListener("pointerup",(e)=>{
  const plus=e.target.closest(".plusBtn");
  if(!plus) return;
  clearTimeout(pressTimer);
  if(!longPressFired){
    const i=Number(plus.dataset.i);
    openPopup(i, false);
  }
},{passive:false});

/* ---------- Utils ---------- */
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ---------- Init ---------- */
// Safety: ensure overlays start hidden
try{ $('overlay').style.display='none'; $('popup').style.display='none'; $('sheetOverlay').style.display='none'; $('sheet').classList.remove('open'); }catch(e){}

buildPopupGrids();
load();
syncTogglesUI();
renderAll();
renderSheetPlayers();
