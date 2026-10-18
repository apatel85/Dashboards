/* WagWise service worker — cache-first offline PWA (v2.2) */
const CACHE = 'wagwise-v3.27.15';
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
// v3.5 — let the page nudge a waiting worker to activate immediately
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
  // v3.27.12 — network-first for the app shell (index.html, app.js, styles.css).
  // The old cache-first strategy pinned stale versions on devices (Ankit 2026-10-16:
  // stuck on v3.27.10, updates never arrived). App shell is tiny; always try network.
  const isShell = /\/(index\.html|app\.js|styles\.css)?(\?|$)/.test(url.pathname) || url.pathname.endsWith('/WagWise/');
  if (isShell) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

