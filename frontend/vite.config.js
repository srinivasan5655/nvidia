import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This app is served behind JupyterHub's jupyter-server-proxy at a path prefix like
// /user/<name>/proxy/5173/. The proxy layer forwards the *browser's* top-level page
// request with the prefix intact, but strips the prefix off many sub-resource
// requests (assets, JS module imports, API calls) before they reach this dev server.
// Vite's own base-mismatch middleware then sees those stripped requests as not
// matching `base` and issues its own redirect, which combined with the proxy's
// prefix produces a doubling redirect loop.
//
// Fix: re-add the expected prefix onto any incoming request that's missing it,
// *before* Vite's own routing/base/proxy middlewares run, so Vite always sees a
// consistently-prefixed URL and never needs to redirect.
const PROXY_BASE = process.env.PROXY_BASE || '/';
const trimmedBase = PROXY_BASE.replace(/\/$/, '');

function reAddProxyPrefix() {
  return {
    name: 're-add-proxy-prefix',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (trimmedBase && req.url && !req.url.startsWith(trimmedBase)) {
          req.url = trimmedBase + (req.url.startsWith('/') ? req.url : '/' + req.url);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: PROXY_BASE,
  plugins: [reAddProxyPrefix(), react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.axisapps.io'],
    proxy: {
      [`${trimmedBase}/api`]: {
        target: 'http://localhost:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(trimmedBase, ''),
      },
      [`${trimmedBase}/health`]: {
        target: 'http://localhost:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(trimmedBase, ''),
      },
    },
    hmr: { path: '__hmr' },
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: ['.axisapps.io'],
    proxy: {
      [`${trimmedBase}/api`]: {
        target: 'http://localhost:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(trimmedBase, ''),
      },
      [`${trimmedBase}/health`]: {
        target: 'http://localhost:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(trimmedBase, ''),
      },
    },
  },
});
