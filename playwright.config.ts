import { defineConfig, devices } from '@playwright/test'
import { appEnv, NO_TEST_LOGIN, testLogin } from './e2e/env'

// Each builder may run its own copy on its own port (E2E_PORT=3101, 3102, ...)
const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = `http://localhost:${PORT}`

// Say why once (workers load this file too)
if (!testLogin && !process.env.TEST_WORKER_INDEX) console.log(NO_TEST_LOGIN)

// End-to-end tests on an Android phone screen, signed in as the test account.
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
    // A blocked click fails fast with a clear message instead of using up the test timeout
    actionTimeout: 15_000,
  },
  // The owner's phone: a OnePlus 13 (Android 15, Chrome), 412 x 905 CSS pixels
  projects: [{
    name: 'oneplus-13',
    use: {
      ...devices['Pixel 7'],
      viewport: { width: 412, height: 905 },
      userAgent: 'Mozilla/5.0 (Linux; Android 15; CPH2649) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    },
  }],
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
          E2E: '1',
        },
      }
    : undefined,
})
