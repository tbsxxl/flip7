(function(){
  const data = window.RECIPE_DATA;
  if(!data) return;
  const U = window.KOCHBUCH_UTILS;
  const UI = window.KOCHBUCH_UI || {};
  const $ = (s)=>document.querySelector(s);
  const ls = {
    get(k, fb){ try{ const v = localStorage.getItem(k); return v?JSON.parse(v):fb; }catch{return fb;} },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
  };

  function lightTap(){ try{ UI.haptic?.('light'); }catch{} }
  function successTap(){ try{ UI.haptic?.('success'); }catch{} }
  function pop(el){ try{ UI.pop?.(el); }catch{} }
  function pulse(el){ try{ UI.pulse?.(el); }catch{} }
  function flash(el){ try{ UI.flash?.(el); }catch{} }
  const baseServings = Number(data.baseServings || 1);
  const servingsInput = $("#servingsInput");
  const servingsMinus = $("#servingsMinus");
  const servingsPlus = $("#servingsPlus");
  const baseServingsEl = $("#baseServings");
  const listEl = $("#ingredientsList");
  if(baseServingsEl) baseServingsEl.textContent = String(baseServings);
  if(servingsInput) servingsInput.value = String(baseServings);

  const num = (x)=>U.tryNum(x);
  function currentServings(){
    const v = num(servingsInput?.value);
    return (v && v>0) ? v : baseServings;
  }
  function parseIngredientsFromBody(){
    const body = document.querySelector('.recipeBody');
    if(!body) return [];

    // Find a heading that contains "Zutaten" and parse the first UL/OL after it.
    const headings = Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const h = headings.find(el => /zutaten/i.test(el.textContent||''));
    if(!h) return [];

    let n = h.nextElementSibling;
    while(n && !/^(UL|OL)$/i.test(n.tagName)) n = n.nextElementSibling;
    if(!n) return [];
    const lis = Array.from(n.querySelectorAll('li'));
    if(!lis.length) return [];

    return lis
      .map(li => (li.textContent||'').trim())
      .filter(Boolean)
      .map((t, idx) => ({ idx, item: t, unit: '', qty: null }));
  }

  function scaledIngredients(){
    const factor = currentServings() / baseServings;
    let ings = Array.isArray(data.ingredients) ? data.ingredients : [];
    // Fallback: allow recipes that keep ingredients in markdown body.
    if(!ings.length) ings = parseIngredientsFromBody();

    return ings.map((i,idx)=>{
      const q = num(i.qty);
      return {
        idx,
        item: String(i.item || '').trim(),
        unit: String(i.unit || ''),
        qty: (q === null ? i.qty : q * factor)
      };
    });
  }
  
const ingCheckKey = `kochbuch.ingchecks.${data.id}`;
function getIngChecks(){ return ls.get(ingCheckKey, {}); }
function setIngChecks(v){ ls.set(ingCheckKey, v); }


function renderIngredients(){
  if(!listEl) return;
  const items = scaledIngredients();
  const checks = getIngChecks(); // { [idx]: true }

  U.renderToggleList(listEl, items, {
    emptyText: "Keine Zutaten.",
    getId: (it)=>String(it.idx),
    getLabel: (it)=>it.item,
    getSub: ()=>"",
    getRightText: (it)=>{
      const unit = U.normUnit(it.unit||"");
      const qn = num(it.qty);
      if(qn !== null){
        const conv = U.autoConvert(qn, unit);
        return `${U.roundSmart(conv.qty)} ${conv.unit}`.trim();
      }
      return `${String(it.qty||"").trim()} ${unit}`.trim();
    },
    isChecked: (it)=>!!checks[it.idx],
    onToggle: (it, _idx, now)=>{
      const c = getIngChecks();
      if(now) c[it.idx] = true; else delete c[it.idx];
      setIngChecks(c);
      lightTap();
      renderIngredients();
    }
  });
}


  function setServings(v){
    const prev = currentServings();
    const n = Math.max(1, Math.min(999, Math.round(Number(v) || baseServings)));
    if(servingsInput) servingsInput.value = String(n);
    renderIngredients();
    if(n !== prev){
      lightTap();
      pulse(servingsInput);
    }
  }

  servingsInput?.addEventListener("input", renderIngredients);
  servingsInput?.addEventListener("blur", ()=>{ setServings(currentServings()); pulse(servingsInput); });
  servingsPlus?.addEventListener("click", ()=> setServings(currentServings() + 1));
  servingsMinus?.addEventListener("click", ()=> setServings(currentServings() - 1));

  // Freezer
  const freezerKey = "kochbuch.freezer";
  const freezerBtn = null;
  const freezerSheetOpenBtn = $("#sheetFreezerBtn");
  const freezerOverlay = $("#freezerSheetOverlay");
  const freezerSheet = $("#freezerSheet");
  const freezerClose = $("#freezerSheetClose");
  const freezerMinus = $("#freezerMinus");
  const freezerPlus = $("#freezerPlus");
  const freezerCount = $("#freezerCount");
  const freezerHint = $("#freezerHint");
  const freezerRemove = $("#freezerRemove");
  function getFreezer(){ return ls.get(freezerKey, {}); }
  function setFreezer(v){ ls.set(freezerKey, v); }
  function freezerEntry(){ const f=getFreezer(); return f[data.id] || null; }
  function renderFreezer(){
    const e = freezerEntry();
    // Update label inside the recipe "Mehr" sheet
    if(freezerSheetOpenBtn){
      freezerSheetOpenBtn.innerHTML = e?.portions
        ? `<span class="rowGlyph" aria-hidden="true">❄︎</span><span>Kühltruhe · ${e.portions} Portion${e.portions===1?"":"en"}</span>`
        : `<span class="rowGlyph" aria-hidden="true">❄︎</span><span>Kühltruhe</span>`;
    }
  }

  function openFreezerSheet(){
    if(!freezerOverlay || !freezerSheet) return;
    // close recipe sheet if open
    document.getElementById('recipeSheetOverlay')?.classList.remove('open');
    const rs = document.getElementById('recipeSheet');
    rs?.classList.remove('open');
    rs?.setAttribute('aria-hidden','true');
    freezerOverlay.classList.add('open');
    freezerSheet.classList.add('open');
    freezerSheet.setAttribute('aria-hidden','false');
    syncFreezerSheet();
  }
  function closeFreezerSheet(){
    freezerOverlay?.classList.remove('open');
    freezerSheet?.classList.remove('open');
    freezerSheet?.setAttribute('aria-hidden','true');
  }
  function syncFreezerSheet(){
    const e = freezerEntry();
    const p = e?.portions ? Number(e.portions) : 0;
    if(freezerCount) freezerCount.textContent = String(p);
    if(freezerHint) freezerHint.textContent = e ? 'In Kühltruhe gespeichert' : 'Nicht in Kühltruhe';
    freezerMinus && (freezerMinus.disabled = p<=0);
    freezerRemove && (freezerRemove.disabled = !e);
  }
  function setPortions(p){
    const prev = Number(freezerEntry()?.portions || 0);
    const f = getFreezer();
    const n = Math.max(0, Math.min(999, Math.round(Number(p)||0)));
    if(n<=0){
      delete f[data.id];
    }else{
      f[data.id] = { portions: n, added: (f[data.id]?.added || new Date().toISOString()) };
    }
    setFreezer(f);
    renderFreezer();
    syncFreezerSheet();
    if(n !== prev){
      (n > prev ? lightTap : lightTap)();
      pulse(freezerCount);
      pulse(freezerSheetOpenBtn);
    }
  }

  freezerSheetOpenBtn?.addEventListener('click', ()=>{ openFreezerSheet(); });
  freezerOverlay?.addEventListener('click', closeFreezerSheet);
  freezerClose?.addEventListener('click', closeFreezerSheet);
  freezerPlus?.addEventListener('click', ()=>{
    const e=freezerEntry();
    const p = (e?.portions?Number(e.portions):0) + 1;
    setPortions(p);
  });
  freezerMinus?.addEventListener('click', ()=>{
    const e=freezerEntry();
    const p = (e?.portions?Number(e.portions):0) - 1;
    setPortions(p);
  });
  freezerRemove?.addEventListener('click', ()=> setPortions(0));

  // Stats
  const statsKey = "kochbuch.stats";
  const cookedBtn = $("#sheetCookedBtn");
  const undoBtn = $("#undoCookedBtn");
  const favBtn = $("#sheetFavoriteBtn");
  const statsLine = $("#statsLine");
  const favPill = $("#favPill");

  function getStats(){ return ls.get(statsKey, {}); }
  function setStats(v){ ls.set(statsKey, v); }
  function getEntry(){
    const all = getStats();
    return all[data.id] || { cookedCount:0, lastCooked:null, history:[], favorite:false };
  }
  function setEntry(e){
    const all = getStats(); all[data.id]=e; setStats(all);
  }
  function fmt(iso){
    if(!iso) return "—";
    const d=new Date(iso);
    if(isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("de-DE");
  }
  function renderStats(){
    const e=getEntry();
    if(favBtn){
      favBtn.innerHTML = `<span class="rowGlyph" aria-hidden="true">${e.favorite ? '★' : '☆'}</span><span>Favorit</span>`;
      favBtn.classList.toggle("blue", !!e.favorite);
    }
    if(favPill){
      favPill.hidden = !e.favorite;
    }
    if(statsLine){
      statsLine.textContent = `Gekocht: ${e.cookedCount||0}× · Zuletzt: ${e.lastCooked?fmt(e.lastCooked):"—"}`;
    }
    if(cookedBtn){
      cookedBtn.innerHTML = `<span class="rowGlyph" aria-hidden="true">✓</span><span>Gekocht${(e.cookedCount||0)>0 ? ` · ${e.cookedCount||0}×` : ''}</span>`;
      cookedBtn.classList.toggle('green', (e.cookedCount||0)>0);
    }
    if(undoBtn) undoBtn.style.opacity = (e.cookedCount||0)>0 ? "1" : ".55";
  }
  favBtn?.addEventListener("click", ()=>{
    const e=getEntry();
    e.favorite=!e.favorite;
    if(e.favorite) e.favoriteAt=new Date().toISOString();
    setEntry(e);
    renderStats(); successTap(); pop(favBtn); pop(favPill);
    if(typeof window.updateFavBadges === "function") window.updateFavBadges();
    window.dispatchEvent(new Event("kochbuch:stats"));
  });
  cookedBtn?.addEventListener("click", ()=>{
    const e=getEntry();
    const now=new Date().toISOString();
    e.cookedCount=(e.cookedCount||0)+1;
    e.lastCooked=now;
    e.history=Array.isArray(e.history)?e.history:[];
    e.history.unshift(now);
    e.history=e.history.slice(0,50);
    setEntry(e);
    cookedBtn.classList.add("saved"); setTimeout(()=>cookedBtn.classList.remove("saved"),600);
    renderStats();
    successTap();
    pop(cookedBtn);
    flash(statsLine);
  });
  undoBtn?.addEventListener("click", ()=>{
    const e=getEntry();
    if((e.cookedCount||0)<=0) return;
    e.history=Array.isArray(e.history)?e.history:[];
    if(e.history.length) e.history.shift();
    e.cookedCount=Math.max(0,(e.cookedCount||0)-1);
    e.lastCooked=e.history.length?e.history[0]:null;
    setEntry(e);
    undoBtn.classList.add("saved"); setTimeout(()=>undoBtn.classList.remove("saved"),600);
    renderStats();
    lightTap();
    pop(undoBtn);
    flash(statsLine);
  });

  // Shopping add
  const shopKey = "kochbuch.shopping";
  const addBtn = $("#addToShopping");
  function normKey(s){ return String(s||"").trim().toLowerCase(); }
  function mergeIntoShopping(ings){
    const list = ls.get(shopKey, []);
    const map = new Map();
    for(const e of list) map.set(`${normKey(e.item)}|${normKey(e.unit)}`, e);
    for(const i of ings){
      const item=String(i.item||"").trim(); if(!item) continue;
      const unit=U.normUnit(i.unit||"");
      const q0=num(i.qty);
      const conv=(q0!==null)?U.autoConvert(q0, unit):{qty:null,unit};
      const k=`${normKey(item)}|${normKey(conv.unit)}`;
      const ex=map.get(k);
      if(ex){
        if(typeof ex.qty==="number" && typeof conv.qty==="number"){
          const sum=ex.qty+conv.qty;
          const c2=U.autoConvert(sum, conv.unit);
          ex.qty=c2.qty; ex.unit=c2.unit;
        }else if(ex.qty==null && typeof conv.qty==="number"){
          ex.qty=conv.qty; ex.unit=conv.unit;
        }
        ex.checked=false;
      }else{
        map.set(k,{item,unit:conv.unit,qty:(typeof conv.qty==="number"?conv.qty:null),checked:false});
      }
    }
    const out = Array.from(map.values()).sort((a,b)=>String(a.item).localeCompare(String(b.item),"de"));
    ls.set(shopKey,out);
  }
  addBtn?.addEventListener("click", ()=>{
    mergeIntoShopping(scaledIngredients());
    addBtn.classList.add("saved"); setTimeout(()=>addBtn.classList.remove("saved"),600);
    successTap();
    pop(addBtn);
  });

  // Cooking mode
  const cookingBtn = $("#cookingModeBtn");
  const cookingQuick = $("#cookingModeQuick");

  // Kühltruhe quick action: opens freezer sheet
  const freezerQuick = $("#freezerQuick");
  freezerQuick?.addEventListener('click', ()=>{
    openFreezerSheet();
  });

const cookOverlay = $("#cookOverlay");
  const cookClose = $("#cookClose");
  const cookTitle = $("#cookTitle");
  const cookStepPill = $("#cookStepPill");
  const cookStepText = $("#cookStepText");
  const cookPrev = $("#cookPrev");
  const cookNext = $("#cookNext");
  const cookTabSteps = $("#cookTabSteps");
  const cookTabIngs = $("#cookTabIngs");
  const cookPanelSteps = $("#cookPanelSteps");
  const cookPanelIngs = $("#cookPanelIngs");
  const cookIngredients = $("#cookIngredients");

  let steps = [];
  let stepIdx = 0;
  let wakeLock = null;

  function collectSteps(){
    const body = document.querySelector('.recipeBody');
    if(!body) return [];
    const lis = Array.from(body.querySelectorAll('ol li'));
    const out = lis.map(li=>li.textContent.trim()).filter(Boolean);
    if(out.length) return out;
    // fallback: paragraphs as steps
    return Array.from(body.querySelectorAll('p'))
      .map(p=>p.textContent.trim())
      .filter(t=>t.length>3)
      .slice(0, 30);
  }

  function renderCookStep(){
    if(!cookStepText || !cookStepPill) return;
    const total = steps.length || 1;
    stepIdx = Math.max(0, Math.min(total-1, stepIdx));
    cookStepText.textContent = steps[stepIdx] || '—';
    cookStepPill.textContent = `${stepIdx+1}/${total}`;
    if(cookPrev) cookPrev.disabled = stepIdx===0;
    if(cookNext) cookNext.disabled = stepIdx>=total-1;
  }

  function renderCookIngredients(){
    if(!cookIngredients) return;
    const ings = scaledIngredients();
    cookIngredients.innerHTML = '';
    for(const i of ings){
      const unit = U.normUnit(i.unit||"");
      const qn = num(i.qty);
      let qty = '';
      if(qn !== null){
        const conv = U.autoConvert(qn, unit);
        qty = `${U.roundSmart(conv.qty)} ${conv.unit}`.trim();
      }else{
        qty = `${String(i.qty||"").trim()} ${unit}`.trim();
      }
      const row = document.createElement('label');
      row.className = 'cookIngRow';
      row.innerHTML = `<input class="cookChk" type="checkbox" /> <div class="cookIngText"><div style="font-weight:700">${i.item||'—'}</div><div style="opacity:.85;margin-top:2px">${qty}</div></div>`;
      cookIngredients.appendChild(row);
    }
  }

  async function requestWakeLock(){
    try{
      if('wakeLock' in navigator && navigator.wakeLock?.request){
        wakeLock = await navigator.wakeLock.request('screen');
      }
    }catch{ /* ignore */ }
  }
  async function releaseWakeLock(){
    try{ await wakeLock?.release(); }catch{}
    wakeLock = null;
  }

  function openCook(){
    if(!cookOverlay) return;
    // close recipe sheet if open
    document.getElementById('recipeSheetOverlay')?.classList.remove('open');
    const rs = document.getElementById('recipeSheet');
    rs?.classList.remove('open');
    rs?.setAttribute('aria-hidden','true');
    steps = collectSteps();
    stepIdx = 0;
    if(cookTitle) cookTitle.textContent = data.title || 'Kochmodus';
    cookOverlay.classList.add('open');
    cookOverlay.setAttribute('aria-hidden','false');
    document.body.classList.add('noScroll');
    renderCookIngredients();
    renderCookStep();
    requestWakeLock();
  }
  function closeCook(){
    cookOverlay?.classList.remove('open');
    cookOverlay?.setAttribute('aria-hidden','true');
    document.body.classList.remove('noScroll');
    releaseWakeLock();
  }

  function setTab(which){
    const stepsOn = which==='steps';
    cookTabSteps?.classList.toggle('active', stepsOn);
    cookTabSteps?.setAttribute('aria-selected', stepsOn?'true':'false');
    cookTabIngs?.classList.toggle('active', !stepsOn);
    cookTabIngs?.setAttribute('aria-selected', stepsOn?'false':'true');
    if(cookPanelSteps) cookPanelSteps.hidden = !stepsOn;
    if(cookPanelIngs) cookPanelIngs.hidden = stepsOn;
  }

  cookingBtn?.addEventListener('click', openCook);
  cookingQuick?.addEventListener('click', openCook);
  cookClose?.addEventListener('click', closeCook);
  cookOverlay?.addEventListener('click', (e)=>{ if(e.target === cookOverlay) closeCook(); });
  cookPrev?.addEventListener('click', ()=>{ stepIdx--; renderCookStep(); lightTap(); pulse(cookStepText); });
  cookNext?.addEventListener('click', ()=>{ stepIdx++; renderCookStep(); lightTap(); pulse(cookStepText); });
  cookTabSteps?.addEventListener('click', ()=>{ setTab('steps'); lightTap(); pulse(cookTabSteps); });
  cookTabIngs?.addEventListener('click', ()=>{ setTab('ings'); lightTap(); pulse(cookTabIngs); });

  document.addEventListener('keydown', (e)=>{
    if(!cookOverlay?.classList.contains('open')) return;
    if(e.key === 'Escape') closeCook();
    if(e.key === 'ArrowRight') { stepIdx++; renderCookStep(); }
    if(e.key === 'ArrowLeft') { stepIdx--; renderCookStep(); }
  });

  renderIngredients();
  renderFreezer();
  renderStats();
})();