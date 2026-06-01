// ═══════════════════════════════════════════════════════
// Radha Naam Jap — Service Worker
// v113: stotrams.js → stotram.js in LOCAL_ASSETS
// v112: fix Ekadashi viddha Condition 2 (compare ekEnd vs startDate sunrise not endDate);
//       fix _resyncEkOccasions same bug; fix parana day advance when Dvadashi spans full day;
//       fix hard deadline search anchored to paranaDay not ekEnd
// v111: fix NaN Gaurabda — gaurabdaYear fallback; panchangData versioned; v108: celestial sunrise = solar noon − 6h (ISKCON match); BM end fixed 46→48 min; paran uses apparent daytime length
// ═══════════════════════════════════════════════════════
const CACHE = 'radha-jap-v114';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './404.html',
  './style.css',
  './style-stotram.css',
  './stotrams.js',
  './app.js',
  './panchangData.js',
  './se-bridge.js',
  './guru.jpg',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
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
    if (response && response.ok) {
      await cache.put(asset, response.clone());
    }
  } catch (_) {}
}

async function cacheExternalAsset(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload', mode: 'no-cors' });
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(url, response.clone());
    }
  } catch (_) {}
}

async function storeResponse(cacheKey, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return;
  const cache = await caches.open(CACHE);
  await cache.put(cacheKey, response.clone());
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(LOCAL_ASSETS.map((asset) => cacheLocalAsset(cache, asset)));
    await Promise.allSettled(EXTERNAL_ASSETS.map((asset) => cacheExternalAsset(cache, asset)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => {
      client.postMessage({ type: 'SW_UPDATED', version: CACHE });
    });
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
        if (response && response.ok) {
          await storeResponse('./index.html', response);
        }
        return response;
      } catch (_) {
        return (await caches.match('./index.html')) || new Response('Offline', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
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
        return cached || new Response('Offline', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
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
      return new Response('Offline', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification(event.data.title, {
        body: event.data.body,
        tag: event.data.tag,
        renotify: true,
        vibrate: [200, 100, 200],
        icon: './icon-192.png',
      })
    );
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
