/**
 * Nomos One Service Worker
 * Provides offline support, caching, and background sync for PWA
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `nomos-static-${CACHE_VERSION}`;
const API_CACHE = `nomos-api-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Cache strategies for different types of requests
const STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  NETWORK_ONLY: 'network-only'
};

/**
 * Determine cache strategy based on URL
 */
function getStrategy(url) {
  const urlObj = new URL(url, self.location.origin);
  const path = urlObj.pathname;

  // Static assets: cache first
  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot)$/.test(path)) {
    return STRATEGIES.CACHE_FIRST;
  }

  // API calls: network first with cache fallback
  if (path.startsWith('/api/')) {
    return STRATEGIES.NETWORK_FIRST;
  }

  // Pages: network first
  return STRATEGIES.NETWORK_FIRST;
}

/**
 * Install event: cache initial assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Service Worker installed successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Installation failed:', err);
      })
  );
});

/**
 * Activate event: clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name !== STATIC_CACHE && name !== API_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event: intercept requests and apply caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;
  const method = request.method;

  // Skip non-GET requests
  if (method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (new URL(url, self.location.origin).origin !== self.location.origin) {
    return;
  }

  const strategy = getStrategy(url);

  if (strategy === STRATEGIES.CACHE_FIRST) {
    event.respondWith(cacheFirst(request));
  } else if (strategy === STRATEGIES.NETWORK_FIRST) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(networkOnly(request));
  }
});

/**
 * Cache-first strategy
 * Serve from cache, fall back to network
 */
async function cacheFirst(request) {
  try {
    // Check cache first
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Cache hit:', request.url);
      return cached;
    }

    // Not in cache, fetch from network
    const response = await fetch(request);
    if (!response || response.status !== 200 || response.type === 'error') {
      return response;
    }

    // Cache successful response
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());

    return response;
  } catch (error) {
    console.error('[SW] Cache-first strategy failed:', error);
    return caches.match(request)
      .then(cached => cached || new Response('Offline', { status: 503 }));
  }
}

/**
 * Network-first strategy
 * Try network first, fall back to cache
 */
async function networkFirst(request) {
  try {
    // Try network first
    const response = await fetch(request);

    if (!response || response.status !== 200) {
      // Network failed, try cache
      const cached = await caches.match(request);
      if (cached) {
        console.log('[SW] Using cached response:', request.url);
        return cached;
      }
      return response;
    }

    // Cache successful response
    const cache = await caches.open(API_CACHE);
    cache.put(request, response.clone());

    console.log('[SW] Network hit, cached:', request.url);
    return response;
  } catch (error) {
    console.error('[SW] Network-first strategy failed:', error);

    // Network failed, try cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Using cached fallback:', request.url);
      return cached;
    }

    // No cache available, return offline response
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'You are currently offline. Please check your connection.'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Network-only strategy
 * Always fetch from network
 */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('[SW] Network-only strategy failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Handle push notifications
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let notificationData = {
    title: 'Nomos One',
    body: 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'nomos-notification'
  };

  if (event.data) {
    try {
      notificationData = { ...notificationData, ...event.data.json() };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData,
      actions: [
        {
          action: 'open',
          title: 'Open'
        },
        {
          action: 'close',
          title: 'Close'
        }
      ]
    })
  );
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // If not open, open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

/**
 * Background sync for offline actions
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  } else if (event.tag === 'sync-cases') {
    event.waitUntil(syncCases());
  }
});

/**
 * Sync pending messages
 */
async function syncMessages() {
  try {
    const db = await openIndexedDB();
    const messages = await getStoredMessages(db);

    for (const message of messages) {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      await deleteStoredMessage(db, message.id);
    }

    console.log('[SW] Messages synced successfully');
  } catch (error) {
    console.error('[SW] Message sync failed:', error);
    throw error;
  }
}

/**
 * Sync pending case updates
 */
async function syncCases() {
  try {
    const db = await openIndexedDB();
    const updates = await getStoredUpdates(db);

    for (const update of updates) {
      await fetch(`/api/cases/${update.caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update.data)
      });
      await deleteStoredUpdate(db, update.id);
    }

    console.log('[SW] Cases synced successfully');
  } catch (error) {
    console.error('[SW] Case sync failed:', error);
    throw error;
  }
}

/**
 * IndexedDB helper functions
 */
async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nomos_offline', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('updates')) {
        db.createObjectStore('updates', { keyPath: 'id' });
      }
    };
  });
}

async function getStoredMessages(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function deleteStoredMessage(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function getStoredUpdates(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('updates', 'readonly');
    const store = tx.objectStore('updates');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function deleteStoredUpdate(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('updates', 'readwrite');
    const store = tx.objectStore('updates');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

console.log('[SW] Service Worker loaded');
