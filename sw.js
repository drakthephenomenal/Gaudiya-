// ═══════════════════════════════════════════════════════
// Radha Naam Jap — Service Worker
// Push notifications & FCM removed.

// ═══════════════════════════════════════════════════════
const CACHE = 'radha-jap-v125';

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
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE }));
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


// ═══════════════════════════════════════════════════════
// AUTO LOCAL BACKUP — periodic background sync handler
// Triggered by Periodic Background Sync on Android Chrome
// (installed PWA). Reads the latest-snapshot the app mirrors
// into IndexedDB on every save and writes named backup files
// into the same IDB store, so they survive the app being closed.
// ═══════════════════════════════════════════════════════
const _BK_DB = 'RadhaJapDB';
const _BK_STORE = 'backups';

function _bkOpenDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_BK_DB, 5);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('state'))               db.createObjectStore('state');
      if (!db.objectStoreNames.contains('history'))             db.createObjectStore('history');
      if (!db.objectStoreNames.contains('h28'))                 db.createObjectStore('h28');
      if (!db.objectStoreNames.contains('timerHistory'))        db.createObjectStore('timerHistory');
      if (!db.objectStoreNames.contains('timer28History'))      db.createObjectStore('timer28History');
      if (!db.objectStoreNames.contains('malaLog'))             db.createObjectStore('malaLog');
      if (!db.objectStoreNames.contains('activityLogArchive'))  db.createObjectStore('activityLogArchive');
      if (!db.objectStoreNames.contains(_BK_STORE))             db.createObjectStore(_BK_STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
function _bkGet(db, key) {
  return new Promise((res) => {
    const tx = db.transaction(_BK_STORE, 'readonly');
    const r  = tx.objectStore(_BK_STORE).get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror   = () => res(null);
  });
}
function _bkPut(db, key, value) {
  return new Promise((res) => {
    const tx = db.transaction(_BK_STORE, 'readwrite');
    tx.objectStore(_BK_STORE).put(value, key);
    tx.oncomplete = () => res(true);
    tx.onerror    = () => res(false);
  });
}
function _bkTs() {
  const d = new Date(), pad = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
         '_' + pad(d.getHours()) + '-' + pad(d.getMinutes());
}

async function _runAutoBackup(kind) {
  try {
    const db = await _bkOpenDB();
    const latest = await _bkGet(db, 'latest-snapshot');
    if (!latest || !latest.data) return; // nothing to back up yet
    if (kind === 'hourly') {
      await _bkPut(db, 'auto-hourly', {
        savedAt: Date.now(),
        filename: 'radha-naam-jap-hourly.json',
        data: latest.data
      });
    } else {
      const tag = _bkTs();
      await _bkPut(db, 'auto-midnight-' + tag, {
        savedAt: Date.now(),
        filename: 'radha-naam-jap-' + tag + '.json',
        data: latest.data
      });
    }
  } catch (_) { /* quiet */ }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'auto-backup-hourly') {
    event.waitUntil(_runAutoBackup('hourly'));
  } else if (event.tag === 'auto-backup-midnight') {
    event.waitUntil(_runAutoBackup('midnight'));
  }
});
// Manual trigger (used by the in-app "Run now" button via postMessage)
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'AUTO_BACKUP_RUN') {
    event.waitUntil(_runAutoBackup(d.kind === 'midnight' ? 'midnight' : 'hourly'));
  }
});

