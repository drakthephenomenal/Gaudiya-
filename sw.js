// ═══════════════════════════════════════════════════════
// Radha Naam Jap — Service Worker  v158
// Push notifications & FCM removed.
//
// v156 fixes (vs v154):
//  • Promoted ./vedic-panchanga/panchanga.html, .css, .js to CORE_ASSETS so
//    install BLOCKS on them. Fixes "Vedic Panchanga module failed to load"
//    on first open / after update where the HTML fragment fetch failed
//    before the lazy cache step had completed.
//  • Bumped cache name to invalidate any stale v154 entry that may have
//    cached a failed/empty panchanga.html response.
// ═══════════════════════════════════════════════════════
const CACHE = 'radha-jap-v164';

// Core assets — install BLOCKS on these. Anything the first paint needs
// must live here, otherwise users see a network round-trip on first open.
const CORE_ASSETS = [
  './',
  './index.html',
  './404.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Promoted in v154 — these are visible on first paint:
  './guru.jpg',
  './radha-coin.png',
  './bhagavadik-bank.png',
  './gurudev/1.png',
  './radha_vallabh/1.png',
  './hitju_maharaj/1.png',
  // Promoted in v155 — Vedic Panchanga module (was failing to load on first
  // open because the fragment fetch raced ahead of the lazy cache step).
  './vedic-panchanga/panchanga.html',
  './vedic-panchanga/panchanga.css',
  './vedic-panchanga/panchanga.js',
];

// Large / optional local assets — cached in background, not blocking install
const LAZY_LOCAL_ASSETS = [
  './style-stotram.css',
  './stotrams.js',
  './panchangData.js',
  './gurudev/2.png',
  './Panchojanno%20Shankya.mp3',
];

const EXTERNAL_ASSETS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi&family=Hind+Siliguri:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:wght@400;600&family=Inter:wght@300;400;500;600&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
];

const BYPASS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
  'firebaseio.com',
  'oauth2.googleapis.com',
  'accounts.google.com',
];

const BYPASS_PREFIXES = [
  'https://api.prokerala.com',
  'https://astronomy-engine',
];

function withinScopePath(pathname) {
  const scopePath = new URL(self.registration.scope).pathname;
  return pathname.startsWith(scopePath) ? pathname.slice(scopePath.length) : null;
}

function toLocalCacheKey(requestOrUrl) {
  const raw = typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url;
  const url = new URL(raw, self.location.origin);
  if (url.origin !== self.location.origin) return null;
  let relativePath = withinScopePath(url.pathname);
  if (relativePath == null) return null;
  if (!relativePath || relativePath === '/') return './index.html';
  if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
  return `./${relativePath}`;
}

function fetchWithTimeout(request, options, ms) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), ms);
  return fetch(request, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(tid));
}

async function cacheLocalAsset(cache, asset) {
  try {
    const response = await fetchWithTimeout(asset, { cache: 'reload' }, 8000);
    if (response && response.ok) await cache.put(asset, response.clone());
  } catch (_) {}
}

async function cacheExternalAsset(cache, url) {
  try {
    const response = await fetchWithTimeout(url, { cache: 'reload', mode: 'no-cors' }, 8000);
    if (response && (response.ok || response.type === 'opaque')) await cache.put(url, response.clone());
  } catch (_) {}
}

async function storeResponse(cacheKey, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(cacheKey, response.clone());
  } catch (_) {}
}

// ── INSTALL: block on CORE (incl. above-the-fold images); lazy + external in background ──
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE_ASSETS.map((asset) => cacheLocalAsset(cache, asset)));
    Promise.allSettled(LAZY_LOCAL_ASSETS.map((asset) => cacheLocalAsset(cache, asset)));
    Promise.allSettled(EXTERNAL_ASSETS.map((asset) => cacheExternalAsset(cache, asset)));
  })());
});

// ── ACTIVATE: delete old caches. Do NOT claim clients (avoids mid-session takeover). ──
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldKeys = keys.filter((key) => key !== CACHE);
    await Promise.all(oldKeys.map((key) => caches.delete(key)));
    // v154: removed self.clients.claim().
    // The new SW now takes over on the next navigation, not mid-session.
    // This eliminates the controllerchange→reload double-load.
    // Still notify open tabs so they CAN show a soft "Update available" pill
    // (app.js v154 no longer auto-reloads on this message).
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE }));
  })());
});

// ── FETCH ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (BYPASS.some((host) => url.href.includes(host))) return;
  if (BYPASS_PREFIXES.some((prefix) => url.href.startsWith(prefix))) return;

  // ── Navigation requests (page load) ──
  // v154: NETWORK-FIRST with 2s timeout. Fixes "old HTML + new app.js" mismatch.
  // - If network responds within 2s, use it and update cache.
  // - If network is slow/offline, serve cached index.html.
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetchWithTimeout(event.request, { cache: 'no-cache' }, 2000);
        if (response && response.ok) {
          storeResponse('./index.html', response.clone()).catch(() => {});
          return response;
        }
        const cached = await caches.match('./index.html');
        return cached || response;
      } catch (_) {
        const cached = await caches.match('./index.html');
        return cached || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  const localCacheKey = toLocalCacheKey(event.request);
  if (localCacheKey) {
    // Local assets: cache-first, stale-while-revalidate
    event.respondWith((async () => {
      const cached = await caches.match(localCacheKey);
      const networkPromise = fetchWithTimeout(event.request, { cache: 'reload' }, 6000)
        .then(async (response) => {
          if (response && response.ok) await storeResponse(localCacheKey, response);
          return response;
        })
        .catch(() => null);
      if (cached) return cached;
      const response = await networkPromise;
      return response || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }

  // External assets (fonts, CDN): cache-first, fallback to network
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetchWithTimeout(event.request, {}, 8000);
      await storeResponse(event.request, response);
      return response;
    } catch (_) {
      return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
