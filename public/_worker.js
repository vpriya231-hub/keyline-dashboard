/**
 * Cloudflare Worker / Pages routing for PWA static assets
 * Ensures /sw.js, /manifest.json, /icon-192.png, and /icon-512.png are served
 * with proper Content-Type headers:
 *   - sw.js -> application/javascript
 *   - manifest.json -> application/manifest+json
 *   - icon-192.png / icon-512.png -> image/png (with immutable cache)
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

    // 3. Exact Keyline PNG Icon routing for PWABuilder
    if (url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png') {
      if (env && env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 200) {
          return new Response(res.body, {
            status: 200,
            headers: {
              ...Object.fromEntries(res.headers),
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
      }

      // Fallback: Fetch original Keyline logo from source
      const fallbackImg = await fetch('https://i.ibb.co/VY5vPST3/IMG-20260918-WA0001.jpg');
      return new Response(fallbackImg.body, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 4. Fallback to Cloudflare static asset pipeline or origin fetch
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  },
};
