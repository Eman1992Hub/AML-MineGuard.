// ============================================
// MINEGUARD SERVICE WORKER v9
// Fixes: added admin.html, aml-logo, icons,
//        activate/cache-cleanup, skipWaiting,
//        offline navigation fallback
// ============================================

const CACHE_NAME = 'mineguard-v9';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './admin.html',
  './style.css',
  './app.js',
  './data.js',
  './lang.js',
  './firebase.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/aml-logo.jpg',
];

// ---- INSTALL ----
self.addEventListener('install', event => {
  console.log('[MineGuard SW v9] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Add files one by one — one failure won't block the rest
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW v9] Could not cache:', url, err.message)
          )
        )
      );
    }).then(() => {
      console.log('[MineGuard SW v9] Assets cached');
    })
  );
  // Take control immediately without waiting for old SW to unload
  self.skipWaiting();
});

// ---- ACTIVATE ----
self.addEventListener('activate', event => {
  console.log('[MineGuard SW v9] Activating, cleaning old caches...');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[MineGuard SW v9] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    )
  );
  // Immediately claim all open clients
  self.clients.claim();
});

// ---- FETCH ----
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  // Skip non-http requests (chrome-extension etc.)
  if (!event.request.url.startsWith('http')) return;
  // Skip Firestore API calls — always go to network
  if (event.request.url.includes('firestore.googleapis.com')) return;
  // Skip Google Fonts — they have their own cache headers
  if (event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('fonts.gstatic.com')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Serve from cache if available
      if (cachedResponse) return cachedResponse;

      // Otherwise try network
      return fetch(event.request).then(networkResponse => {
        // Cache valid same-origin responses for future offline use
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type !== 'opaque'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failed — serve offline fallback for page navigations
        if (event.request.mode === 'navigate') {
          // admin.html requested offline — serve from cache
          if (event.request.url.includes('admin.html')) {
            return caches.match('./admin.html').then(r => r || caches.match('./index.html'));
          }
          return caches.match('./index.html');
        }
        // For images that fail offline, return a transparent 1×1 pixel
        if (event.request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
