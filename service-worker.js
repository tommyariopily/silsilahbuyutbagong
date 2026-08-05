/* =====================================================================
   Silsilah Keluarga Buyut Bagong — Service Worker
   Meng-cache app shell (HTML/CSS/JS/ikon) agar aplikasi tetap terbuka
   walau koneksi terputus. Data silsilah (API Google Apps Script) selalu
   diambil langsung dari jaringan, tidak di-cache, supaya selalu terbaru.
   ===================================================================== */

const CACHE_NAME = 'silsilah-bagong-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/style.css',
  './assets/app.js',
  './assets/config.js',
  './assets/pwa.js',
  './assets/icons/icon-72.png',
  './assets/icons/icon-96.png',
  './assets/icons/icon-128.png',
  './assets/icons/icon-144.png',
  './assets/icons/icon-152.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-384.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // biarkan POST (simpan/ubah data) langsung ke jaringan

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // jangan intersep API GAS, font, atau foto eksternal

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
