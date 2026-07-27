import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const dir = dirname(fileURLToPath(import.meta.url))

// The player-facing viewer: a standalone static web app (no Electron, no
// window.api). Built output is bundled into DM-Forge as a resource and copied
// into each published player site. `base: './'` keeps asset paths relative so
// the site works from a GitHub Pages sub-path.
export default defineConfig({
  root: dir,
  base: './',
  plugins: [react()],
  server: { port: 5177, strictPort: true },
  build: {
    outDir: resolve(dir, '../dist-viewer'),
    emptyOutDir: true,
  },
})
