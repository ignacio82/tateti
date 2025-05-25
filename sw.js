/* Ta-Te-Ti Deluxe service worker – 2025-05-24 */
const CACHE_NAME = 'tateti-v1';
const APP_ASSETS = [
  './',               // index.html
  './index.html',
  './manifest.json',
  './sw.js',
  // fonts  (Google fonts are cached transparently by Chrome; list them if you prefer)
  // icons
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

// 1️⃣ Install – add core files to cache
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

// 2️⃣ Activate – clean up old caches
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 3️⃣ Fetch – respond from cache first, fall back to network
self.addEventListener('fetch', evt => {
  if (evt.request.method !== 'GET') return;           // ignore POST etc.
  evt.respondWith(
    caches.match(evt.request).then(
      cached => cached || fetch(evt.request).then(res => {
        // Optionally: add new resources to cache
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(evt.request, clone));
        }
        return res;
      })
    )
  );
});
