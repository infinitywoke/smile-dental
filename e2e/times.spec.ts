import { expect, test, type Page } from '@playwright/test'
import { addDays, blockInstant, formatBlock, formatDay } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from './env'
import {
  captureWhatsapp, cleanRun, clearTimeOff, createAppointment, createPatient, makeRequest, makeRequestFrom, newPhone,
  newRunId, openDay, patientsWithPhone, signIn, visible, whatsappText,
} from './helpers'

// Times: website requests (confirm the asked time, or give another; never a second record for a
// known patient; safe to confirm twice), an existing patient's appointment (cancel it, tell them,
// then book the next one), and time off (a booked day can't be closed; reopening is exact).
const runId = newRunId()
const patientName = `${runId} Booked`

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let patientId = ''
// Days whose time off the specs touch, cleared at the end whatever happened
const timeOffDays: string[] = []
// The patient's coming visit. Its time is one no request in this file asks for: when a Friday folds
// two "days ahead" into the same Saturday, the two must not want the same time.
const COMING_AT = '12:30'

test.beforeAll(async ({ browser }) => {
  patientId = await createPatient(patientName, newPhone())
  await createAppointment(patientId, openDay(4), COMING_AT)
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await page?.close()
  for (const day of timeOffDays) await clearTimeOff(day)
  await cleanRun(runId)
})

// A website request's card on Today, found by one of its buttons
const requestCard = (on: Page, name: string, button: string) =>
  visible(on.locator('div').filter({ hasText: name }).filter({ has: on.getByRole('button', { name: button }) })).last()

test('Today: one tap confirms a website request and prepares the patient message', async () => {
  const { day, requestName, requestPhone } = await makeRequest(runId, 'Quick', '15:00', 2)
  const whatsapp = await captureWhatsapp(page)

  await page.goto('/app')
  const card = visible(page.locator('div').filter({ hasText: requestName }).filter({ has: page.getByRole('button', { name: 'Confirm' }) })).last()
  await expect(card).toBeVisible()
  await expect(card).toContainText('Diabetes')
  await card.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  expect(whatsapp.url).toContain(`wa.me/91${requestPhone}`)
  const text = whatsappText(whatsapp.url)
  // Friendly, first name only: never the rest of the name or anything else from the request
  expect(text.startsWith(`Hi ${runId},\n\n`)).toBe(true)
  expect(text).not.toContain(requestName)
  expect(text).not.toContain('Diabetes')
  expect(text).toContain('is *confirmed*')
  expect(text).toContain(`Time: *${formatBlock('15:00')}*`)
  expect(text).toContain('_Please come 5 minutes early if you can._')
  expect(text).toContain('See you soon,')

  // It is now an appointment on that day's sheet
  await page.goto(`/app?d=${day}`)
  await expect(visible(page.getByRole('link').filter({ hasText: requestName }))).toHaveCount(1)
})

test('request screen: tap another time, save, WhatsApp confirmation for the patient', async () => {
  const { id, day, requestName, requestPhone } = await makeRequest(runId, 'Booker', '10:30', 3)
  const whatsapp = await captureWhatsapp(page)

  // On Today the card offers Other time, which opens the request with the day's times
  await page.goto('/app')
  const card = visible(page.locator('div').filter({ hasText: requestName }).filter({ has: page.getByRole('link', { name: 'Other time' }) })).last()
  await card.getByRole('link', { name: 'Other time' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/requests/${id}`))
  await expect(visible(page.getByText('Diabetes').first())).toBeVisible()
  await expect(visible(page.getByText(`Asked for ${formatDay(day)}, ${formatBlock('10:30')}`))).toBeVisible()
  await page.goto(`/app/requests/${id}?d=${day}`)

  // The asked time (10:30) is already chosen and Save works at once; no drag chip anywhere
  await expect(visible(page.getByRole('button', { name: /^10:30 AM/ }))).toHaveAttribute('aria-pressed', 'true')
  await expect(visible(page.getByRole('button', { name: 'Save and confirm' }))).toBeEnabled()
  await expect(page.getByText(/slide the name/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Drag / })).toHaveCount(0)

  // Tap 11:00 instead, then save
  await visible(page.getByRole('button', { name: /^11:00 AM/ })).click()
  await expect(visible(page.getByRole('button', { name: /^11:00 AM/ }))).toHaveAttribute('aria-pressed', 'true')
  await visible(page.getByRole('button', { name: 'Save and confirm' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  expect(whatsapp.url).toContain(`wa.me/91${requestPhone}`)
  const text = whatsappText(whatsapp.url)
  expect(text).toContain('confirmed')
  expect(text).toContain(formatBlock('11:00'))

  // On the day's sheet as an appointment; gone from Needs you
  await page.goto(`/app?d=${day}`)
  await expect(visible(page.getByRole('link').filter({ hasText: requestName }))).toHaveCount(1)
  await page.goto('/app')
  await expect(visible(page.getByText(requestName))).toHaveCount(0)
})

test('cancels the coming visit from the patient page, offers to tell them, then books the next one', async () => {
  await page.goto(`/app/patients/${patientId}`)
  await expect(visible(page.getByRole('heading', { name: 'Coming up' }))).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await visible(page.getByRole('button', { name: 'Cancel appointment' })).click()

  // Cancelled: one optional tap tells the patient on WhatsApp (first name only, the day and time)
  await expect(page).toHaveURL(/\/app\/appointments\/[^/]+\/cancelled/)
  await expect(visible(page.getByRole('heading', { name: 'Appointment cancelled' }))).toBeVisible()
  const tell = visible(page.getByRole('link', { name: `Tell ${runId} on WhatsApp` }))
  await expect(tell).toBeVisible()
  const text = whatsappText((await tell.getAttribute('href')) ?? '')
  expect(text.startsWith(`Hi ${runId},\n\n`)).toBe(true)
  expect(text).not.toContain(patientName)
  expect(text).toContain('is *cancelled*:')
  expect(text).toContain(`Time: *${formatBlock(COMING_AT)}*`)
  expect(text).toContain('Take care,')

  await visible(page.getByRole('link', { name: `Back to ${patientName}` })).click()
  await expect(page).toHaveURL(new RegExp(`/app/patients/${patientId}$`))
  await expect(visible(page.getByRole('heading', { name: 'Coming up' }))).toHaveCount(0)

  // Book appointment sits under Start visit on the patient page
  await visible(page.getByRole('link', { name: 'Book appointment' })).click()
  await expect(page).toHaveURL(/\/app\/book\?patient=/)
  await expect(visible(page.getByRole('heading', { name: `Book ${patientName}` }))).toBeVisible()

  // Times are there straight away (late in the day, when today has none left, the page opens the next
  // open day by itself); the patient is already chosen, so there is only the reason and Book
  const times = visible(page.getByRole('link', { name: /^\d{1,2}:\d{2} (AM|PM)/ }))
  await expect(times.first()).toBeVisible()
  await times.first().click()
  await expect(visible(page.getByText(patientName, { exact: true })).first()).toBeVisible()
  await expect(visible(page.getByRole('button', { name: 'New patient' }))).toHaveCount(0)
  await visible(page.getByRole('button', { name: 'Book appointment' })).click()
  await expect(visible(page.getByRole('heading', { name: 'Booked' }))).toBeVisible()
  await expect(visible(page.getByRole('link', { name: /Send confirmation on WhatsApp/ }))).toBeVisible()
})

test('booking page is never blank: a closed day says so, with a big Next day button', async () => {
  let friday = openDay(1)
  while (new Date(`${friday}T00:00:00Z`).getUTCDay() !== 5) friday = addDays(friday, 1)
  await page.goto(`/app/book?d=${friday}`)
  await expect(visible(page.getByText('The clinic is closed on Fridays.'))).toBeVisible()
  const nextDay = visible(page.getByRole('link', { name: 'Next day' }))
  await expect(nextDay).toHaveCount(1)
  expect((await nextDay.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await nextDay.click()
  await expect(page).toHaveURL(new RegExp(`d=${addDays(friday, 1)}`))
  await expect(visible(page.getByRole('link', { name: /^\d{1,2}:\d{2} (AM|PM)/ })).first()).toBeVisible()
})

test('Move: the current time is marked; a new time sends the moved message', async () => {
  const moverName = `${runId} Mover`
  const moverId = await createPatient(moverName, newPhone())
  const day = openDay(5)
  await createAppointment(moverId, day, '11:00')
  const whatsapp = await captureWhatsapp(page)

  await page.goto(`/app/patients/${moverId}`)
  await visible(page.getByRole('link', { name: 'Move' })).click()
  await expect(page).toHaveURL(/\/move/)
  await page.goto(`${new URL(page.url()).pathname}?d=${day}`)

  await expect(visible(page.getByRole('button', { name: /^11:00 AM/ }))).toHaveAttribute('aria-pressed', 'true')
  await expect(visible(page.getByRole('button', { name: 'Move appointment' }))).toBeDisabled()
  await expect(page.getByText(/slide the name/i)).toHaveCount(0)

  await visible(page.getByRole('button', { name: /^2:30 PM/ })).click()
  await expect(visible(page.getByRole('button', { name: 'Move appointment' }))).toBeEnabled()
  await visible(page.getByRole('button', { name: 'Move appointment' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  const text = whatsappText(whatsapp.url)
  expect(text).toContain(`Hi ${runId},`)
  expect(text).toContain("has moved. Here's the new time:")
  expect(text).not.toContain('confirmed')
  expect(text).toContain(`Time: *${formatBlock('14:30')}*`)
  expect(text).toContain('_Please come 5 minutes early if you can._')
})

test('phone booking: type part of the phone, tap the patient row, Book, WhatsApp button', async () => {
  const phone = newPhone()
  const bookName = `${runId} Phoned`
  await createPatient(bookName, phone)
  const day = openDay(6)

  await page.goto(`/app/book?d=${day}`)
  await visible(page.getByRole('link', { name: /^\d{1,2}:\d{2} (AM|PM)/ }).first()).click()
  await expect(visible(page.getByRole('button', { name: 'Search' }))).toHaveCount(0)

  // Results appear while typing; the whole row is the tap target
  await visible(page.getByRole('searchbox')).fill(phone.slice(-6))
  const row = visible(page.getByRole('button', { name: new RegExp(bookName) }))
  await expect(row).toBeVisible()
  const box = await row.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(48)
  await row.click()
  await visible(page.getByRole('button', { name: 'Book appointment' })).click()
  await expect(visible(page.getByRole('heading', { name: 'Booked' }))).toBeVisible()
  await expect(visible(page.getByRole('link', { name: /Send confirmation on WhatsApp/ }))).toBeVisible()
  await expect(visible(page.getByRole('link', { name: 'Back to Today' }))).toBeVisible()
})

test('one-tap Confirm never doubles a known patient: the request page asks, with the match chosen', async () => {
  const phone = newPhone()
  const knownName = `${runId} Prakash Shetty`
  const knownId = await createPatient(knownName, phone)
  // The same person, spelled another way on the website
  const { id, requestName } = await makeRequestFrom(runId, 'Prakash', '15:30', 2, { phone })
  const whatsapp = await captureWhatsapp(page)

  await page.goto('/app')
  await requestCard(page, requestName, 'Confirm').getByRole('button', { name: 'Confirm' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/requests/${id}`))
  await expect(visible(page.getByText(`This number belongs to ${knownName}.`))).toBeVisible()
  await expect(visible(page.getByRole('radio', { name: new RegExp(knownName) }))).toBeChecked()
  expect(await patientsWithPhone(phone)).toHaveLength(1)

  await visible(page.getByRole('button', { name: 'Save and confirm' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  expect(whatsapp.url).toContain(`wa.me/91${phone}`)
  expect((await patientsWithPhone(phone)).map((p) => p.id)).toEqual([knownId])
})

test('Confirm, then Confirm again on an old card (another tab): the WhatsApp confirmation still opens', async ({ browser }) => {
  const { requestName, requestPhone } = await makeRequest(runId, 'Twice', '11:30', 3)
  const other = await browser.newPage()
  try {
    await signIn(other)
    // The old card stays on this screen while the other tab confirms
    await page.goto('/app')
    const oldCard = requestCard(page, requestName, 'Confirm')
    await expect(oldCard).toBeVisible()

    const first = await captureWhatsapp(other)
    await other.goto('/app')
    await requestCard(other, requestName, 'Confirm').getByRole('button', { name: 'Confirm' }).click()
    await other.waitForURL(/wa\.me\//, { timeout: 30_000 })
    expect(whatsappText(first.url)).toContain('is *confirmed*')

    const again = await captureWhatsapp(page)
    await oldCard.getByRole('button', { name: 'Confirm' }).click()
    await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
    expect(again.url).toContain(`wa.me/91${requestPhone}`)
    const text = whatsappText(again.url)
    expect(text).toContain('is *confirmed*')
    expect(text).toContain(`Time: *${formatBlock('11:30')}*`)
    expect(await patientsWithPhone(requestPhone)).toHaveLength(1)
  } finally {
    await other.close()
  }
})

test('a request asked 2 days ago says it is no longer held, and can be declined on the card', async () => {
  const { requestName, requestPhone } = await makeRequestFrom(runId, 'Old', '17:00', 3, { hoursAgo: 50 })
  const whatsapp = await captureWhatsapp(page)
  await page.goto('/app')
  const card = requestCard(page, requestName, 'Decline')
  await expect(card).toContainText('No longer held, asked 2 days ago')
  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: 'Decline' }).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  expect(whatsapp.url).toContain(`wa.me/91${requestPhone}`)
  expect(whatsappText(whatsapp.url)).toContain("couldn't fit the time you asked for")
})

test('phone booking: a new patient with a known number shows the match, and books them instead', async () => {
  const phone = newPhone()
  const familyName = `${runId} Family`
  await createPatient(familyName, phone)

  await page.goto(`/app/book?d=${openDay(7)}`)
  await visible(page.getByRole('link', { name: /^\d{1,2}:\d{2} (AM|PM)/ }).first()).click()
  await visible(page.getByRole('button', { name: 'New patient' })).click()
  await visible(page.getByLabel('Name', { exact: true })).fill(`${runId} Kid`)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await visible(page.getByRole('radio', { name: 'Female', exact: true })).click()
  await visible(page.getByRole('button', { name: 'Book appointment' })).click()

  // Nothing saved yet: the number belongs to someone, so the doctor says who this is
  await expect(visible(page.getByText(`This number belongs to ${familyName}.`))).toBeVisible()
  await expect(visible(page.getByRole('button', { name: `Someone new: ${runId} Kid` }))).toBeVisible()
  expect(await patientsWithPhone(phone)).toHaveLength(1)

  await visible(page.getByRole('button', { name: `Book ${familyName}` })).click()
  await expect(visible(page.getByRole('heading', { name: 'Booked' }))).toBeVisible()
  expect((await patientsWithPhone(phone)).map((p) => p.name)).toEqual([familyName])
})

test('a day with a booked patient cannot be closed: the screen names them', async () => {
  const closerName = `${runId} Closer`
  const closerId = await createPatient(closerName, newPhone())
  const day = openDay(9)
  timeOffDays.push(day)
  await createAppointment(closerId, day, '10:30')

  await page.goto(`/app?d=${day}`)
  await visible(page.getByRole('button', { name: 'Close this day' })).click()
  const alert = visible(page.getByRole('alert').filter({ hasText: `${closerName} (10:30 AM)` }))
  await expect(alert).toContainText('is booked on this day. Move or cancel first, then close the day.')
  await expect(visible(page.getByText('This day is blocked off.'))).toHaveCount(0)
  await expect(visible(page.getByRole('button', { name: 'Close this day' }))).toBeVisible()
})

test('time off: reopening is exact (a closed day reopens as a whole; a time blocked on its own stays blocked)', async () => {
  const day = openDay(23)
  timeOffDays.push(day)
  const bookAt = `/app/book?at=${encodeURIComponent(blockInstant(day, '16:30'))}`

  // Block 4:30 PM on its own, then close the whole day
  await page.goto(bookAt)
  await visible(page.getByRole('button', { name: 'Block this time instead' })).click()
  await expect(page).toHaveURL(new RegExp(`/app\\?d=${day}`))
  await visible(page.getByRole('button', { name: 'Close this day' })).click()
  await expect(visible(page.getByText('This day is blocked off.'))).toBeVisible()

  // Inside the closed day, a time can't be reopened on its own: the screen offers the day
  await page.goto(bookAt)
  await expect(visible(page.getByText('This whole day is closed.'))).toBeVisible()
  await expect(visible(page.getByRole('button', { name: 'Reopen', exact: true }))).toHaveCount(0)
  await visible(page.getByRole('button', { name: 'Reopen the day' })).click()

  // The day is open again; 4:30 PM, blocked on its own, still is
  await expect(visible(page.getByText('This time is blocked off (Blocked).'))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Reopen', exact: true })).click()
  await expect(visible(page.getByRole('button', { name: 'Block this time instead' }))).toBeVisible()
})
