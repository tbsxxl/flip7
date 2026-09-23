/* rules.js — Flip 7 Punkteregeln (ohne DOM, auch in Node testbar) */
(function (root) {
  "use strict";

  const MODIFIERS = ["+2", "+4", "+6", "+8", "+10", "x2"];
  const FLIP7_BONUS = 15;

  const isNumber = (c) => typeof c === "number";

  /* Wertet die Eingabe eines Spielers für eine Runde aus.
     entry = { cards: (Zahl | "+2".."+10" | "x2")[], override: Zahl|null, bust: bool }
     - Direktpunkte (override) haben Vorrang.
     - Bust: explizit markiert oder eine Zahl doppelt → 0 Punkte.
     - x2 verdoppelt nur die Zahlenkarten, danach kommen +Modifier und der Flip-7-Bonus. */
  function scoreEntry(entry) {
    const cards = (entry && entry.cards) || [];
    const nums = cards.filter(isNumber);
    const mods = cards.filter((c) => !isNumber(c));

    if (entry && entry.override != null) {
      return { score: entry.override, bust: false, manual: true, flip7: false, x2: false, numbers: nums.length, dup: null };
    }

    const seen = new Set();
    let dup = null;
    for (const n of nums) {
      if (seen.has(n)) { dup = n; break; }
      seen.add(n);
    }
    if ((entry && entry.bust) || dup !== null) {
      return { score: 0, bust: true, manual: false, flip7: false, x2: false, numbers: nums.length, dup };
    }

    const sum = nums.reduce((a, b) => a + b, 0);
    const x2 = mods.includes("x2");
    const plus = mods.reduce((a, m) => a + (m.startsWith("+") ? Number(m.slice(1)) : 0), 0);
    const flip7 = seen.size === 7;

    return {
      score: sum * (x2 ? 2 : 1) + plus + (flip7 ? FLIP7_BONUS : 0),
      bust: false, manual: false, flip7, x2, numbers: nums.length, dup: null
    };
  }

  /* Spielende: sobald nach einer Runde jemand das Ziel erreicht hat, gewinnt die höchste Punktzahl.
     Gibt die Gewinner zurück (bei Gleichstand mehrere) oder [] wenn noch niemand am Ziel ist. */
  function winners(players, target) {
    if (!players.length) return [];
    const best = Math.max(...players.map((p) => p.total));
    if (best < target) return [];
    return players.filter((p) => p.total === best);
  }

  root.Flip7Rules = { MODIFIERS, FLIP7_BONUS, scoreEntry, winners };
})(typeof globalThis !== "undefined" ? globalThis : this);
