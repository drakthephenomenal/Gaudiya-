// ═══════════════════════════════════════════════════════
// Radha Naam Jap — Service Worker
// v64: Removed Google Drive backup system
// ═══════════════════════════════════════════════════════
const CACHE = 'radha-jap-v75';

const PRECACHE = [
  './index.html',
  './style.css',
  './stotrams.js',
  './app.js',
  './panchangData.js',
  './guru.jpg',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi&family=Hind+Siliguri:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:wght@400;600&family=Inter:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js'
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

// ── Install ──
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(() => {})))
    )
  );
});

// ── Activate ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE })))
  );
});

// ── Fetch ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (BYPASS.some(h => url.href.includes(h))) return;

  if (url.pathname.endsWith('index.html') || url.pathname.endsWith('/') || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(resp => {
          if (resp && resp.status === 200) caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.pathname.endsWith('app.js') || url.pathname.endsWith('style.css') || url.pathname.endsWith('stotrams.js')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(resp => {
          if (resp && resp.status === 200) caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type !== 'error')
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
        return resp;
      }).catch(() => null);
      return cached || net.then(r => r || new Response('Offline', { status: 503 }));
    })
  );
});

// ── Messages from the page ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    e.waitUntil(
      self.registration.showNotification(e.data.title, {
        body: e.data.body,
        tag: e.data.tag,
        renotify: true,
        vibrate: [200, 100, 200],
        icon: './icon-192.png'
      })
    );
  }

  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Notification tap ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) { if ('focus' in client) return client.focus(); }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
