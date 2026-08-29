/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // public/manifest.webmanifest is hand-maintained (Wave 0's Home Screen
      // meta tags) — don't let the plugin generate/overwrite a second one.
      manifest: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'og-image.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        statements: 75,
        branches: 80,
        functions: 75,
        lines: 75,
      },
    },
  },
})
