const CACHE_NAME = 'vysion-productivity-v6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './habits.css',
  './app.js',
  './js/boards.js',
  './js/colors.js',
  './js/dates.js',
  './js/detail.js',
  './js/habits.js',
  './js/model.js',
  './js/store.js',
  './js/taskmenu.js',
  './js/ui.js',
  './js/views.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo-header.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Network-first for our own files: a new deploy is picked up as soon as the
// device is online, instead of being masked by a stale cache indefinitely.
// The cache is only used as an offline fallback.
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
