// Offline support: app files are network-first so updates show up,
// models and libraries are cache-first because they are large and rarely change.
const VERSION = 'v14';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ['./', 'index.html', 'style.css', 'app.js', 'occult.js', 'cosmos.js', 'trace.js', 'conditions.js', 'account.js', 'firebase-config.js', 'hub/nav.js', 'hub/nav.css', 'manifest.webmanifest', 'data/catalog.json', 'data/occult.json', 'data/paths.json', 'data/conditions.json',
  'icons/brand/tree-of-life.webp', 'icons/brand/seal.png', 'vendor/fonts/noto-sans-symbols-symbols-500-normal.woff2',
  'vendor/fonts/cormorant-garamond-latin-600-normal.woff2', 'vendor/fonts/cormorant-garamond-latin-700-normal.woff2', 'vendor/fonts/cormorant-garamond-latin-500-italic.woff2',
  'vendor/three.module.js', 'vendor/three.core.js', 'vendor/addons/controls/OrbitControls.js',
  'vendor/addons/loaders/GLTFLoader.js', 'vendor/addons/utils/BufferGeometryUtils.js',
  'vendor/addons/utils/SkeletonUtils.js', 'vendor/addons/libs/meshopt_decoder.module.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => /^(shell|assets)-/.test(k) && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/wellness/')) return; // the wellness app has its own service worker
  if (/\/(models|vendor|icons)\//.test(url.pathname)) {
    e.respondWith(caches.open(ASSETS).then(async (c) => {
      const hit = await c.match(e.request) || await caches.match(e.request); // the shell cache precaches a few of these
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
  } else {
    // no-cache: always ask GitHub for the latest copy instead of a browser-cached one.
    e.respondWith(fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
