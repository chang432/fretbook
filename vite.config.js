import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import notes from './vite-plugin-notes.js'

// Absolute base: a published note is served at a nested path (/notes/<name>),
// where a relative base would resolve the bundle against /notes/ and 404 every
// asset. The cost is that dist/index.html can no longer be opened straight off
// the filesystem — `npm run preview` serves it instead.
export default defineConfig({
  base: '/',
  plugins: [react(), notes()],
})
