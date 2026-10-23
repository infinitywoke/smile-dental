import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { signIn, testDb } from './helpers'

// An error on a Clinic OS screen reaches the database, for the morning health check to email the owner
// (.github/workflows/health.yml); the screen and the device come with it, nothing about a patient
test.skip(!testLogin, NO_TEST_LOGIN)

test('an error on a Clinic OS screen is reported once, with the screen and the device', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/settings')
  const message = `E2E error check ${Date.now()}`
  const { supabase } = await testDb()
  const reported = async () => (await supabase.from('app_errors').select('place, device').eq('message', message)).data

  // Thrown again and again until the screen is listening (an error before it has started up isn't
  // caught); the same error on the same screen is reported once
  await expect(async () => {
    await page.evaluate((text) => { setTimeout(() => { throw new Error(text) }) }, message)
    expect(await reported()).toEqual([{ place: '/app/settings', device: 'Android · Chrome' }])
  }).toPass({ timeout: 30_000 })
  await page.evaluate((text) => { setTimeout(() => { throw new Error(text) }) }, message)
  await page.waitForTimeout(1_500)
  expect(await reported()).toHaveLength(1)

  // Gone again, so tomorrow's health check doesn't email about a test
  await supabase.from('app_errors').delete().eq('message', message)
  expect(await reported()).toEqual([])
})
