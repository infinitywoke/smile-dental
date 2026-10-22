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
  await expect(cockpit.getByText('SEEN TODAY', { exact: true })).toBeVisible()
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

test('the Cockpit says whether the website takes bookings, and only the clinic’s own login can pause it', async ({ page }) => {
  await signIn(page)
  await page.goto('/app')
  const line = page.getByRole('region', { name: 'Cockpit' }).getByRole('button', { name: /^Website/ })
  await expect(line).toContainText(/Taking bookings|Paused/)
  await line.click()
  const sheet = page.getByRole('dialog', { name: 'Online booking' })
  await expect(sheet).toContainText('Booking here in Clinic OS works as usual.')
  // The test login is not the clinic's, so the live website never changes here
  const turnOn = sheet.getByRole('button', { name: 'Turn online booking back on' })
  if (await turnOn.count()) await turnOn.click()
  else await sheet.getByRole('button', { name: /^Pause for the rest of today/ }).click()
  await expect(sheet.getByRole('alert')).toHaveText('Only the clinic’s own login can pause online booking.')
})

test('Settings: the look is light until changed, or dark, or follows the phone, and stays chosen for this phone', async ({ page }) => {
  // A phone in dark mode still opens light until he chooses
  await page.emulateMedia({ colorScheme: 'dark' })
  await signIn(page)
  await page.goto('/app/settings')
  const root = page.locator('#hud-root')
  const look = page.getByRole('radiogroup', { name: 'Look' })
  await expect(look.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
  await expect(root).toHaveAttribute('data-theme', 'light')
  expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(243, 246, 252)')

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
  // Phone follows this phone, which is in dark mode here
  expect(await page.locator('#hud-root').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(5, 13, 36)')

  // Game touches: on until turned off, and kept for this phone
  const fun = page.getByRole('switch', { name: /Game touches/ })
  await expect(fun).toBeChecked()
  await fun.click()
  await expect(fun).not.toBeChecked()
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'clinic-fun')?.value).toBe('off')
  await page.goto('/app')
  await expect(page.locator('.hud-ring-done')).toHaveCount(0)
  await page.goto('/app/settings')
  await page.getByRole('switch', { name: /Game touches/ }).click()
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'clinic-fun')?.value).toBe('on')
})
