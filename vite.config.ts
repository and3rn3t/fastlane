/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
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
