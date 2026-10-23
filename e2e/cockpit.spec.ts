import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import {
  blocksLeftToday, captureWhatsapp, cleanRun, createAppointmentAtFirstFree, createPatient, newPhone, newRunId, showMonth, signIn, testDb, visible, whatsappText,
} from './helpers'
import { inIndia } from '../src/lib/schedule'

// The Quiet Cockpit: Today stays quiet unless something needs him (whether the clinic is open, how many
// seen, the money hidden until tapped, the next patient docked at the thumb), the Practice tab holds the
// back office, and the light or dark choice in Settings is kept for this phone. On the visit, his usual
// charges are one tap each and the next step (collect, then send) stays in reach above the bottom bar.
// Nothing is sent: WhatsApp links are only opened (and caught here).
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
  expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')

  await look.getByRole('radio', { name: 'Dark' }).click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'clinic-theme')?.value).toBe('dark')
  await page.goto('/app')
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'dark')
  // Dark really is dark: the page behind the panels is navy
  expect(await page.locator('#hud-root').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 21, 52)')

  await page.goto('/app/settings')
  await visible(page.getByRole('radio', { name: 'Light' })).click()
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('radio', { name: 'Phone' }).click()
  await expect(page.locator('#hud-root')).toHaveAttribute('data-theme', 'system')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'clinic-theme')?.value).toBe('system')
  // Phone follows this phone, which is in dark mode here
  expect(await page.locator('#hud-root').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 21, 52)')
})

test('the Visit: a usual charge is one tap with Undo, the next visit can be months on from the calendar, and the next step stays in reach: collect, then send', async ({ page }) => {
  const phone = newPhone('7')
  const patientId = await createPatient(`${runId} Quick`, phone)
  await signIn(page)
  await page.goto(`/app/patients/${patientId}`)
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const visitUrl = page.url()
  const visitId = visitUrl.split('/').pop()!
  const { supabase } = await testDb()
  const charges = async () => (await supabase.from('visit_charges').select('amount').eq('visit_id', visitId)).data!.map((c) => Number(c.amount))

  // Nothing is due yet, and nothing to send: no next-step bar
  const bar = page.getByRole('region', { name: 'Next step' })
  await expect(bar).toHaveCount(0)

  // One tap adds a usual charge; Undo takes it off; tapped again, it stays
  const chip = visible(page.getByRole('group', { name: 'Usual charges' })).getByRole('button').first()
  const price = (await chip.locator('span').nth(1).textContent())!
  const amount = Number(price.replace(/[^\d.]/g, ''))
  await chip.click()
  await expect(visible(page.getByRole('status').filter({ hasText: /^Added .+: ₹/ }))).toContainText(price)
  await expect.poll(charges).toEqual([amount])
  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect(visible(page.getByText('Undone'))).toBeVisible()
  await expect.poll(charges).toEqual([])
  await chip.click()
  await expect.poll(charges).toEqual([amount])

  // The suggestion is a week on; a date further away comes from the calendar (two months on, through
  // its months view)
  await expect(visible(page.getByText(/^Suggested: /))).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('group', { name: 'When' })).toHaveCount(0)
  await visible(page.getByRole('button', { name: 'Pick another date' })).click()
  const picker = page.getByRole('dialog', { name: 'Next visit' })
  const [y, m] = inIndia(new Date()).date.split('-').map(Number)
  const later = new Date(Date.UTC(y, m - 1 + 2, 1))
  const next = `${later.getUTCFullYear()}-${String(later.getUTCMonth() + 1).padStart(2, '0')}`
  await showMonth(picker, next)
  // The first open day of that month with a free time
  const days = picker.getByRole('group', { name: /^Days of / }).getByRole('button', { disabled: false })
  for (let i = 0; i < (await days.count()); i++) {
    await days.nth(i).click()
    await picker.getByText('Checking availability…').waitFor({ state: 'detached' }).catch(() => {})
    if (await picker.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)/ }).count()) break
  }
  await picker.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)/ }).first().click()
  await expect(picker).toHaveCount(0)
  let startsAt = ''
  await expect.poll(async () => {
    startsAt = (await supabase.from('appointments').select('starts_at').eq('from_visit_id', visitId).eq('status', 'booked')).data?.[0]?.starts_at ?? ''
    return startsAt
  }).not.toBe('')
  // Booked in the month two on from this one
  expect(inIndia(startsAt).date.slice(0, 7)).toBe(next)

  // Up at the notes, the bar offers to collect what is due
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(bar).toBeVisible()
  await expect(bar).toContainText(`Still due${price}`)
  await bar.getByRole('button', { name: 'Cash received' }).click()
  await expect.poll(async () => (await supabase.from('payments').select('amount, method').eq('visit_id', visitId)).data!.map((p) => ({ amount: Number(p.amount), method: p.method })))
    .toEqual([{ amount, method: 'cash' }])
  const undo = visible(page.getByRole('status').filter({ hasText: `${price} cash recorded` }))
  await expect(undo).toBeVisible()

  // Then to send, with the Undo bar lifted above it
  await expect(bar.getByRole('button', { name: 'Send on WhatsApp' })).toBeVisible()
  const [undoBox, barBox] = [(await undo.boundingBox())!, (await bar.boundingBox())!]
  expect(undoBox.y + undoBox.height).toBeLessThanOrEqual(barBox.y)
  const whatsapp = await captureWhatsapp(page)
  await bar.getByRole('button', { name: 'Send on WhatsApp' }).click()
  const openButton = visible(page.getByRole('link', { name: 'Open WhatsApp' }))
  await Promise.race([
    page.waitForURL(/wa\.me\//, { timeout: 30_000 }),
    openButton.waitFor({ timeout: 30_000 }).then(() => openButton.click()),
  ])
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  expect(whatsapp.url).toContain(`wa.me/91${phone}`)
  expect(whatsappText(whatsapp.url)).toContain(`*Total: ${price}*`)

  // Paid and sent: nothing left for the bar
  await page.goto(visitUrl)
  await expect(visible(page.getByText('WhatsApp sent', { exact: true }))).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(bar).toHaveCount(0)
})

test('New patient: Start visit is in reach above the bottom bar, without scrolling', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/patients/new')
  const start = visible(page.getByRole('button', { name: /start visit/i }))
  await expect(start).toBeInViewport()
  const box = (await start.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height - 64)
})
