// Shared config/constants (kept separate so app.js is smaller)

window.Flip7Config = {
  HAPT: {
    finish: 18,
    bust: 28,
    win: 40,
    sheetOpen: 12,
    sheetSnap: 10,
    delete: 18,
    fx: 12
  },

  // Number colors
  numStyle: {
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
  },

  palette: [
    "#2563eb","#16a34a","#ea580c","#9333ea",
    "#0ea5e9","#dc2626","#14b8a6","#eab308",
    "#111827","#f97316","#22c55e","#3b82f6"
  ],

  numbers: [...Array(13).keys()]
};
