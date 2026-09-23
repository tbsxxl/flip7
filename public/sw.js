/* Flip 7 – Service Worker
   Offline-fähig: App-Dateien "network-first" (Deploys kommen sofort an, Cloudflare antwortet mit günstigen 304),
   ohne Netz aus dem Cache. Icons "cache-first". VERSION bei Änderungen an SHELL erhöhen. */

const VERSION = "flip7-v2";
const SHELL = [
  "/",
  "/styles.css",
  "/rules.js",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-32.png",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req, cacheKey) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(cacheKey || req, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(cacheKey || req)) || (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "/"));
  } else if (url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});
