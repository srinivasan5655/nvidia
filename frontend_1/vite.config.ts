import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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

// Backend port differs by environment: local dev runs the backend on :8000
// (per the root README), but on Curiosity v2 that port is the self-hosted
// NIM container, not the backend — the backend runs on :8010 there instead.
// Verified live: a manual `PROXY_BASE=... npm run dev` (without also setting
// BACKEND_PORT) silently proxied every /api call to the NIM container
// instead of the backend, which happens to run behind its own nginx-style
// gateway and returns a generic JSON 404 that looks nothing like Vite's or
// FastAPI's — very confusing to debug from the response alone. PROXY_BASE
// is only ever set when running on this cluster (never in local dev), so
// its presence is used to pick the right default even if BACKEND_PORT is
// forgotten — explicit BACKEND_PORT still always wins if set.
const backendPort = process.env.BACKEND_PORT || (process.env.PROXY_BASE ? '8010' : '8000');
const backendTarget = `http://localhost:${backendPort}`;

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

// Shared by server + preview so the two can't silently drift apart.
const backendProxy = Object.fromEntries(
  ['/api', '/health', '/static'].map((route) => [
    `${trimmedBase}${route}`,
    {
      target: backendTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(trimmedBase, ''),
    },
  ]),
);

export default defineConfig({
  base: PROXY_BASE,
  plugins: [reAddProxyPrefix(), react(), tailwindcss()],
  // maplibre-gl ships its worker as a separate chunk that Vite's dependency
  // pre-bundling doesn't resolve correctly (404 on maplibre-gl-worker.mjs
  // under node_modules/.vite/deps/) — excluding it from optimizeDeps makes
  // Vite serve it straight from node_modules instead.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.axisapps.io'],
    proxy: backendProxy,
    // Disabling watch (below) only stops the SERVER from detecting file
    // changes -- it does nothing about the CLIENT-side HMR WebSocket that
    // @vite/client still opens on every page load (hmr: {path: '__hmr'}
    // alone doesn't turn that off). Verified live: watch: null on its own
    // did NOT stop the full-page-reload loop, meaning the reload was never
    // server-triggered in the first place -- it's Vite's client-side
    // reconnect logic firing after that WebSocket fails to establish
    // through JupyterHub's proxy for this custom path (a flaky/repeatedly
    // dropped connection can trigger a reload on reconnect even with no
    // real file change behind it). `hmr: false` removes the WebSocket
    // client entirely, which is the only way to rule this out for good.
    hmr: false,
    // This repo is checked out on Curiosity v2's NFS-mounted shared storage
    // (/storage/hackathon_teams/...) -- the cluster's own docs say so
    // explicitly. Vite's file watcher (chokidar) is well known to misbehave
    // on NFS: inotify doesn't work reliably there, so it falls back to
    // mtime polling, and NFS attribute-cache timing makes that polling
    // spuriously detect "changes" on a steady cadence -- matches the
    // observed every-~5s full-page-reload exactly (Vite issues a full
    // reload whenever it thinks a watched file outside any HMR boundary
    // changed). Disabling the watcher entirely removes the false signal;
    // the tradeoff is no more live-reload-on-save, which doesn't matter
    // once you're just running the app rather than actively editing it.
    watch: null,
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: ['.axisapps.io'],
    proxy: backendProxy,
  },
});
