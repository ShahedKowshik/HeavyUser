
const CACHE_NAME = 'heavyuser-v9-offline';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 1. Install: Cache the critical "App Shell" immediately
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force this new SW to become active immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// 2. Activate: Clean up old caches to save space
self.addEventListener('activate', (event) => {
  self.clients.claim(); // Take control of all open app tabs immediately
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 3. Fetch: The Traffic Cop logic
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // A. Navigation Requests (HTML) -> Network First, Fallback to Cache
  // This prevents the "No Internet" screen.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If online, return response and update cache
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // If offline, return the cached index.html (The App Shell)
          return caches.match('/index.html');
        })
    );
    return;
  }

  // B. Database/API Requests -> Network Only
  // Never cache these, or the user might see old data and think it's live.
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/api/')) {
    return;
  }

  // C. Static Assets (JS, CSS, Images, Fonts) -> Stale-While-Revalidate
  // Serve from cache INSTANTLY, but update the cache in the background for next time.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Only cache valid responses
        if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      }).catch(() => {
          // Network failed, nothing to do. We hope cachedResponse exists.
      });

      // Return the cached version if we have it, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
