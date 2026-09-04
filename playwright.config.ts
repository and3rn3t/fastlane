import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /\.mobile\.spec\.ts$/ },
    {
      name: 'mobile-chromium',
      // Pixel 7 for its Chromium engine (no extra browser install), but at
      // 375×667 — the short iPhone viewport where the old location sheet's
      // coverage bugs were actually reported.
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 667 } },
      testMatch: /\.mobile\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
