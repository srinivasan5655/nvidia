import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // maplibre-gl ships its worker as a separate chunk that Vite's dependency
  // pre-bundling doesn't resolve correctly (404 on maplibre-gl-worker.mjs
  // under node_modules/.vite/deps/) — excluding it from optimizeDeps makes
  // Vite serve it straight from node_modules instead.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8010',
      '/health': 'http://localhost:8010',
      '/static': 'http://localhost:8010',
    },
  },
})
