import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so `dist/` can be opened from any static host or a file path.
export default defineConfig({
  base: './',
  plugins: [react()],
})
