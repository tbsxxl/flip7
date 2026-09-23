import assert from "node:assert/strict";
await import("../public/rules.js");
const { scoreEntry: s, winners } = globalThis.Flip7Rules;

const e = (cards, extra = {}) => ({ cards, override: null, bust: false, ...extra });

assert.equal(s(e([])).score, 0);
assert.equal(s(e([])).bust, false, "keine Karten ist kein Bust (z. B. sofort Freeze)");
assert.equal(s(e([3, 7, 12])).score, 22);
assert.equal(s(e([3, 7, "+4"])).score, 14);
assert.equal(s(e([3, 7, "x2", "+4"])).score, 24, "x2 nur auf Zahlen, dann +Modifier");
assert.equal(s(e([5, 5, "+10"])).score, 0);
assert.equal(s(e([5, 5])).bust, true);
assert.equal(s(e([5, 5])).dup, 5);
assert.equal(s(e([1, 2], { bust: true })).score, 0);
assert.equal(s(e([0, 1, 2, 3, 4, 5, 6])).score, 21 + 15, "Flip 7 gibt +15");
assert.equal(s(e([0, 1, 2, 3, 4, 5, 6])).flip7, true);
assert.equal(s(e([0, 1, 2, 3, 4, 5, 6, "x2", "+2"])).score, 42 + 2 + 15);
assert.equal(s(e([4], { override: 37 })).score, 37);
assert.equal(s(e([], { override: 0 })).bust, false);

const P = (name, total) => ({ name, total });
assert.deepEqual(winners([P("a", 150), P("b", 199)], 200), []);
assert.deepEqual(winners([P("a", 210), P("b", 230)], 200).map((p) => p.name), ["b"], "höchste Punktzahl gewinnt, nicht der Erste über dem Ziel");
assert.deepEqual(winners([P("a", 230), P("b", 230), P("c", 100)], 200).map((p) => p.name), ["a", "b"]);

console.log("rules: alle Tests ok");
