// Keyline AI Gateway - Service Worker
// Production-ready PWA Service Worker for PWABuilder & Microsoft Store compliance

const CACHE_NAME = 'keyline-pwa-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Domains and URL patterns that MUST bypass the service worker completely
const BYPASS_DOMAINS = [
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'apis.google.com',
  'accounts.google.com',
  'keyline.v0408688.workers.dev'
];

const BYPASS_URL_SUBSTRINGS = [
  '/v1/chat/completions',
  '/v1/models',
  '/v1/',
  '/api/',
  '/google.firestore.v1.Firestore/',
  'channel?VER=',
  'channel?',
  '/oauth/',
  '__vite_ping'
];

// 1. Install: Precache shell assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate: Clear old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: Determine if request should bypass the cache
function shouldBypass(request) {
  // Only intercept GET requests
  if (request.method !== 'GET') {
    return true;
  }

  // Bypass non-http(s) schemas (chrome-extension, blob, etc.)
  if (!request.url.startsWith('http')) {
    return true;
  }

  try {
    const url = new URL(request.url);

    // Bypass Firebase, Google Auth, and Cloudflare Worker domains
    if (BYPASS_DOMAINS.some((domain) => url.hostname.includes(domain))) {
      return true;
    }

    // Bypass real-time streaming, Firestore websockets, and API routes
    if (BYPASS_URL_SUBSTRINGS.some((sub) => url.pathname.includes(sub) || url.search.includes(sub))) {
      return true;
    }
  } catch (e) {
    return true;
  }

  return false;
}

// 3. Fetch: Network-first with cache fallback for navigation & shell assets
self.addEventListener('fetch', (event) => {
  if (shouldBypass(event.request)) {
    return; // Pass through directly to the network
  }

  // Handle navigation requests (SPA HTML entry)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback to cached root
          const fallback = await caches.match('/');
          if (fallback) {
            return fallback;
          }
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Handle static assets (styles, scripts, fonts, icons)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) {
          return cached;
        }
        // Return synthetic offline response if resource not cached
        return new Response('Offline resource unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      })
  );
});
