// PGT & HO Pay Justice — Service Worker v2
// 2026 best practices: mixed caching strategies per content type
// Network-First for HTML navigation (always get latest campaign info)
// Stale-While-Revalidate for fonts and non-critical assets (fast + auto-refresh)
// Cache-First for static images and docs (never change)

var CACHE_STATIC  = 'pgt-static-v2';
var CACHE_DYNAMIC = 'pgt-dynamic-v2';

var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ── Install: precache the shell ──────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ── Activate: clear stale caches ────────────────────────────────
self.addEventListener('activate', function(event) {
  var VALID = [CACHE_STATIC, CACHE_DYNAMIC];
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return !VALID.includes(k); })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      // Take control of all open tabs immediately
      return self.clients.claim();
    })
  );
});

// ── Fetch: mixed strategies ──────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var req = event.request;
  var url = req.url;

  // Skip non-GET and cross-origin requests
  if (req.method !== 'GET') return;
  if (!url.startsWith(self.location.origin) &&
      !url.includes('fonts.googleapis.com') &&
      !url.includes('fonts.gstatic.com')) return;

  // ── STRATEGY 1: Network-First for HTML navigation ──
  // Always try to get the freshest campaign data; fall back to cache offline
  if (req.mode === 'navigate' || url.endsWith('.html')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // ── STRATEGY 2: Cache-First for images and documents ──
  // Images and PDFs never change — serve from cache instantly
  if (/\.(png|jpg|jpeg|gif|webp|svg|pdf|ico)$/i.test(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // ── STRATEGY 3: Stale-While-Revalidate for fonts and CSS/JS ──
  // Serve cached version immediately, refresh in background
  if (url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      /\.(css|js|woff|woff2)$/i.test(url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // ── Default: Network with cache fallback ──
  event.respondWith(networkFirst(req));
});

// ── Strategy implementations ────────────────────────────────────

function networkFirst(req) {
  return fetch(req)
    .then(function(response) {
      if (response && response.ok) {
        var clone = response.clone();
        caches.open(CACHE_DYNAMIC).then(function(cache) {
          cache.put(req, clone);
        });
      }
      return response;
    })
    .catch(function() {
      return caches.match(req).then(function(cached) {
        return cached || offlineFallback(req);
      });
    });
}

function cacheFirst(req) {
  return caches.match(req).then(function(cached) {
    if (cached) return cached;
    return fetch(req).then(function(response) {
      if (response && response.ok) {
        var clone = response.clone();
        caches.open(CACHE_STATIC).then(function(cache) {
          cache.put(req, clone);
        });
      }
      return response;
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE_DYNAMIC).then(function(cache) {
    return cache.match(req).then(function(cached) {
      var fetchPromise = fetch(req).then(function(response) {
        if (response && response.ok) {
          cache.put(req, response.clone());
        }
        return response;
      });
      // Return cached immediately, update in background
      return cached || fetchPromise;
    });
  });
}

function offlineFallback(req) {
  // For navigation requests, return the cached homepage
  if (req.mode === 'navigate') {
    return caches.match('/index.html');
  }
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

// ── Update notification: tell the page when a new SW is ready ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
