/* ===========================================================================
   Knowledge Vault — Service Worker
   Handles:
     1. Static asset caching (app shell) for offline and fast loads
     2. Push notification display and click handling
   =========================================================================== */

// ---------------------------------------------------------------------------
// 1. Cache configuration
// ---------------------------------------------------------------------------

/**
 * Bump this version string whenever a deploy changes the app shell.
 * The activate handler will automatically purge older caches.
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `kb-shell-${CACHE_VERSION}`;

/**
 * Minimal set of URLs that constitute the app shell.
 * Vite-hashed bundles (JS/CSS) are cached dynamically on first fetch.
 * These are resolved relative to the service worker scope.
 */
const SHELL_URLS = [
  './',
  'manifest.json',
  'favicon.svg',
  'brand-mark.svg',
  'icon-512.png',
];

// ---------------------------------------------------------------------------
// 2. Install — pre-cache the shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// 3. Activate — clean up old caches
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('kb-') && name !== SHELL_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// 4. Fetch — serve from cache, update in background
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls, non-GET requests, or cross-origin requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // Resolve root scope path (e.g. "/knowledge-base/")
  const registrationScope = self.registration.scope;
  const scopePath = new URL(registrationScope).pathname;

  // For navigation requests, always try network first (SPA — returns index.html)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh HTML shell under the scope path root
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(scopePath, clone));
          return response;
        })
        .catch(() =>
          // Offline: serve cached shell for any navigation
          caches.match(scopePath).then((cached) => cached || new Response('Offline', { status: 503 })),
        ),
    );
    return;
  }

  // For static assets: stale-while-revalidate
  // Serve cached immediately, fetch update in background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Return cached version immediately if available, otherwise wait for network
      return cached || networkFetch;
    }),
  );
});

// ---------------------------------------------------------------------------
// 5. Push notifications
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : 'Nova notificacao' };
  }

  const title = data.title || 'Knowledge Base';
  const options = {
    body: data.body || 'Novo lembrete recebido.',
    icon: data.icon || '/icon-512.png',
    badge: data.badge || '/icon-512.png',
    data: data.data || {},
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ---------------------------------------------------------------------------
// 6. Notification click — open or focus the relevant page
// ---------------------------------------------------------------------------

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
