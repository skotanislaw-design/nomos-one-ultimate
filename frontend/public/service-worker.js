const CACHE_VERSION = 'v1.0.' + Date.now();
const STATIC_CACHE = 'nomos-static-' + CACHE_VERSION;
const API_CACHE = 'nomos-api-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(n => n !== STATIC_CACHE && n !== API_CACHE)
          .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Navigation (HTML pages): always network, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // API calls: network only (no caching of auth/data)
  if (url.pathname.startsWith('/api/')) return;

  // Static assets (JS/CSS/images): cache first
  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
            }
            return response;
          });
        })
    );
    return;
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'Nomos One', body: 'Νέα ειδοποίηση', icon: '/icons/icon-192.png' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch (e) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, icon: data.icon, badge: data.icon, tag: 'nomos'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow('/');
      })
  );
});

console.log('[SW] Nomos One Service Worker loaded');
