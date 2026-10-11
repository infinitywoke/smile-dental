import { defineConfig, devices } from '@playwright/test'

// Evidence tour (docs/BUILD_LOG.md): runs against a production server already started on port 3100
export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', actionTimeout: 15_000 },
  projects: [{ name: 'oneplus-13', use: { ...devices['Pixel 7'] } }],
})
