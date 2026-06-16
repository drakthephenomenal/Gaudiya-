// ═══════════════════════════════════════════════════════
// Radha Naam Jap — Service Worker
// Push notifications & FCM removed.

// ═══════════════════════════════════════════════════════
const CACHE = 'radha-jap-v144';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './404.html',
  './style.css',
  './style-stotram.css',
  './stotrams.js',
  './app.js',
  './panchangData.js',
  './guru.jpg',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
  './bhagavadik-bank.png',
  './radha-coin.png',
  './gurudev/1.png',
  './gurudev/2.png',
  './radha_vallabh/1.png',
  './hitju_maharaj/1.png',
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

async function cacheLocalAsset(cache, asset) {
  try {
    const response = await fetch(asset, { cache: 'reload' });
    if (response && response.ok) await cache.put(asset, response.clone());
  } catch (_) {}
}

async function cacheExternalAsset(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload', mode: 'no-cors' });
    if (response && (response.ok || response.type === 'opaque')) await cache.put(url, response.clone());
  } catch (_) {}
}

async function storeResponse(cacheKey, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return;
  const cache = await caches.open(CACHE);
  await cache.put(cacheKey, response.clone());
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Only block install on LOCAL assets — external (Firebase/fonts/CDN) cached in background
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(LOCAL_ASSETS.map((asset) => cacheLocalAsset(cache, asset)));
    // External assets fetched in background — do not block install
    Promise.allSettled(EXTERNAL_ASSETS.map((asset) => cacheExternalAsset(cache, asset)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldKeys = keys.filter((key) => key !== CACHE);
    const isUpdate = oldKeys.length > 0; // false on very first install, true on update
    await Promise.all(oldKeys.map((key) => caches.delete(key)));
    await self.clients.claim();
    // Only notify existing clients on UPDATE (not fresh install) to avoid double-load
    if (isUpdate) {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE }));
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (BYPASS.some((host) => url.href.includes(host))) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        if (response && response.ok) await storeResponse('./index.html', response);
        return response;
      } catch (_) {
        return (await caches.match('./index.html')) || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  const localCacheKey = toLocalCacheKey(event.request);
  if (localCacheKey) {
    event.respondWith((async () => {
      const cached = await caches.match(localCacheKey);
      if (cached) return cached;
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        await storeResponse(localCacheKey, response);
        return response;
      } catch (_) {
        return cached || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
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
