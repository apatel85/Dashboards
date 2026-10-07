/**
 * service-worker.js — PWA offline cache for P&L Dashboard
 *
 * Strategy: network-first for the app shell, falling back to the cached
 * copy only when the network is actually unavailable. Bumps CACHE_VERSION
 * to invalidate old caches on updates.
 *
 * Notes:
 *  - Cross-origin requests (Google Sheets API, Supabase, Google OAuth)
 *    are NOT cached — passed through to network. This is essential so
 *    Sheets sync works in real time and credentials don't get cached.
 *  - When offline and network fails for the main HTML, the cached copy
 *    is served. All app logic + libraries are inlined in the HTML so
 *    one cached file is enough to run.
 *  - This was previously stale-while-revalidate (always serve the cached
 *    copy instantly, update the cache in the background for next time).
 *    That meant a real app-behavior fix — not just a cosmetic one — could
 *    sit invisible on a device for one or more app loads after being
 *    deployed to GitHub Pages, and devices that never happened to complete
 *    a background revalidation (closed before it finished, e.g. on mobile)
 *    could stay stuck on an old build indefinitely. That surfaced as
 *    different devices silently running different *code*, not just having
 *    different *data* — on top of (and easy to mistake for) any actual data
 *    sync bug. An online user should always get the latest deployed code.
 */

const CACHE_VERSION = 'pl-dashboard-v8.12.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './pl-dashboard-v8.html',
  './admin.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './version.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Use addAll with no-cors fallback so a missing icon doesn't break install
      return Promise.all(
        CORE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[sw] skip cache for', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests; everything else passes through.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Network-first for the app shell: always try the live deployed copy,
  // caching it for offline use as it comes back. Only fall back to
  // whatever's cached if the network request itself fails (offline).
  // The cache write is awaited *inside* the promise passed to
  // respondWith() rather than fired-and-forgotten in the background —
  // respondWith()'s own promise already extends the service worker's
  // lifetime until it settles, so awaiting here is what actually
  // guarantees the write completes. A separate event.waitUntil() call
  // from inside a .then() callback was tried first and proved unreliable
  // in testing (a Playwright test went offline right after an online
  // fetch and got an empty/stale cache — the write hadn't finished).
  event.respondWith((async () => {
    try {
      const resp = await fetch(event.request);
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(event.request, resp.clone());
      }
      return resp;
    } catch (err) {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw err;
    }
  })());
});

// Listen for skipWaiting message from the page (lets users trigger an update).
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});