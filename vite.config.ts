import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function pwaHeadersPlugin(): Plugin {
  const setPwaHeaders = (req: any, res: any, next: any) => {
    const rawUrl = req.url ? req.url.split('?')[0] : '';
    if (rawUrl === '/sw.js') {
      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = function (name: string, value: any) {
        if (name && name.toLowerCase() === 'content-type') {
          return originalSetHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
        return originalSetHeader(name, value);
      };
      originalSetHeader('Content-Type', 'application/javascript; charset=utf-8');
      originalSetHeader('Service-Worker-Allowed', '/');
    } else if (rawUrl === '/manifest.json') {
      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = function (name: string, value: any) {
        if (name && name.toLowerCase() === 'content-type') {
          return originalSetHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        }
        return originalSetHeader(name, value);
      };
      originalSetHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      originalSetHeader('Access-Control-Allow-Origin', '*');
    } else if (rawUrl === '/icon-192.png' || rawUrl === '/icon-512.png') {
      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = function (name: string, value: any) {
        if (name && name.toLowerCase() === 'content-type') {
          return originalSetHeader('Content-Type', 'image/png');
        }
        return originalSetHeader(name, value);
      };
      originalSetHeader('Content-Type', 'image/png');
      originalSetHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    next();
  };

  return {
    name: 'pwa-headers-plugin',
    configureServer(server) {
      server.middlewares.use(setPwaHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(setPwaHeaders);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), pwaHeadersPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
