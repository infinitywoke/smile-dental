import { defineConfig, devices } from '@playwright/test'

// Speed measurements (perf/perf.spec.ts): against a production server already started, at PERF_URL
// (default http://localhost:3100), on a phone slowed down like Dr. Rahil's Poco M2 Pro
export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { baseURL: process.env.PERF_URL ?? 'http://localhost:3100', actionTimeout: 30_000 },
  projects: [{ name: 'poco', use: { ...devices['Pixel 7'], viewport: { width: 393, height: 851 } } }],
})
