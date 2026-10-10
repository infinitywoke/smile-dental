import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

// Reads a .env file without touching process.env (dotenv isn't installed)
function readEnvFile(path: string): Record<string, string | undefined> {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}
}

// Supabase project keys, shared with `npm run dev`
export const appEnv = readEnvFile('.env.local')

// Dedicated test login (never Dr. Rahil's account). Git-ignored; create it locally:
//   TEST_EMAIL="..."
//   TEST_PASSWORD="..."
const testEnv = readEnvFile('.env.test.local')

export const testLogin =
  testEnv.TEST_EMAIL && testEnv.TEST_PASSWORD ? { email: testEnv.TEST_EMAIL, password: testEnv.TEST_PASSWORD } : null

export const NO_TEST_LOGIN = 'skipped: no test login (create .env.test.local)'
