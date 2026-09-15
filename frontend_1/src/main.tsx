import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";

// The Axis JupyterHub proxy (curiosity-hub-...axisapps.io) injects its own
// service worker (axis-sw) into every page it proxies, ahead of anything in
// this repo — not something any file here controls or can disable. That
// worker's own cache can keep serving a stale copy of this app's bundle
// (e.g. an old Vite HMR client from before a config fix) independent of
// what the dev server currently returns, since service workers only see
// real browser fetches, never plain curl/server-restart signals. This can't
// remove axis-sw itself, but it does make sure OUR bundle is never served
// stale on top of it: clear every Cache Storage entry once per load, purely
// defensive, a no-op when nothing's cached (e.g. outside the Axis proxy).
if ("caches" in window) {
  caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
