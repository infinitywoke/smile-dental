import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { signIn, visible } from './helpers'

// The Cockpit look: Today's instrument panel, and the light or dark choice in Settings, kept for this
// phone. Nothing is sent: Running late only opens WhatsApp links.
test.skip(!testLogin, NO_TEST_LOGIN)

test('Today opens on the Cockpit: open status, the seen ring, who is next, the money and the controls', async ({ page }) => {
  await signIn(page)
  await page.goto('/app')
  const cockpit = page.getByRole('region', { name: 'Cockpit' })
  await expect(cockpit.getByText('SEEN TODAY')).toBeVisible()
  await expect(cockpit.getByText(/^(Open now|Opens today|Closed)/)).toBeVisible()
  await expect(cockpit.getByLabel('Time now')).toHaveText(/^\d{1,2}:\d{2}(AM|PM)$/)
  await expect(cockpit.getByText('COLLECTED')).toBeVisible()
  await expect(cockpit.getByText('OWED')).toBeVisible()
  await expect(cockpit.getByRole('link', { name: 'Walk-in' })).toHaveAttribute('href', '/app/patients/new')
  await expect(cockpit.getByRole('link', { name: 'Block time' })).toHaveAttribute('href', '#free-times')
  // Exactly one Today heading still leads the screen
  await expect(page.getByRole('heading', { name: /^Today/ })).toHaveCount(1)

  await cockpit.getByRole('button', { name: 'Running late' }).click()
  const sheet = page.getByRole('dialog', { name: 'Running late' })
  await expect(sheet.getByRole('button', { name: '15 min' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: '20 min' }).click()
  await expect(sheet.getByRole('button', { name: '20 min' })).toHaveAttribute('aria-pressed', 'true')
  const send = sheet.getByRole('link', { name: 'Send' }).first()
  if (await send.count()) expect(decodeURIComponent((await send.getAttribute('href'))!)).toContain('running about 20 minutes late')
  else await expect(sheet.getByText('No one else is booked today.')).toBeVisible()
})

test('Settings: the look follows the phone, or is light or dark, and stays chosen for this phone', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/settings')
  const root = page.locator('#hud-root')
  const look = page.getByRole('radiogroup', { name: 'Look' })
  await expect(look.getByRole('radio', { name: 'Phone' })).toHaveAttribute('aria-checked', 'true')
  await expect(root).toHaveAttribute('data-theme', 'system')

  await look.getByRole('radio', { name: 'Dark' }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'clinic-theme')?.value).toBe('dark')
  await page.goto('/app')
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'dark')
  // Dark really is dark: the page behind the panels is the Cockpit's navy
  expect(await page.locator('#hud-root').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(5, 13, 36)')

  await page.goto('/app/settings')
  await visible(page.getByRole('radio', { name: 'Light' })).click()
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('radio', { name: 'Phone' }).click()
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'system')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'clinic-theme')?.value).toBe('system')
})
