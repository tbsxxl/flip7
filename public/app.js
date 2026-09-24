/* app.js — Flip 7 Punktezähler */
(function () {
"use strict";

const { MODIFIERS, scoreEntry, winners } = window.Flip7Rules;

/* ---------- Konstanten ---------- */
const STORE_KEY = "flip7_game_v2";
const PREFS_KEY = "flip7_prefs_v1";
const LEGACY_KEY = "flip7_state_v10";
const MAX_PLAYERS = 18;
const MAX_UNDO = 40;

const PALETTE = [
  "#2f6fed", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#dc2626",
  "#0d9488", "#ca8a04", "#db2777", "#4f46e5", "#65a30d", "#64748b"
];

/* Farben der echten Zahlenkarten */
const NUM_STYLE = {
  0:  { bg: "linear-gradient(135deg,#0cb5be 0 20%,#e70200 20% 40%,#c2549b 40% 60%,#fd8803 60% 80%,#f5f0e6 80%)", fg: "#1a1330" },
  1:  { bg: "#cbb59e" }, 2: { bg: "#dce100" }, 3: { bg: "#f14355", fg: "#fff" },
  4:  { bg: "#0cb5be", fg: "#fff" }, 5: { bg: "#329a4c", fg: "#fff" }, 6: { bg: "#c2549b", fg: "#fff" },
  7:  { bg: "#d87665", fg: "#fff" }, 8: { bg: "#b6e076" }, 9: { bg: "#fd8803", fg: "#fff" },
  10: { bg: "#e70200", fg: "#fff" }, 11: { bg: "#8eabda" }, 12: { bg: "#937972", fg: "#fff" }
};

/* ---------- Helfer ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const emptyEntry = () => ({ cards: [], override: null, bust: false });

function storageGet(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
function storageSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

/* ---------- Zustand ---------- */
const newGame = (players = []) => ({ players, round: 0, target: 200, locked: false, dealer: null });

let game = newGame();
let undoStack = []; // [{ label, snap }]
let prefs = { theme: "light", compact: false, contrast: false, wake: false, haptics: true, auto: true, recent: [] };
let lastDeltas = null; // { [playerId]: {s,b,f,m} } – Ergebnis der zuletzt beendeten Runde

function save() { storageSet(STORE_KEY, { game, undo: undoStack, lastDeltas }); }
function savePrefs() { storageSet(PREFS_KEY, prefs); }

function load() {
  const p = storageGet(PREFS_KEY);
  if (p) prefs = { ...prefs, ...p };

  const s = storageGet(STORE_KEY);
  if (s && s.game && Array.isArray(s.game.players)) {
    game = { ...newGame(), ...s.game };
    undoStack = Array.isArray(s.undo) ? s.undo.slice(-MAX_UNDO) : [];
    lastDeltas = s.lastDeltas || null;
    return;
  }
  migrateLegacy();
}

/* Übernimmt einen laufenden Spielstand der alten Version (flip7_state_v10). */
function migrateLegacy() {
  const old = storageGet(LEGACY_KEY);
  if (!old || !Array.isArray(old.players)) return;
  game = newGame(old.players.map((op) => {
    let bustsLeft = op.busts || 0;
    const rounds = (op.rounds || []).map((s) => {
      const b = s === 0 && bustsLeft > 0;
      if (b) bustsLeft--;
      return { s, b, f: false, m: false };
    });
    return {
      id: uid(), name: String(op.name || "Spieler"), color: op.color || PALETTE[0],
      total: op.total || 0, rounds,
      cur: { cards: op.cards || [], override: typeof op.override === "number" ? op.override : null, bust: false }
    };
  }));
  game.round = old.roundNumber || 0;
  game.target = typeof old.target === "number" && old.target > 0 ? old.target : 200;
  game.locked = !!old.gameLocked;
  if (old.compact) prefs.compact = true;
  if (old.contrast) prefs.contrast = true;
  save(); savePrefs();
}

function commit(label, mutate) {
  undoStack.push({ label, snap: JSON.stringify({ game, lastDeltas }) });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  mutate();
  save();
  render();
}

function undo() {
  const u = undoStack.pop();
  if (!u) return;
  const s = JSON.parse(u.snap);
  game = s.game;
  lastDeltas = s.lastDeltas || null;
  save();
  render();
  showToast("Rückgängig: " + u.label, false);
}

/* ---------- Abgeleitete Werte ---------- */
const liveOf = (p) => scoreEntry(p.cur);
const hasInput = (p) => p.cur.cards.length > 0 || p.cur.override != null || p.cur.bust;

function ranking() {
  return game.players
    .map((p) => ({ p, score: p.total + liveOf(p).score }))
    .sort((a, b) => b.score - a.score);
}

/* Geber & Reihenfolge: Es beginnt die Person links vom Geber (= nächste in der Liste). */
function dealerIdx() {
  const i = game.players.findIndex((p) => p.id === game.dealer);
  return i >= 0 ? i : 0;
}
/* Nächste Person ohne Eingabe, ab fromId im Uhrzeigersinn (fromId selbst ausgenommen).
   Ohne fromId: ab der Startperson dieser Runde. */
function nextPending(fromId) {
  const n = game.players.length;
  if (!n) return null;
  const from = game.players.findIndex((p) => p.id === fromId);
  const start = from >= 0 ? from + 1 : dealerIdx() + 1;
  for (let k = 0; k < n; k++) {
    const p = game.players[(start + k) % n];
    if (p.id !== fromId && !hasInput(p)) return p;
  }
  return null;
}

/* ---------- Haptik ---------- */
function vib(ms) { if (prefs.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

/* ---------- Rendering ---------- */
function render() {
  renderTop();
  renderSetup();
  renderLeader();
  renderPlayers();
  renderHistory();
  $("endRoundBtn").disabled = game.players.length === 0;
  // Solange jemand ohne Eingabe ist, ist „Eintragen“ die Hauptaktion (geht der Reihe nach durch).
  const pend = nextPending(null);
  $("enterBtn").hidden = !pend;
  $("enterBtn").classList.toggle("btn--primary", !!pend);
  $("endRoundBtn").classList.toggle("btn--primary", !pend);
  $("endRoundBtn").textContent = pend ? "Beenden" : `Runde ${game.round + 1} beenden`;
  $("endRoundBtn").setAttribute("aria-label", `Runde ${game.round + 1} beenden`);
  if (pend) {
    $("enterBtn").firstChild.textContent = pend.name + " ";
    $("enterBtn").setAttribute("aria-label", `Karten für ${pend.name} eintragen`);
  }
  const u = undoStack[undoStack.length - 1];
  $("undoBtn").disabled = !u;
  $("undoBtn").setAttribute("aria-label", u ? "Rückgängig: " + u.label : "Rückgängig");
  $("undoBtn").title = u ? "Rückgängig: " + u.label : "";
  if ($("menuDlg").open) renderMenu();
}

function renderTop() {
  const n = game.players.length;
  $("subline").textContent = game.round > 0
    ? `Runde ${game.round} · Ziel ${game.target}`
    : `Ziel ${game.target} · ${n} Spieler`;
}

function renderSetup() {
  const show = !game.locked;
  $("setup").hidden = !show;
  if (!show) return;

  $("setupPlayers").innerHTML = game.players.map((p, i) => `
    <li class="seat" style="--c:${p.color}" data-id="${p.id}">
      <button type="button" class="seat__grip" data-grip="${p.id}" aria-label="${esc(p.name)} verschieben (Pfeiltasten)"><svg class="ico"><use href="#i-grip"/></svg></button>
      <span class="seat__no">${i + 1}</span>
      <span class="dot"></span>
      <span class="seat__name">${esc(p.name)}</span>
      ${p.id === game.players[dealerIdx()].id ? `<span class="dealerTag" title="Geber"><svg class="ico"><use href="#i-deal"/></svg>Geber</span>` : ""}
      <button type="button" class="seat__x" data-remove="${p.id}" aria-label="${esc(p.name)} entfernen"><svg class="ico"><use href="#i-close"/></svg></button>
    </li>`).join("");

  const inGame = new Set(game.players.map((p) => p.name.toLowerCase()));
  const recent = (prefs.recent || []).filter((n) => !inGame.has(n.toLowerCase())).slice(0, 10);
  $("recentWrap").hidden = !recent.length || game.players.length >= MAX_PLAYERS;
  $("recentNames").innerHTML = recent.map((n) =>
    `<button type="button" class="recentChip" data-recent="${esc(n)}"><svg class="ico"><use href="#i-plus"/></svg>${esc(n)}</button>`).join("");

  const full = game.players.length >= MAX_PLAYERS;
  $("addName").disabled = full;
  $("addBtn").disabled = full;
  $("addName").placeholder = full ? "Maximal " + MAX_PLAYERS + " Spieler" : (game.players.length ? "Weitere Person" : "Name eingeben");

  document.querySelectorAll("#targetSeg [data-target]").forEach((b) => {
    b.setAttribute("aria-checked", String(Number(b.dataset.target) === game.target));
  });
  if (document.activeElement !== $("targetInput")) $("targetInput").value = game.target;
}

function renderLeader() {
  const r = ranking();
  const anyPoints = r.some((x) => x.score > 0);
  const el = $("leader");
  el.hidden = r.length < 2 || !anyPoints;
  if (el.hidden) return;

  const top = r[0], second = r[1];
  const tie = top.score === second.score;
  const names = r.filter((x) => x.score === top.score).map((x) => x.p.name);
  el.style.setProperty("--c", tie ? "var(--ink-2)" : top.p.color);
  $("leaderName").textContent = tie ? names.join(" & ") : top.p.name;
  el.querySelector(".leader__label").textContent = tie ? "Gleichstand" : "Führung";
  $("leaderScore").textContent = top.score;
  const left = Math.max(0, game.target - top.score);
  $("leaderGap").textContent = tie
    ? (left ? `noch ${left} bis ${game.target}` : "Ziel erreicht")
    : `+${top.score - second.score} vor ${second.p.name}`;
}

function miniCard(c) {
  if (typeof c === "number") {
    const st = NUM_STYLE[c] || {};
    return `<span class="mini" style="background:${st.bg};color:${st.fg || "#1a1330"}">${c}</span>`;
  }
  return `<span class="mini mini--mod${c === "x2" ? " mini--x2" : ""}">${c === "x2" ? "×2" : c}</span>`;
}

function renderPlayers() {
  const r = ranking();
  const rankOf = new Map(r.map((x, i) => [x.p.id, i + 1]));
  const leaderScore = r.length ? r[0].score : 0;

  $("players").innerHTML = game.players.map((p) => {
    const res = liveOf(p);
    const total = p.total + res.score;
    const pctBase = Math.min(100, (p.total / game.target) * 100);
    const pctLive = Math.min(100 - pctBase, (res.score / game.target) * 100);
    const left = Math.max(0, game.target - total);
    const isLeader = r.length > 1 && total === leaderScore && leaderScore > 0;
    const input = hasInput(p);
    const d = lastDeltas && lastDeltas[p.id];

    const isDealer = game.players.length > 1 && p.id === game.players[dealerIdx()].id;
    const quickBust = !input || (p.cur.bust && !p.cur.cards.length && p.cur.override == null);
    let state = "";
    if (res.bust && !quickBust) state = `<span class="badge badge--bust">Bust</span>`;
    else if (res.flip7) state = `<span class="badge badge--f7">Flip 7 +15</span>`;
    else if (res.manual) state = `<span class="badge">Direkt</span>`;

    let roundLine;
    if (input) {
      roundLine = `<span class="player__round${res.bust ? " is-bust" : ""}">Runde <b>${res.bust ? "0" : "+" + res.score}</b></span>
        <span class="player__cards">${res.manual ? "" : p.cur.cards.map(miniCard).join("")}</span>`;
    } else if (d) {
      roundLine = `<span class="player__round player__round--last">Letzte Runde <b>${d.b ? "Bust" : "+" + d.s}</b></span>
        <span class="player__tap"></span>`;
    } else {
      roundLine = `<span class="player__tap">Tippen für Karten</span>`;
    }

    return `
      <li class="player${isLeader ? " is-leader" : ""}${res.bust ? " is-bust" : ""}${res.flip7 ? " is-f7" : ""}" style="--c:${p.color}" data-id="${p.id}">
        <button type="button" class="player__btn" data-open="${p.id}" aria-label="${esc(p.name)}: ${total} Punkte, Platz ${rankOf.get(p.id)}. Karten eintragen">
          <span class="player__head">
            <span class="player__rank">${rankOf.get(p.id)}</span>
            <span class="player__name">${esc(p.name)}</span>
            ${isDealer ? `<span class="dealerTag dealerTag--card" title="Gibt diese Runde"><svg class="ico"><use href="#i-deal"/></svg>Geber</span>` : ""}
            ${state}
            <span class="player__total"><b data-total="${p.id}">${total}</b><small>${left ? "noch " + left : "Ziel ✓"}</small></span>
          </span>
          <span class="bar" aria-hidden="true">
            <span class="bar__base" style="width:${pctBase}%"></span>
            <span class="bar__live" style="left:${pctBase}%;width:${Math.max(0, pctLive)}%"></span>
          </span>
          <span class="player__foot${quickBust ? " has-quick" : ""}">
            ${roundLine}
          </span>
        </button>
        ${quickBust ? `<button type="button" class="quickBust" data-bust="${p.id}" aria-pressed="${!!p.cur.bust}" aria-label="${esc(p.name)} Bust${p.cur.bust ? " aufheben" : ""}">Bust</button>` : ""}
      </li>`;
  }).join("");
}

function renderHistory() {
  const wrap = $("historyWrap");
  wrap.hidden = game.round === 0 || !game.players.length;
  if (wrap.hidden) return;

  const ps = game.players;
  const head = `<thead><tr><th scope="col">R</th>${ps.map((p) =>
    `<th scope="col" style="--c:${p.color}"><span class="dot"></span>${esc(p.name)}</th>`).join("")}</tr></thead>`;

  let body = "";
  for (let i = game.round - 1; i >= 0; i--) {
    const cells = ps.map((p) => {
      const e = p.rounds[i];
      if (!e) return "<td>–</td>";
      const tag = e.b ? `<span class="tag tag--bust">B</span>` : e.f ? `<span class="tag tag--f7">7</span>` : e.m ? `<span class="tag tag--man">M</span>` : "";
      return `<td class="${e.b ? "is-bust" : ""}"><button type="button" class="cellBtn" data-edit="${p.id}:${i}" aria-label="Runde ${i + 1}, ${esc(p.name)}: ${e.b ? "Bust" : e.s} – bearbeiten">${e.b ? 0 : e.s}${tag}</button></td>`;
    }).join("");
    body += `<tr><th scope="row">${i + 1}</th>${cells}</tr>`;
  }

  const stat = (fn) => ps.map((p) => `<td>${fn(p)}</td>`).join("");
  const avg = (p) => p.rounds.length ? (p.rounds.reduce((a, e) => a + e.s, 0) / p.rounds.length).toFixed(1) : "–";
  const best = (p) => p.rounds.length ? Math.max(...p.rounds.map((e) => e.s)) : "–";
  const busts = (p) => {
    const b = p.rounds.filter((e) => e.b).length;
    return p.rounds.length ? `${b} <small>(${Math.round((b / p.rounds.length) * 100)}%)</small>` : "–";
  };
  const flips = (p) => p.rounds.filter((e) => e.f).length;

  const foot = `<tfoot>
    <tr class="sum"><th scope="row">Σ</th>${stat((p) => `<b>${p.total}</b>`)}</tr>
    <tr><th scope="row" title="Durchschnitt pro Runde">Ø</th>${stat(avg)}</tr>
    <tr><th scope="row" title="Beste Runde">Top</th>${stat(best)}</tr>
    <tr><th scope="row" title="Busts">Bust</th>${stat(busts)}</tr>
    <tr><th scope="row" title="Flip 7">F7</th>${stat(flips)}</tr>
  </tfoot>`;

  $("historyTable").innerHTML = head + foot + `<tbody>${body}</tbody>`;
}

/* ---------- Zahlen-Animation ---------- */
function countUp(el, from, to, ms = 450) {
  if (!el || reduceMotion() || from === to) return;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = from;
  requestAnimationFrame(step);
}

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(text, withUndo) {
  $("toastText").textContent = text;
  $("toastUndo").hidden = !withUndo;
  $("toast").classList.add("is-open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, withUndo ? 4500 : 2200);
}
function hideToast() { clearTimeout(toastTimer); $("toast").classList.remove("is-open"); }

/* ---------- Dialoge (native <dialog>, Zurück-Taste schließt) ---------- */
const dlgStack = [];
let ignorePops = 0;
let pendingOpen = [];

function openDlg(d) {
  if (ignorePops > 0) { pendingOpen.push(d); return; } // auf history.back() warten
  d.returnValue = "";
  d.showModal();
  dlgStack.push(d);
  history.pushState({ f7dlg: dlgStack.length }, "");
}

function onDlgClosed(d) {
  const i = dlgStack.indexOf(d);
  if (i === -1) return; // bereits per Zurück-Taste geschlossen
  dlgStack.splice(i, 1);
  ignorePops++;
  history.back();
}

window.addEventListener("popstate", () => {
  if (ignorePops > 0) {
    ignorePops--;
    if (ignorePops === 0 && pendingOpen.length) {
      const list = pendingOpen; pendingOpen = [];
      list.forEach(openDlg);
    }
    return;
  }
  const d = dlgStack.pop();
  if (d && d.open) d.close("");
});

document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("close", () => onDlgClosed(d));
  // Tippen auf den abgedunkelten Hintergrund schließt
  d.addEventListener("click", (e) => { if (e.target === d) d.close(""); });
  // Formulare: Wert des Buttons als returnValue, Enter ohne Button = "ok"
  const f = d.querySelector("form");
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    d.close(e.submitter ? e.submitter.value : "ok");
  });
});

/* Wisch-nach-unten schließt Sheets */
document.querySelectorAll("dialog.sheet").forEach((d) => {
  const handle = d.querySelector(".sheet__grab");
  const head = d.querySelector(".sheet__head");
  let y0 = null, dy = 0, t0 = 0;
  const start = (e) => {
    if (e.target.closest("button")) return;
    y0 = e.clientY; dy = 0; t0 = performance.now();
    d.style.transition = "none";
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    d.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null;
    d.style.transition = "";
    d.style.transform = "";
    if (dy > 110 || v > 0.8) d.close("");
  };
  [handle, head].forEach((el) => {
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  });
});

function confirmAsk(text, okLabel = "OK", danger = false) {
  return new Promise((resolve) => {
    const d = $("confirmDlg");
    $("confirmText").textContent = text;
    $("confirmYes").textContent = okLabel;
    $("confirmYes").classList.toggle("btn--danger", danger);
    $("confirmYes").classList.toggle("btn--primary", !danger);
    const done = () => { d.removeEventListener("close", done); resolve(d.returnValue === "yes"); };
    d.addEventListener("close", done);
    openDlg(d);
  });
}

/* ---------- Setup ---------- */
function nextColor() {
  const used = new Set(game.players.map((p) => p.color));
  return PALETTE.find((c) => !used.has(c)) || PALETTE[game.players.length % PALETTE.length];
}

function addPlayer(raw) {
  const name = String(raw).trim().replace(/\s+/g, " ");
  if (!name || game.locked || game.players.length >= MAX_PLAYERS) return false;
  prefs.recent = [name, ...(prefs.recent || []).filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 16);
  savePrefs();
  commit(name + " hinzugefügt", () => {
    const p = { id: uid(), name, color: nextColor(), total: 0, rounds: [], cur: emptyEntry() };
    game.players.push(p);
    if (!game.dealer) game.dealer = p.id;
  });
  return true;
}
$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (addPlayer($("addName").value)) $("addName").value = "";
  $("addName").focus();
});
$("recentNames").addEventListener("click", (e) => {
  const b = e.target.closest("[data-recent]");
  if (b) { addPlayer(b.dataset.recent); vib(8); }
});

/* Sitzreihenfolge: am Griff ziehen (Maus/Touch) oder Pfeiltasten */
function reorder(ids, label = "Reihenfolge geändert") {
  const cur = game.players.map((p) => p.id).join();
  if (ids.join() === cur) return;
  commit(label, () => {
    const byId = new Map(game.players.map((p) => [p.id, p]));
    game.players = ids.map((id) => byId.get(id)).filter(Boolean);
  });
}
(() => {
  const list = $("setupPlayers");
  let drag = null;
  list.addEventListener("pointerdown", (e) => {
    const g = e.target.closest("[data-grip]");
    if (!g || game.locked) return;
    e.preventDefault();
    const li = g.closest("li");
    drag = { li, pid: e.pointerId, y0: e.clientY };
    li.classList.add("is-dragging");
    g.setPointerCapture?.(e.pointerId);
  });
  list.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const rows = [...list.children].filter((x) => x !== drag.li);
    const before = rows.find((r) => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (before) { if (drag.li.nextElementSibling !== before) list.insertBefore(drag.li, before); }
    else if (list.lastElementChild !== drag.li) list.appendChild(drag.li);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.li.classList.remove("is-dragging");
    drag = null;
    reorder([...list.children].map((li) => li.dataset.id));
    vib(10);
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
  list.addEventListener("keydown", (e) => {
    const g = e.target.closest("[data-grip]");
    if (!g || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const ids = game.players.map((p) => p.id);
    const i = ids.indexOf(g.dataset.grip), j = i + (e.key === "ArrowUp" ? -1 : 1);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder(ids);
    list.querySelector(`[data-grip="${g.dataset.grip}"]`)?.focus();
  });
})();

$("setupPlayers").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (!b || game.locked) return;
  const p = game.players.find((x) => x.id === b.dataset.remove);
  if (!p) return;
  vib(15);
  commit(p.name + " entfernt", () => { game.players = game.players.filter((x) => x !== p); });
});

function setTarget(v) {
  v = Math.floor(Number(v));
  if (!Number.isFinite(v) || v < 1 || game.locked) { renderSetup(); return; }
  v = Math.min(9999, v);
  if (v === game.target) return;
  commit("Ziel " + v, () => { game.target = v; });
}
$("targetSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-target]");
  if (b) setTarget(b.dataset.target);
});
$("targetInput").addEventListener("change", () => setTarget($("targetInput").value));
$("targetInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("targetInput").blur(); });

/* ---------- Karten-Eingabe ---------- */
let entryPlayer = null;
let draft = emptyEntry();
let draftStack = [];

function buildGrids() {
  $("numGrid").innerHTML = Array.from({ length: 13 }, (_, n) => {
    const st = NUM_STYLE[n];
    return `<button type="button" class="numCard" data-num="${n}" style="--bg:${st.bg};--fg:${st.fg || "#1a1330"}"><span>${n}</span></button>`;
  }).join("");
  $("modGrid").innerHTML = MODIFIERS.map((m) =>
    `<button type="button" class="modCard${m === "x2" ? " modCard--x2" : ""}" data-mod="${m}" aria-pressed="false">${m === "x2" ? "×2" : m}</button>`
  ).join("");
}

function pushDraft() {
  draftStack.push(clone(draft));
  if (draftStack.length > 60) draftStack.shift();
}

function openEntry(id, tab = "cards") {
  const p = game.players.find((x) => x.id === id);
  if (!p) return;
  entryPlayer = p;
  draft = clone(p.cur);
  draftStack = [];
  $("entryName").textContent = p.name;
  $("entryDlg").style.setProperty("--c", p.color);
  $("directInput").value = draft.override != null ? draft.override : "";
  setTab(draft.override != null ? "direct" : tab);
  renderDraft();
  openDlg($("entryDlg"));
}

function setTab(t) {
  const cards = t === "cards";
  $("tabCards").setAttribute("aria-selected", String(cards));
  $("tabDirect").setAttribute("aria-selected", String(!cards));
  $("viewCards").hidden = !cards;
  $("viewDirect").hidden = cards;
  if (!cards) setTimeout(() => { $("directInput").focus(); $("directInput").select(); }, 50);
}

let prevFx = "";
function renderDraft() {
  const res = scoreEntry(draft);
  const nums = draft.cards.filter((c) => typeof c === "number");
  const uniq = new Set(nums);

  $("picked").innerHTML = draft.cards.length
    ? draft.cards.map((c, i) => `<button type="button" class="pickedCard" data-idx="${i}" aria-label="${c} entfernen">${miniCard(c)}</button>`).join("")
    : `<span class="picked__empty">Noch keine Karten – unten antippen</span>`;

  document.querySelectorAll("#numGrid [data-num]").forEach((b) => {
    const n = Number(b.dataset.num);
    b.classList.toggle("is-picked", uniq.has(n));
    b.classList.toggle("is-dup", res.dup === n);
    b.disabled = res.flip7 && !uniq.has(n); // nach Flip 7 ist die Runde vorbei
  });
  document.querySelectorAll("#modGrid [data-mod]").forEach((b) => {
    b.setAttribute("aria-pressed", String(draft.cards.includes(b.dataset.mod)));
  });
  $("bustBtn").setAttribute("aria-pressed", String(!!draft.bust));

  let state;
  if (res.manual) state = "Direktpunkte";
  else if (res.bust) state = res.dup !== null ? `Bust – ${res.dup} doppelt` : "Bust";
  else if (res.flip7) state = "Flip 7! +15 Bonus" + (res.x2 ? " · ×2" : "");
  else if (!draft.cards.length) state = "Noch keine Karten";
  else state = `${nums.length} ${nums.length === 1 ? "Zahl" : "Zahlen"}${res.x2 ? " · ×2" : ""}`;

  $("previewScore").textContent = res.score;
  $("previewState").textContent = state;
  $("previewTotal").textContent = entryPlayer ? `Gesamt danach: ${entryPlayer.total + res.score} / ${game.target}` : "";
  const pv = $("preview");
  pv.classList.toggle("is-bust", res.bust);
  pv.classList.toggle("is-f7", res.flip7);

  // „Weiter“: nächste Person ohne Eingabe, sonst Runde beenden
  const nxt = entryPlayer ? nextPending(entryPlayer.id) : null;
  $("entryNext").value = nxt ? "next" : "end";
  $("entryNextLabel").textContent = nxt ? nxt.name : "Runde beenden";
  $("entryNext").setAttribute("aria-label", nxt ? `Übernehmen, weiter zu ${nxt.name}` : "Übernehmen und Runde beenden");

  cancelAuto();
  const fx = res.bust ? "bust" : res.flip7 ? "f7" : "";
  if (fx && fx !== prevFx) {
    pv.classList.remove("pop"); void pv.offsetWidth; pv.classList.add("pop");
    vib(fx === "bust" ? [30, 40, 30] : 25);
    if (prefs.auto && nxt) startAuto();
  }
  prevFx = fx;
}

/* Nach Bust / Flip 7 ist die Runde für diese Person vorbei → automatisch weiter.
   Jede Berührung im Dialog (außer „Weiter“) bricht das ab. */
const AUTO_MS = 1400;
let autoTimer = null;
function startAuto() {
  const b = $("entryNext");
  b.classList.remove("is-auto"); void b.offsetWidth;
  b.style.setProperty("--auto-ms", AUTO_MS + "ms");
  b.classList.add("is-auto");
  autoTimer = setTimeout(() => { autoTimer = null; if ($("entryDlg").open) $("entryDlg").close("next"); }, AUTO_MS);
}
function cancelAuto() {
  clearTimeout(autoTimer);
  autoTimer = null;
  $("entryNext").classList.remove("is-auto");
}
$("entryDlg").addEventListener("pointerdown", (e) => {
  if (autoTimer && !e.target.closest("#entryNext, [data-num], [data-mod], #bustBtn, #entryUndoBtn, #clearBtn, [data-idx]")) cancelAuto();
});

$("numGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-num]");
  if (!b) return;
  pushDraft();
  draft.cards.push(Number(b.dataset.num));
  draft.override = null;
  $("directInput").value = "";
  vib(8);
  renderDraft();
});
$("modGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mod]");
  if (!b) return;
  pushDraft();
  const m = b.dataset.mod;
  const i = draft.cards.indexOf(m);
  if (i >= 0) draft.cards.splice(i, 1); else draft.cards.push(m); // jeder Modifier existiert nur einmal
  draft.override = null;
  $("directInput").value = "";
  vib(8);
  renderDraft();
});
$("picked").addEventListener("click", (e) => {
  const b = e.target.closest("[data-idx]");
  if (!b) return;
  pushDraft();
  draft.cards.splice(Number(b.dataset.idx), 1);
  renderDraft();
});
$("bustBtn").addEventListener("click", () => {
  pushDraft();
  draft.bust = !draft.bust;
  if (draft.bust) { draft.override = null; $("directInput").value = ""; }
  renderDraft();
});
$("clearBtn").addEventListener("click", () => {
  pushDraft();
  draft = emptyEntry();
  $("directInput").value = "";
  renderDraft();
});
$("entryUndoBtn").addEventListener("click", () => {
  const s = draftStack.pop();
  if (!s) return;
  draft = s;
  $("directInput").value = draft.override != null ? draft.override : "";
  renderDraft();
});
$("directInput").addEventListener("input", () => {
  const raw = $("directInput").value.trim();
  const v = Math.floor(Number(raw));
  pushDraft();
  draft.override = raw === "" || !Number.isFinite(v) || v < 0 ? null : Math.min(999, v);
  if (draft.override != null) draft.bust = false;
  renderDraft();
});
// Enter im Eingabefeld übernimmt (sonst würde das Formular den ersten Button = Schließen auslösen)
$("directInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("entryDlg").close("ok"); }
});
$("directClear").addEventListener("click", () => {
  pushDraft();
  draft.override = null;
  $("directInput").value = "";
  setTab("cards");
  renderDraft();
});
$("tabCards").addEventListener("click", () => setTab("cards"));
$("tabDirect").addEventListener("click", () => setTab("direct"));

$("entryDlg").addEventListener("close", () => {
  const p = entryPlayer;
  const v = $("entryDlg").returnValue;
  entryPlayer = null;
  prevFx = "";
  cancelAuto();
  if (!p || !["ok", "next", "end"].includes(v)) return;
  if (JSON.stringify(p.cur) !== JSON.stringify(draft)) {
    const next = clone(draft);
    commit("Eingabe " + p.name, () => {
      const target = game.players.find((x) => x.id === p.id);
      if (target) target.cur = next;
    });
    vib(15);
  }
  if (v === "next") {
    const n = nextPending(p.id);
    if (n) openEntry(n.id); else endRound();
  } else if (v === "end") {
    endRound();
  }
});

$("players").addEventListener("click", (e) => {
  const q = e.target.closest("[data-bust]");
  if (q) {
    const p = game.players.find((x) => x.id === q.dataset.bust);
    if (!p) return;
    const on = !p.cur.bust;
    commit(`${p.name} ${on ? "Bust" : "Bust aufgehoben"}`, () => { p.cur = on ? { cards: [], override: null, bust: true } : emptyEntry(); });
    vib(on ? [30, 40, 30] : 10);
    return;
  }
  const b = e.target.closest("[data-open]");
  if (b) openEntry(b.dataset.open);
});
$("enterBtn").addEventListener("click", () => {
  const p = nextPending(null);
  if (p) openEntry(p.id);
});

/* ---------- Vergangene Runde korrigieren ---------- */
let editRef = null;
$("historyTable").addEventListener("click", (e) => {
  const b = e.target.closest("[data-edit]");
  if (!b) return;
  const [pid, idx] = b.dataset.edit.split(":");
  const p = game.players.find((x) => x.id === pid);
  const r = p && p.rounds[Number(idx)];
  if (!r) return;
  editRef = { pid, i: Number(idx) };
  $("editKicker").textContent = `Runde ${Number(idx) + 1} korrigieren`;
  $("editTitle").textContent = p.name;
  $("editInput").value = r.b ? "" : r.s;
  $("editBust").checked = !!r.b;
  openDlg($("editDlg"));
  setTimeout(() => { if (!r.b) { $("editInput").focus(); $("editInput").select(); } }, 60);
});
$("editBust").addEventListener("change", () => { if ($("editBust").checked) $("editInput").value = ""; });
$("editInput").addEventListener("input", () => { if ($("editInput").value !== "") $("editBust").checked = false; });
$("editInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("editDlg").close("yes"); } });
$("editDlg").addEventListener("close", () => {
  const ref = editRef;
  editRef = null;
  if (!ref || $("editDlg").returnValue !== "yes") return;
  const p = game.players.find((x) => x.id === ref.pid);
  const old = p && p.rounds[ref.i];
  if (!old) return;
  const bust = $("editBust").checked;
  const v = Math.min(999, Math.max(0, Math.floor(Number($("editInput").value) || 0)));
  const s = bust ? 0 : v;
  if (bust === !!old.b && s === old.s) return;
  commit(`Runde ${ref.i + 1} ${p.name} korrigiert`, () => {
    const e = { s, b: bust, f: !bust && s === old.s && old.f, m: !bust && (s !== old.s || old.m) };
    p.rounds[ref.i] = e;
    p.total = p.rounds.reduce((a, r) => a + r.s, 0);
    if (ref.i === game.round - 1 && lastDeltas) lastDeltas[p.id] = e;
  });
});

/* ---------- Runde beenden ---------- */
async function endRound() {
  if (!game.players.length) return;
  // Leere Eingabe = Bust (schnell: nur die Punkte der anderen eintragen).
  // Nur wenn für niemanden etwas eingetragen ist, lieber nachfragen.
  if (game.players.every((p) => !hasInput(p))) {
    const ok = await confirmAsk("Noch niemand hat Karten eingetragen. Runde trotzdem mit 0 Punkten (Bust) für alle beenden?", "Beenden");
    if (!ok) return;
  }

  const before = new Map(game.players.map((p) => [p.id, p.total]));
  const roundNo = game.round + 1;

  commit(`Runde ${roundNo} beenden`, () => {
    lastDeltas = {};
    game.players.forEach((p) => {
      const r = scoreEntry(p.cur);
      const e = { s: r.score, b: r.bust || !hasInput(p), f: r.flip7, m: r.manual };
      p.total += r.score;
      p.rounds.push(e);
      p.cur = emptyEntry();
      lastDeltas[p.id] = e;
    });
    game.round = roundNo;
    game.locked = true;
    const n = game.players.length;
    game.dealer = game.players[(dealerIdx() + 1) % n].id; // Geber wandert weiter
  });

  // Animationen
  game.players.forEach((p) => {
    countUp(document.querySelector(`[data-total="${p.id}"]`), before.get(p.id), p.total);
    const li = document.querySelector(`.player[data-id="${p.id}"]`);
    if (li && !reduceMotion()) li.classList.add(lastDeltas[p.id].b ? "anim-bust" : "anim-gain");
  });
  vib(20);
  showToast(`Runde ${roundNo} gespeichert`, true);

  const w = winners(game.players, game.target);
  if (w.length) setTimeout(() => showWinner(w), reduceMotion() ? 0 : 500);
}
$("endRoundBtn").addEventListener("click", endRound);

/* ---------- Spielende ---------- */
function showWinner(w) {
  const tie = w.length > 1;
  $("winKicker").textContent = `Spielende nach ${game.round} ${game.round === 1 ? "Runde" : "Runden"}`;
  $("winTitle").textContent = tie ? "Gleichstand!" : `${w[0].name} gewinnt!`;
  $("winText").textContent = tie
    ? `${w.map((p) => p.name).join(" & ")} liegen mit ${w[0].total} Punkten gleichauf – spielt eine Entscheidungsrunde.`
    : `mit ${w[0].total} Punkten`;
  $("winRanking").innerHTML = ranking().map(({ p, score }, i) => `
    <li style="--c:${p.color}"><span class="winRanking__no">${i + 1}</span><span class="dot"></span>
      <span class="winRanking__name">${esc(p.name)}</span><b>${score}</b></li>`).join("");
  $("winDlg").querySelector('[value="continue"]').textContent = tie ? "Entscheidungsrunde spielen" : "Weiterspielen";
  spawnConfetti(tie ? PALETTE : [w[0].color]);
  vib([40, 60, 40, 60, 80]);
  openDlg($("winDlg"));
}

$("winDlg").addEventListener("close", () => {
  const v = $("winDlg").returnValue;
  $("confetti").innerHTML = "";
  if (v === "rematch") rematch(false);
  if (v === "new") resetAll(true);
});

function spawnConfetti(colors) {
  const box = $("confetti");
  box.innerHTML = "";
  if (reduceMotion()) return;
  const pal = [...colors, "#fd8803", "#0cb5be", "#c2549b", "#dce100", "#e70200"];
  let html = "";
  for (let i = 0; i < 48; i++) {
    const c = pal[i % pal.length];
    html += `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;--s:${(0.6 + Math.random() * 0.8).toFixed(2)};background:${c}"></i>`;
  }
  box.innerHTML = html;
}

function rematch(ask = true) {
  const go = () => commit("Revanche", () => {
    game.players.forEach((p) => { p.total = 0; p.rounds = []; p.cur = emptyEntry(); });
    game.round = 0;
    game.locked = false;
    lastDeltas = null;
  });
  if (!ask) { go(); return Promise.resolve(); }
  return confirmAsk("Revanche starten? Alle Punkte werden auf 0 gesetzt, die Spieler bleiben.", "Revanche").then((ok) => { if (ok) go(); });
}

async function resetAll(ask = true) {
  if (ask && !(await confirmAsk("Neues Spiel starten? Alle Spieler und Punkte werden entfernt.", "Neues Spiel", true))) return;
  const target = game.target;
  commit("Neues Spiel", () => { game = newGame(); game.target = target; lastDeltas = null; });
  $("menuDlg").open && $("menuDlg").close("");
}

/* ---------- Menü ---------- */
function renderMenu() {
  const canEdit = !game.locked;
  $("menuPlayers").innerHTML = game.players.length ? game.players.map((p) => `
    <li style="--c:${p.color}">
      <button type="button" class="colorBtn" data-color="${p.id}" aria-label="Farbe von ${esc(p.name)} ändern"><span class="dot"></span></button>
      <input type="text" maxlength="20" value="${esc(p.name)}" data-rename="${p.id}" aria-label="Name" enterkeyhint="done" />
      <button type="button" class="iconBtn iconBtn--ghost iconBtn--sm dealerBtn" data-dealer="${p.id}" aria-pressed="${p.id === game.players[dealerIdx()].id}" aria-label="${esc(p.name)} ist Geber"><svg class="ico"><use href="#i-deal"/></svg></button>
      ${canEdit ? `<button type="button" class="iconBtn iconBtn--ghost iconBtn--sm" data-del="${p.id}" aria-label="${esc(p.name)} entfernen"><svg class="ico"><use href="#i-trash"/></svg></button>` : ""}
    </li>`).join("") : `<li class="menuPlayers__empty">Noch keine Spieler – auf der Startseite hinzufügen.</li>`;
  $("recolorBtn").disabled = game.players.length < 2;
  $("rematchBtn").disabled = !game.players.length || game.round === 0;

  document.querySelectorAll("#themeSeg [data-theme]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.theme === prefs.theme)));
  $("optCompact").checked = prefs.compact;
  $("optContrast").checked = prefs.contrast;
  $("optWake").checked = prefs.wake;
  $("optHaptics").checked = prefs.haptics;
  $("optAuto").checked = prefs.auto;
}

$("menuBtn").addEventListener("click", () => { renderMenu(); openDlg($("menuDlg")); });
$("undoBtn").addEventListener("click", undo);
$("toastUndo").addEventListener("click", () => { hideToast(); undo(); });

$("menuPlayers").addEventListener("change", (e) => {
  const inp = e.target.closest("[data-rename]");
  if (!inp) return;
  const p = game.players.find((x) => x.id === inp.dataset.rename);
  const name = inp.value.trim().replace(/\s+/g, " ");
  if (!p || !name) { if (p) inp.value = p.name; return; }
  if (name === p.name) return;
  commit(`${p.name} → ${name}`, () => { p.name = name; });
});
$("menuPlayers").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("[data-rename]")) { e.preventDefault(); e.target.blur(); }
});
$("menuPlayers").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  const col = e.target.closest("[data-color]");
  const deal = e.target.closest("[data-dealer]");
  if (deal && deal.dataset.dealer !== game.players[dealerIdx()]?.id) {
    const p = game.players.find((x) => x.id === deal.dataset.dealer);
    if (p) commit(`Geber: ${p.name}`, () => { game.dealer = p.id; });
    return;
  }
  if (del && !game.locked) {
    const p = game.players.find((x) => x.id === del.dataset.del);
    if (p && await confirmAsk(`${p.name} entfernen?`, "Entfernen", true)) {
      commit(p.name + " entfernt", () => { game.players = game.players.filter((x) => x !== p); });
    }
  }
  if (col) {
    const p = game.players.find((x) => x.id === col.dataset.color);
    if (!p) return;
    const used = new Set(game.players.filter((x) => x !== p).map((x) => x.color));
    const start = PALETTE.indexOf(p.color);
    let next = p.color;
    for (let k = 1; k <= PALETTE.length; k++) {
      const c = PALETTE[(start + k) % PALETTE.length];
      if (!used.has(c)) { next = c; break; }
    }
    commit("Farbe " + p.name, () => { p.color = next; });
  }
});
$("recolorBtn").addEventListener("click", () => {
  commit("Farben neu verteilt", () => {
    const pool = [...PALETTE];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    game.players.forEach((p, i) => { p.color = pool[i % pool.length]; });
  });
});
$("rematchBtn").addEventListener("click", () => rematch(true).then(() => { if (game.round === 0) $("menuDlg").close(""); }));
$("newGameBtn").addEventListener("click", () => resetAll(true));

/* ---------- Einstellungen ---------- */
const darkMq = matchMedia("(prefers-color-scheme: dark)");
function applyPrefs() {
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && darkMq.matches);
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#15121f" : "#f6f1e7");
  document.documentElement.classList.toggle("hc", prefs.contrast);
  document.body.classList.toggle("compact", prefs.compact);
  updateWakeLock();
}
darkMq.addEventListener?.("change", () => { if (prefs.theme === "system") applyPrefs(); });

$("themeSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-theme]");
  if (!b) return;
  prefs.theme = b.dataset.theme;
  savePrefs(); applyPrefs(); renderMenu();
});
[["optCompact", "compact"], ["optContrast", "contrast"], ["optWake", "wake"], ["optHaptics", "haptics"], ["optAuto", "auto"]].forEach(([id, key]) => {
  $(id).addEventListener("change", () => {
    prefs[key] = $(id).checked;
    savePrefs(); applyPrefs();
    if (key === "haptics") vib(20);
  });
});

/* Bildschirm während des Spiels anlassen (Screen Wake Lock API) */
let wakeLock = null;
async function updateWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    if (prefs.wake && document.visibilityState === "visible" && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!prefs.wake && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}
document.addEventListener("visibilitychange", updateWakeLock);

/* ---------- Tastatur (Desktop): 0–9, B = Bust, X = ×2, Rücktaste = zurück ---------- */
document.addEventListener("keydown", (e) => {
  if (!$("entryDlg").open || e.target.matches("input") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$("viewCards").hidden && e.key >= "0" && e.key <= "9") {
    $("numGrid").querySelector(`[data-num="${e.key}"]`).click();
  } else if (e.key === "Backspace") {
    e.preventDefault(); $("entryUndoBtn").click();
  } else if (e.key === "b" || e.key === "B") {
    $("bustBtn").click();
  } else if (e.key === "x" || e.key === "X" || e.key === "*") {
    $("modGrid").querySelector('[data-mod="x2"]').click();
  }
});

/* ---------- Start ---------- */
if (!("wakeLock" in navigator)) $("wakeRow").hidden = true;
if (!navigator.vibrate) $("hapticsRow").hidden = true;

buildGrids();
load();
applyPrefs();
render();

})();
