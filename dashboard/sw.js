// The Dashboard's own offline cache, kept small on purpose: only what this page needs (not the 3D site's engine and
// models), so a screen left on downloads as little as possible. Its own files are network-first, so updates show
// up; fonts, icons and the Firebase code are cache-first, since they rarely change.
const CACHE = 'tolnri-dash-v1';
const FILES = ['./', 'index.html', 'dash.css', 'dash.js', 'manifest.webmanifest',
  '../hub/nav.js', '../hub/nav.css', '../hub/page.css', '../hub/page.js', '../hub/rings.js', '../tasks/logic.js',
  '../account.js', '../firebase-config.js', '../vendor/firebase.js', '../icons/brand/tree-of-life.webp', '../icons/icon-192.png',
  '../wellness/assets/backgrounds/stars-simple.webp', '../vendor/fonts/cormorant-garamond-latin-600-normal.woff2', '../vendor/fonts/cormorant-garamond-latin-700-normal.woff2'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((ks) => Promise.all(ks.filter((k) => k.startsWith('tolnri-dash') && k !== CACHE).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(vendor|icons|wellness\/assets)\//.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
