/* Tobis Kochbuch — Service Worker */
const VERSION = 'kochbuch-v1';
const ASSET_CACHE = `${VERSION}-assets`;
const PAGE_CACHE = `${VERSION}-pages`;

const PRECACHE = [
  '/Kochen/',
  '/Kochen/assets/styles.css',
  '/Kochen/assets/utils.js',
  '/Kochen/assets/favicon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(ASSET_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Assets (css/js/images): cache-first, then network
  if (/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(ASSET_CACHE).then(c => c.put(req, clone));
        return res;
      }))
    );
    return;
  }

  // Pages: network-first, fall back to cache when offline
  e.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(PAGE_CACHE).then(c => c.put(req, clone));
      return res;
    }).catch(() =>
      caches.match(req).then(hit => hit || caches.match('/Kochen/'))
    )
  );
});
