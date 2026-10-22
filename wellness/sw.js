// Lives inside the anatomy site, which shares this origin's caches, so only touch caches named for this app.
const CACHE_NAME = 'tolnri-wellness-v5';
const PAGES = [
  './',
  './index.html',
  './upper.html',
  './lower.html',
  './head.html',
  './eyes.html',
  './mudras.html',
  './breathwork.html',
  './random.html',
  './other.html',
  './manifest.json',
  './assets/logo/icon-192.png',
  './assets/logo/icon-512.png'
];

// Install Event - cache the pages so the app opens offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PAGES))
  );
  self.skipWaiting();
});

// Activate Event - drop old caches so phones pick up new versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tolnri-wellness') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  // Let the browser stream audio directly (range requests break through the cache on iPhone)
  if (req.destination === 'audio') return;

  // Pages: network first so updates show up, fall back to cache when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Images, styles and scripts: serve the saved copy right away, refresh it in the background
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
