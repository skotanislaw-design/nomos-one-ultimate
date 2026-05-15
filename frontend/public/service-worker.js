const CACHE_NAME = 'nomos-v2';

self.addEventListener('install', (event) => {
  // Don't skip waiting — let the current page finish loading before activating
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'])
        .catch(() => {})
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Navigation (HTML): always from network
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // API: network only, never cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  // Static assets: cache first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type !== 'error') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return response;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Nomos One', body: 'Νέα ειδοποίηση', icon: '/icons/icon-192.png' };
  if (event.data) { try { data = { ...data, ...event.data.json() }; } catch (e) {} }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: data.icon, tag: 'nomos' })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
