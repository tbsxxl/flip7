/* Flip 7 – Score Tracker · Service Worker
   Relativer Scope (funktioniert in jedem Unterverzeichnis).
   Strategie: App-Shell "cache-first", Navigationen "network-first" mit Offline-Fallback. */

const VERSION = "flip7-v1";
const CACHE = `${VERSION}-shell`;

/* Relative Pfade, damit die App auch unter /irgendwas/flip7/ läuft. */
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/favicon-48.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // einzeln hinzufügen, damit ein fehlendes optionales Asset die Installation nicht killt
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigationen: erst Netzwerk (frische Version), sonst gecachte Shell (offline). */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  /* Statische Assets: erst Cache, dann Netzwerk (und nachcachen). */
  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone));
        return res;
      }).catch(() => hit)
    )
  );
});
