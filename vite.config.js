import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Absolute base: a published note is served at a nested path (/notes/<name>),
// where a relative base would resolve the bundle against /notes/ and 404 every
// asset. The cost is that dist/index.html can no longer be opened straight off
// the filesystem — `npm run preview` serves it instead.
//
// The dev server proxies /api, because the published notes now come through the
// backend rather than straight out of a public bucket: the app asks its own
// origin, and on 5173 there is nothing behind /api unless something is put
// there. The target is the compose stack's caddy — `cd docker/app && docker
// compose up` — so one address covers the backend and anything else that lands
// under /api later. VITE_API_PROXY overrides it for a backend run some other
// way, e.g. flask straight on 8000.
//
// Without the stack up, /notes shows an empty shelf. Everything else in the app
// is static and needs nothing.
const API_TARGET = process.env.VITE_API_PROXY || 'http://localhost:8080'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
