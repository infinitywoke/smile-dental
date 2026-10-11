import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { captureWhatsapp, cleanRun, newPhone, newRunId, signIn, visible, whatsappText } from './helpers'

// A walk-in's first visit, end to end: new patient, notes and a photo, bill, payment, next visit,
// one WhatsApp message, then the money still owed is collected.
const runId = newRunId()
const patientName = `${runId} Patient`
const phone = newPhone()
const notes = `${runId}: pain in lower right. Tooth 46 tender on percussion.`
const caption = `${runId} x-ray`
const fixturePhoto = path.join(__dirname, 'fixtures', 'tooth.png')

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let patientId = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await page?.close()
  await cleanRun(runId)
})

test('adds a new patient and starts a visit', async () => {
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('link', { name: /New patient/ }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)

  await visible(page.getByLabel('Name', { exact: true })).fill(patientName)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await visible(page.getByRole('radio', { name: 'Male', exact: true })).click()
  await visible(page.getByLabel('Date of birth')).fill('1990-05-15')
  await visible(page.getByLabel('Medical alerts')).fill('Penicillin allergy')
  await page.getByRole('button', { name: 'Save and start visit' }).click()

  await expect(page).toHaveURL(/\/app\/patients\/[^/]+\/visits\/new$/)
  patientId = page.url().match(/\/app\/patients\/([^/]+)\/visits/)![1]
  await expect(page.getByRole('heading', { name: 'New visit' })).toBeVisible()
  await expect(visible(page.locator('p', { hasText: 'Medical alert:' }))).toContainText('Penicillin allergy')
})

test('saves a visit with notes and a captioned photo, and lands on the bill', async () => {
  await visible(page.getByLabel('Notes', { exact: true })).fill(notes)
  // Tap Gallery like a person would; this picks the visible screen's file input
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Gallery' }).click()])
  await chooser.setFiles(fixturePhoto)
  await visible(page.getByPlaceholder('What is this?')).fill(caption)
  await page.getByRole('button', { name: 'Next: Bill' }).click()

  // A failed upload keeps the editor open, so landing on the bill means everything saved
  await expect(page).toHaveURL(/\/app\/visits\/[^/?]+\?step=bill$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: patientName })).toBeVisible()
  await expect(visible(page.getByText('No charges yet'))).toBeVisible()

  // Back on Notes: the words and the photo are there
  await page.getByRole('navigation', { name: 'Visit steps' }).getByRole('button', { name: 'Notes' }).click()
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toHaveValue(notes)
  await expect(page.getByRole('img', { name: caption })).toHaveCount(1)
  await expect(visible(page.getByText(caption, { exact: true }))).toBeVisible()
})

test('walks the visit: bill, cash payment, next visit, one WhatsApp message, done', async () => {
  // Notes -> Next: Bill (nothing new to save, so it just moves on)
  await visible(page.getByRole('button', { name: 'Next: Bill' })).click()

  // Add charge is collapsed until tapped
  await expect(visible(page.getByLabel('What for'))).toHaveCount(0)
  await visible(page.getByRole('button', { name: 'Add charge' })).click()
  await visible(page.getByLabel('What for')).fill(`${runId} scaling`)
  await visible(page.locator('#charge-amount')).fill('1200')
  await visible(page.getByRole('button', { name: 'Add to bill' })).click()
  await expect(visible(page.getByText(`${runId} scaling`))).toBeVisible()

  // The QR stays hidden until asked for, then matches the amount typed
  await expect(visible(page.getByRole('img', { name: /UPI QR/ }))).toHaveCount(0)
  await visible(page.locator('#payment-amount')).fill('1000')
  await visible(page.getByRole('button', { name: /Show UPI QR/ })).click()
  await expect(visible(page.getByRole('img', { name: /UPI QR for ₹1,000/ }))).toBeVisible()
  await visible(page.getByRole('button', { name: /Collected cash/ })).click()
  await expect(visible(page.getByText('Paid by cash'))).toBeVisible()
  await expect(visible(page.getByText('Balance this visit'))).toBeVisible()

  // Send: a next visit is already suggested, and the photo can be ticked for a link
  await visible(page.getByRole('button', { name: 'Next: Send' })).click()
  await expect(visible(page.getByText('Next visit', { exact: true }))).toBeVisible()
  await expect(visible(page.getByRole('button', { name: 'Change' }))).toBeVisible()
  await visible(page.getByLabel(caption)).check()

  const whatsapp = await captureWhatsapp(page)
  await visible(page.getByRole('button', { name: 'Send on WhatsApp' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  // One message to the patient: bill, balance, next visit and a 30-day photo link
  expect(whatsapp.url).toContain(`wa.me/91${phone}`)
  const text = whatsappText(whatsapp.url)
  expect(text).toContain(`${runId} scaling`)
  expect(text).toContain('Total: ₹1,200')
  expect(text).toContain('Paid: ₹1,000 (cash)')
  expect(text).toContain('Balance: ₹200')
  expect(text).toContain('*Next appointment*')
  expect(text).toContain('*Prescription*')
  const link = text.match(/https:\/\/\S+\/storage\/v1\/object\/sign\/visit-photos\/\S+/)?.[0]
  expect(link).toBeTruthy()
  const token = new URL(link!).searchParams.get('token')!
  const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  const days = (exp * 1000 - Date.now()) / 86_400_000
  expect(days).toBeGreaterThan(29)
  expect(days).toBeLessThan(31)
})

test('lists the visit on Today as done, with the money', async () => {
  // The WhatsApp hand-off left the app, so come back in
  await page.goto('/app')
  await expect(page).toHaveURL(/\/app$/)
  const visit = visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: '1 photo' }))
  await expect(visit).toHaveCount(1)
  await expect(visit).toContainText(runId)
  await expect(visit).toContainText('Done')
  await expect(visit).toContainText('₹1,200 billed')
})

test('Today lists the money owed, and the patient page leads with Collect', async () => {
  await page.goto('/app')
  const due = visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: 'Collect' }))
  await expect(due).toHaveCount(1)
  await expect(due).toContainText('₹200 due')

  await page.goto(`/app/patients/${patientId}`)
  await expect(visible(page.getByRole('heading', { name: 'Coming up' }))).toBeVisible()
  await visible(page.getByRole('link', { name: 'Collect ₹200' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[^/?]+\?step=bill$/)

  // The amount is already filled in; cash settles it
  await expect(visible(page.locator('#payment-amount'))).toHaveValue('200')
  await visible(page.getByRole('button', { name: /Collected cash/ })).click()
  await expect(visible(page.getByText('Paid by cash')).first()).toBeVisible()
})
