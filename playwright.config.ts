import { defineConfig, devices } from '@playwright/test'
import { appEnv, NO_TEST_LOGIN, testLogin } from './e2e/env'

const PORT = 3100
const baseURL = `http://localhost:${PORT}`

// Say why once (workers load this file too)
if (!testLogin && !process.env.TEST_WORKER_INDEX) console.log(NO_TEST_LOGIN)

// End-to-end tests on a mobile Chromium viewport, signed in as the test account.
// Without .env.test.local no server starts and the specs skip.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: testLogin
    ? {
        command: `npx next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: appEnv.NEXT_PUBLIC_SUPABASE_URL ?? '',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: appEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
          // Only the test account may sign in to this server
          ALLOWED_EMAIL: testLogin.email,
        },
      }
    : undefined,
})
