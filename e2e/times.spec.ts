import { expect, test, type Page } from '@playwright/test'
import { formatBlock, formatDay } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from './env'
import {
  captureWhatsapp, cleanRun, createAppointment, createPatient, makeRequest, newPhone, newRunId, openDay, signIn,
  visible, whatsappText,
} from './helpers'

// Times: website requests (confirm the asked time, or give another), and an existing patient's
// appointment (cancel it, then book the next one from the patient page).
const runId = newRunId()
const patientName = `${runId} Booked`

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let patientId = ''

test.beforeAll(async ({ browser }) => {
  patientId = await createPatient(patientName, newPhone())
  await createAppointment(patientId, openDay(4), '10:30')
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await page?.close()
  await cleanRun(runId)
})

test('Today: one tap confirms a website request and prepares the patient message', async () => {
  const { day, requestName, requestPhone } = await makeRequest(runId, 'Quick', '15:10', 2)
  const whatsapp = await captureWhatsapp(page)

  await page.goto('/app')
  const card = visible(page.locator('div').filter({ hasText: requestName }).filter({ has: page.getByRole('button', { name: 'Confirm' }) })).last()
  await expect(card).toBeVisible()
  await expect(card).toContainText('Diabetes')
  await card.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  expect(whatsapp.url).toContain(`wa.me/91${requestPhone}`)
  const text = whatsappText(whatsapp.url)
  expect(text).toContain('confirmed')
  expect(text).toContain(formatBlock('15:10'))

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

  // Tap 11:10 instead, then save
  await visible(page.getByRole('button', { name: /^11:10 AM/ })).click()
  await expect(visible(page.getByRole('button', { name: /^11:10 AM/ }))).toHaveAttribute('aria-pressed', 'true')
  await visible(page.getByRole('button', { name: 'Save and confirm' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  expect(whatsapp.url).toContain(`wa.me/91${requestPhone}`)
  const text = whatsappText(whatsapp.url)
  expect(text).toContain('confirmed')
  expect(text).toContain(formatBlock('11:10'))

  // On the day's sheet as an appointment; gone from Needs you
  await page.goto(`/app?d=${day}`)
  await expect(visible(page.getByRole('link').filter({ hasText: requestName }))).toHaveCount(1)
  await page.goto('/app')
  await expect(visible(page.getByText(requestName))).toHaveCount(0)
})

test('cancels the coming visit from the patient page, then books the next one for them', async () => {
  await page.goto(`/app/patients/${patientId}`)
  await expect(visible(page.getByRole('heading', { name: 'Coming up' }))).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await visible(page.getByRole('button', { name: 'Cancel appointment' })).click()
  await expect(visible(page.getByRole('heading', { name: 'Coming up' }))).toHaveCount(0)

  // Nothing owed and nothing coming: the page leads with booking
  await visible(page.getByRole('link', { name: 'Book next visit' })).click()
  await expect(page).toHaveURL(/\/app\/book\?patient=/)
  await expect(visible(page.getByRole('heading', { name: `Book ${patientName}` }))).toBeVisible()

  // Pick a time (late in the day there may be none left today: go to the next day); the patient is
  // already chosen, so there is only the reason and Book
  const times = visible(page.getByRole('link', { name: /^\d{1,2}:\d{2} (AM|PM)/ }))
  for (let i = 0; i < 4 && (await times.count()) === 0; i++) {
    await visible(page.getByRole('link', { name: 'Next day' })).click()
    await page.waitForLoadState('networkidle')
  }
  await times.first().click()
  await expect(visible(page.getByText(patientName, { exact: true })).first()).toBeVisible()
  await expect(visible(page.getByRole('button', { name: 'New patient' }))).toHaveCount(0)
  await visible(page.getByRole('button', { name: 'Book appointment' })).click()
  await expect(visible(page.getByRole('heading', { name: 'Booked' }))).toBeVisible()
  await expect(visible(page.getByRole('link', { name: /Send confirmation on WhatsApp/ }))).toBeVisible()
})

test('Move: the current time is marked; a new time sends "has been moved to"', async () => {
  const moverName = `${runId} Mover`
  const moverId = await createPatient(moverName, newPhone())
  const day = openDay(5)
  await createAppointment(moverId, day, '11:10')
  const whatsapp = await captureWhatsapp(page)

  await page.goto(`/app/patients/${moverId}`)
  await visible(page.getByRole('link', { name: 'Move' })).click()
  await expect(page).toHaveURL(/\/move/)
  await page.goto(`${new URL(page.url()).pathname}?d=${day}`)

  await expect(visible(page.getByRole('button', { name: /^11:10 AM/ }))).toHaveAttribute('aria-pressed', 'true')
  await expect(visible(page.getByRole('button', { name: 'Move appointment' }))).toBeDisabled()
  await expect(page.getByText(/slide the name/i)).toHaveCount(0)

  await visible(page.getByRole('button', { name: /^2:30 PM/ })).click()
  await expect(visible(page.getByRole('button', { name: 'Move appointment' }))).toBeEnabled()
  await visible(page.getByRole('button', { name: 'Move appointment' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  const text = whatsappText(whatsapp.url)
  expect(text).toContain('has been moved to')
  expect(text).not.toContain('confirmed')
  expect(text).toContain(formatBlock('14:30'))
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
