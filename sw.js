/* Ta-Te-Ti Deluxe service worker – 2025-05-25 */
const CACHE_NAME = 'tateti-v1.6';

const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

// 1️⃣ Install – cache static assets
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

// 2️⃣ Activate – clean old caches
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// 3️⃣ Fetch – serve from cache, fall back to network, skip non-HTTP(S)
self.addEventListener('fetch', evt => {
  const { request } = evt;
  const url = new URL(request.url);

  // Only handle GET requests for http/https
  if (request.method !== 'GET' || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return;
  }

  evt.respondWith(
    caches.match(request).then(cachedResponse => {
      // Return cached if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise fetch from network and cache it
      return fetch(request).then(networkResponse => {
        if (!networkResponse || !networkResponse.ok) {
          return networkResponse;
        }
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => cache.put(request, clone))
          .catch(() => {/* ignore cache write errors */});
        return networkResponse;
      }).catch(() => {
        // Fetch failed (offline?) – could return a fallback asset here
        return cachedResponse;
      });
    })
  );
});
