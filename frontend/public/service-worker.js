const CACHE_NAME = 'nomos-v3';

self.addEventListener('install', (event) => {
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
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;
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
  let data = { title: 'Nomos One', body: 'Νέα ειδοποίηση', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', path: '/' };
  if (event.data) {
    try { Object.assign(data, event.data.json()); } catch (e) {}
  }
  const notifyClients = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => list.forEach(c => c.postMessage({ type: 'PUSH_NOTIFICATION', title: data.title, body: data.body, path: data.path })));
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: 'nomos-notification',
        data: { path: data.path },
        requireInteraction: true,
      }),
      notifyClients,
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.focus();
          c.navigate(path);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
