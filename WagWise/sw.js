/* WagWise service worker — cache-first offline PWA (v2.2) */
const CACHE = 'wagwise-v2.5';
const ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
];
// NOTE: config.js is intentionally NOT cached — it holds the anon key and is
// baked at build time, so it must always be fetched fresh (a cached copy
// would pin a stale/placeholder key forever).
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never cache API traffic or the build-time config — always network.
  if (/supabase\.co|googleapis\.com/.test(url.hostname)) return;
  if (url.pathname.endsWith('config.js')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
