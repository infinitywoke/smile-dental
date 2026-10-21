import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { signIn, visible } from './helpers'

// Notifications on the installed Clinic OS: the settings screen, the service worker and the scheduler's
// door. A real notification needs a phone, so delivery is checked by hand on the phone.
test.skip(!testLogin, NO_TEST_LOGIN)

test('Settings leads to Notifications: what to hear about and quiet hours, kept after a reload', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/settings')
  await visible(page.getByRole('link', { name: 'Notifications' })).click()
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
  const brief = page.getByRole('switch', { name: /The morning brief/ })
  await expect(brief).toBeChecked()
  await expect(page.getByRole('switch', { name: /Patient names on the lock screen/ })).not.toBeChecked()
  await expect(page.getByLabel('From')).toHaveValue('21:00')

  // Until the database part has been run, the screen says so and stops here
  if (await page.getByText('Notifications are not set up on the server yet.').isVisible()) return

  await brief.click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByRole('switch', { name: /The morning brief/ })).not.toBeChecked()
  await page.getByRole('switch', { name: /The morning brief/ }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
})

test('the service worker is served, and the scheduler door is shut to anyone without the secret', async ({ request }) => {
  const worker = await request.get('/sw.js')
  expect(worker.ok()).toBe(true)
  expect(await worker.text()).toContain('notificationclick')
  const noSecret = await request.post('/api/notify')
  expect([401, 503]).toContain(noSecret.status())
  const wrongSecret = await request.post('/api/notify', { headers: { authorization: 'Bearer not-the-secret' } })
  expect([401, 503]).toContain(wrongSecret.status())
})
