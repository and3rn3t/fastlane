import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { configDefaults } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a new deploy no longer silently swaps the
      // service worker under an already-open tab (registerType: 'autoUpdate'
      // auto-reloads with zero user-facing signal — see UpdateToast.tsx,
      // which now owns telling the player and asking before reloading).
      registerType: 'prompt',
      // Registered manually via the `virtual:pwa-register/react` hook in
      // UpdateToast.tsx instead of the plugin's own auto-injected <script>,
      // so there's exactly one registration path, not two.
      injectRegister: false,
      // public/manifest.webmanifest is hand-maintained (Wave 0's Home Screen
      // meta tags) — don't let the plugin generate/overwrite a second one.
      manifest: false,
      // favicon.svg/apple-touch-icon.png: the only two icons a normal page
      // load actually fetches (index.html <link rel="icon">/"apple-touch-
      // icon">), so they're worth precaching for offline reliability.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // globPatterns sweeps the *entire* dist/ output for matching
        // extensions regardless of includeAssets — confirmed by building and
        // inspecting dist/sw.js's actual precache list, which still had
        // og-image.png even after removing it from includeAssets alone.
        // globIgnores is the real lever. All five excluded here are only
        // ever fetched by something other than the running app itself: the
        // manifest's icon/screenshot entries are pulled by the OS/browser's
        // install UI (not linked from index.html, so a normal page load
        // never requests them), and og-image.png is read by external social
        // link-preview crawlers. Precaching any of them is pure install-time
        // bandwidth waste — 273KB + 12KB + 8KB + 88KB + 120KB of it.
        globIgnores: [
          'og-image.png',
          'icon-512.png',
          'icon-maskable-512.png',
          'screenshot-mobile.png',
          'screenshot-desktop.png',
        ],
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
    // e2e/ holds Playwright specs, run via `pnpm test:e2e`, not vitest — its
    // own test() throws if vitest tries to execute it.
    exclude: [...configDefaults.exclude, 'e2e/**'],
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
