import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // Relative paths for FlashCore iframe embedding
  root: '.',
  publicDir: 'assets',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
}) 