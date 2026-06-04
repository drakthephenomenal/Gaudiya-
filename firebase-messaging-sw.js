// ═══════════════════════════════════════════════════════
// firebase-messaging-sw.js  (v1)
// FCM background message handler — Radha Naam Jap
// Deploy at REPO ROOT (same level as index.html)
// ═══════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCvvXEdsJjXpTbITE2HuyYFnPZfZIkxVWA",
  authDomain:        "guru-kripahi-kevalam-108.firebaseapp.com",
  projectId:         "guru-kripahi-kevalam-108",
  storageBucket:     "guru-kripahi-kevalam-108.firebasestorage.app",
  messagingSenderId: "368485403238",
  appId:             "1:368485403238:web:a3ab5c1427ad0c40fffba7",
});

const messaging = firebase.messaging();

// Background message handler — fires when app is CLOSED or BACKGROUNDED
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'राधे राधे 🙏';
  const body  = payload.notification?.body  || 'Time for your daily Naam Jap!';
  const tag   = payload.notification?.tag   || payload.data?.tag || 'radha-jap';

  self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
    icon:    './icon-192.png',
    badge:   './icon-192.png',
    vibrate: [200, 100, 200],
    data:    payload.data || {},
  });
});

// Tap notification → focus / open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
