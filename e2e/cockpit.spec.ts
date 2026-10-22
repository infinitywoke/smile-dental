import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { blocksLeftToday, cleanRun, createAppointmentAtFirstFree, createPatient, newPhone, newRunId, signIn, visible } from './helpers'
import { inIndia } from '../src/lib/schedule'

// The Quiet Cockpit: Today stays quiet unless something needs him (whether the clinic is open, how many
// seen, the money hidden until tapped, the next patient docked at the thumb), the Practice tab holds the
// back office, and the light or dark choice in Settings is kept for this phone. Nothing is sent: Running
// late only opens WhatsApp links.
test.skip(!testLogin, NO_TEST_LOGIN)

const runId = newRunId()
test.afterAll(async () => { await cleanRun(runId) })

test('Today is quiet: open status, how many seen, the money hidden until tapped, and the next patient with Start visit', async ({ page }) => {
  // Someone booked for later today, so there is a next patient (unless the day is over)
  const patientId = await createPatient(`${runId} Next`, newPhone('6'))
  const booked = await createAppointmentAtFirstFree(patientId, inIndia(new Date()).date, blocksLeftToday(15))

  await signIn(page)
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: /^Today/ })).toHaveCount(1)
  await expect(visible(page.getByRole('button', { name: /^(Open now|Opens today|Closed)/ }))).toBeVisible()
  // The Cockpit's instruments are gone: no clock, no ring, no streak
  await expect(page.getByLabel('Time now')).toHaveCount(0)
  await expect(page.getByText('SEEN TODAY')).toHaveCount(0)
  await expect(page.getByText(/days in a row/)).toHaveCount(0)

  // Money: hidden until tapped (patients can see the screen), then shown, then hidden again
  const money = visible(page.getByRole('button', { name: "Show today's money" }))
  await expect(money).toHaveText(/₹ ••••/)
  await money.click()
  const shown = visible(page.getByRole('button', { pressed: true }).filter({ hasText: '₹' }))
  await expect(shown).not.toContainText('••••')
  await shown.click()
  await expect(visible(page.getByRole('button', { name: "Show today's money" }))).toBeVisible()

  test.skip(!booked, 'No clinic time is left today to book a next patient')
  await expect(visible(page.getByRole('list', { name: 'Schedule' }))).toContainText(`${runId} Next`)
  const next = visible(page.getByRole('region', { name: 'Next patient' }))
  await expect(next.getByRole('button', { name: 'Start visit' })).toBeVisible()
  await next.getByRole('button', { name: 'Running late' }).click()
  const sheet = page.getByRole('dialog', { name: 'Running late' })
  await expect(sheet.getByRole('button', { name: '15 min' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: '20 min' }).click()
  await expect(sheet.getByRole('button', { name: '20 min' })).toHaveAttribute('aria-pressed', 'true')
  const send = sheet.getByRole('link', { name: 'Send' }).first()
  expect(decodeURIComponent((await send.getAttribute('href'))!)).toContain('running about 20 minutes late')
})

test('the open status holds online booking and time off; only the clinic’s own login can pause booking', async ({ page }) => {
  await signIn(page)
  await page.goto('/app')
  await visible(page.getByRole('button', { name: /^(Open now|Opens today|Closed)/ })).click()
  const sheet = page.getByRole('dialog', { name: 'Today at the clinic' })
  await expect(sheet.getByRole('region', { name: 'Online booking' })).toContainText(/Taking bookings|Paused/)
  await expect(sheet).toContainText('Booking here in Clinic OS works as usual.')
  // The test login is not the clinic's, so the live website never changes here
  const turnOn = sheet.getByRole('button', { name: 'Turn online booking back on' })
  if (await turnOn.count()) await turnOn.click()
  else await sheet.getByRole('button', { name: /^Pause for the rest of today/ }).click()
  await expect(sheet.getByRole('alert')).toHaveText('Only the clinic’s own login can pause online booking.')

  // Time off: the free times, folded on Today, open (with Close this day and blocking)
  await sheet.getByRole('button', { name: /^Block time or close this day/ }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('details#free-times')).toHaveAttribute('open', '')
})

test('Practice holds Money, Costs, Stock and Settings; the look is light until changed, or dark, or follows the phone', async ({ page }) => {
  // A phone in dark mode still opens light until he chooses
  await page.emulateMedia({ colorScheme: 'dark' })
  await signIn(page)
  await page.goto('/app')
  await visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Practice/ })).click()
  await expect(page).toHaveURL(/\/app\/insights$/)
  const practice = visible(page.getByRole('navigation', { name: 'Practice' }))
  await expect(practice.getByRole('link', { name: 'Money' })).toHaveAttribute('aria-current', 'page')
  await practice.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/app\/settings$/)
  await expect(page.getByRole('switch', { name: /Game touches/ })).toHaveCount(0)

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
  // Dark really is dark: the page behind the panels is navy
  expect(await page.locator('#hud-root').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(5, 13, 36)')

  await page.goto('/app/settings')
  await visible(page.getByRole('radio', { name: 'Light' })).click()
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('radio', { name: 'Phone' }).click()
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'system')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'clinic-theme')?.value).toBe('system')
  // Phone follows this phone, which is in dark mode here
  expect(await page.locator('#hud-root').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(5, 13, 36)')
})
