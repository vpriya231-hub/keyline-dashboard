/**
 * Cloudflare Worker / Pages routing for PWA static assets
 * Ensures /sw.js and /manifest.json are served with proper Content-Type headers:
 *   - sw.js -> application/javascript
 *   - manifest.json -> application/manifest+json
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Service Worker routing
    if (url.pathname === '/sw.js') {
      if (env && env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 200) {
          return new Response(res.body, {
            status: 200,
            headers: {
              ...Object.fromEntries(res.headers),
              'Content-Type': 'application/javascript; charset=utf-8',
              'Service-Worker-Allowed': '/',
              'Cache-Control': 'no-cache',
            },
          });
        }
      }

      // Direct fallback response if env.ASSETS is unavailable
      const swCode = `const CACHE_NAME = 'keyline-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) {
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});`;

      return new Response(swCode, {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Service-Worker-Allowed': '/',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // 2. Manifest routing
    if (url.pathname === '/manifest.json') {
      if (env && env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 200) {
          return new Response(res.body, {
            status: 200,
            headers: {
              ...Object.fromEntries(res.headers),
              'Content-Type': 'application/manifest+json; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
    }

    // 3. Fallback to Cloudflare static asset pipeline or origin fetch
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  },
};
