import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { captureWhatsapp, cleanRun, createPatient, newPhone, newRunId, signIn, testDb, visible, whatsappText } from './helpers'

// A walk-in's visit on ONE page that saves by itself: new patient, notes, a photo marked Prescription,
// one-tap charges, part payment, UPI QR, next visit, one WhatsApp message, then Collect from Today.
const runId = newRunId()
const patientName = `${runId} Patient`
const phone = newPhone()
const notes = `${runId}: pain in lower right. Tooth 46 tender on percussion.`
const fixturePhoto = path.join(__dirname, 'fixtures', 'tooth.png')
const scaling = 'Scaling / Teeth Cleaning / Prophylaxis – Moderate case'
const otherCharge = `${runId} lab`

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let visitUrl = ''
let visitId = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await page?.close()
  await cleanRun(runId)
})

async function patientIdOf(name: string) {
  const { supabase } = await testDb()
  const { data } = await supabase.from('patients').select('id').eq('name', name).single()
  return data!.id as string
}

test('saving New patient opens the Visit page, and Back goes to Today, not the form', async () => {
  // "+" in the bottom bar opens New patient straight away
  await visible(page.getByRole('link', { name: 'New patient' })).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)

  await visible(page.getByLabel('Name', { exact: true })).fill(patientName)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await visible(page.getByRole('radio', { name: 'Male', exact: true })).click()
  await visible(page.getByLabel('Medical alerts')).fill('Penicillin allergy')
  await visible(page.getByRole('button', { name: /start visit/i })).click()

  // One page, straight away: no "New visit" page, no tabs
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  visitUrl = page.url()
  visitId = visitUrl.split('/').pop()!
  await expect(visible(page.getByRole('heading', { name: patientName }))).toBeVisible()
  // The name links to the patient page, with a 48 dp target
  const nameLink = visible(page.getByRole('link', { name: patientName }))
  expect((await nameLink.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await expect(visible(page.locator('p', { hasText: 'Medical alert:' }))).toContainText('Penicillin allergy')
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Visit steps' })).toHaveCount(0)

  // The form was replaced in the history
  await page.goBack()
  await expect(page).toHaveURL(/\/app$/)
  await expect(visible(page.getByRole('heading', { name: 'New patient' }))).toHaveCount(0)
  await page.goto(visitUrl)
})

test('notes save by themselves', async () => {
  await visible(page.getByLabel('Notes', { exact: true })).fill(notes)
  await expect(visible(page.getByText('Saved', { exact: true }))).toBeVisible({ timeout: 15_000 })

  await page.reload()
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toHaveValue(notes)
})

test('a photo uploads by itself and is marked Prescription with one tap', async () => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), visible(page.getByRole('button', { name: 'Gallery' })).click()])
  await chooser.setFiles(fixturePhoto)
  await expect(visible(page.getByRole('img', { name: /^Photo 1/ }))).toBeVisible({ timeout: 30_000 })
  await expect(visible(page.getByText('Uploading…'))).toHaveCount(0)

  await visible(page.getByRole('button', { name: 'Prescription', exact: true })).click()
  await expect(visible(page.getByRole('button', { name: 'Prescription', exact: true }))).toHaveAttribute('aria-pressed', 'true')
  // Ticked to send by default
  await expect(visible(page.getByRole('checkbox', { name: 'Prescription 1' }))).toBeChecked()

  const { supabase } = await testDb()
  await expect
    .poll(async () => (await supabase.from('visit_photos').select('caption').eq('visit_id', visitId)).data?.map((p) => p.caption))
    .toEqual(['Prescription'])
})

test('one tap on the price list adds a charge; Other charge asks what for and how much', async () => {
  await visible(page.getByRole('button', { name: 'Add charge' })).click()
  const sheet = page.getByRole('dialog', { name: 'Add charge' })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('Filter the price list').fill('moderate')
  await sheet.getByRole('button', { name: /Scaling .*Moderate case/ }).click()
  await expect(sheet).toHaveCount(0)
  await expect(visible(page.getByText(scaling, { exact: true }))).toBeVisible()

  // Back closes the list without leaving the visit
  await visible(page.getByRole('button', { name: 'Add charge' })).click()
  await expect(sheet).toBeVisible()
  await page.goBack()
  await expect(sheet).toHaveCount(0)
  await expect(page).toHaveURL(visitUrl)

  await visible(page.getByRole('button', { name: 'Add charge' })).click()
  await sheet.getByRole('button', { name: 'Other charge' }).click()
  await sheet.getByLabel('What for').fill(otherCharge)
  await sheet.getByLabel('Amount (₹)').fill('600')
  await sheet.getByRole('button', { name: 'Add to bill' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(visible(page.getByText(otherCharge, { exact: true }))).toBeVisible()
  await expect(visible(page.getByText('₹1,200')).first()).toBeVisible()
})

test('cash part payment leaves ₹200 due; UPI opens a full-screen QR that Back closes', async () => {
  const amount = visible(page.locator('#payment-amount'))
  await expect(amount).toHaveValue('1200')
  await amount.fill('1000')
  await visible(page.getByRole('button', { name: 'Cash received' })).click()
  await expect(visible(page.getByText('Paid by cash'))).toBeVisible()
  await expect(visible(page.locator('#payment'))).toContainText('Still due₹200')
  await expect(visible(page.locator('#payment-amount'))).toHaveValue('200')

  await visible(page.getByRole('button', { name: 'UPI', exact: true })).click()
  const qr = page.getByRole('dialog', { name: 'UPI ₹200' })
  await expect(qr.getByRole('img', { name: 'UPI QR for ₹200' })).toBeVisible()
  await expect(qr.getByRole('button', { name: 'Payment received' })).toBeVisible()
  await page.goBack()
  await expect(qr).toHaveCount(0)
  await expect(page).toHaveURL(visitUrl)
})

async function bookedCount() {
  const { supabase } = await testDb()
  const patientId = await patientIdOf(patientName)
  return (await supabase.from('appointments').select('id').eq('patient_id', patientId).eq('status', 'booked')).data?.length
}

test('next visit is "None" and nothing is booked until the suggestion is tapped', async () => {
  await expect(visible(page.getByText('None', { exact: true }))).toBeVisible()
  await expect(visible(page.getByRole('button', { name: /^Book / }))).toBeVisible()
  expect(await bookedCount()).toBe(0)
})

test('Send tapped straight after booking the next visit: the message has the bill, the next visit and the prescription link', async () => {
  const whatsapp = await captureWhatsapp(page)
  // No waiting between the two taps: Send waits for the booking itself
  await visible(page.getByRole('button', { name: /^Book / })).click()
  await visible(page.getByRole('link', { name: 'Send on WhatsApp' })).click()
  // The 30-day photo link is made at the tap. Within 2 seconds WhatsApp opens by itself; slower than
  // that (a cold test server), a big "Open WhatsApp" button appears for a second tap.
  const openButton = visible(page.getByRole('link', { name: 'Open WhatsApp' }))
  await Promise.race([
    page.waitForURL(/wa\.me\//, { timeout: 30_000 }),
    openButton.waitFor({ timeout: 30_000 }).then(() => openButton.click()),
  ])
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  expect(whatsapp.url).toContain(`wa.me/91${phone}`)
  const text = whatsappText(whatsapp.url)
  expect(text).toContain(`Hello ${runId},`)
  expect(text).toContain(`${scaling}: ₹600`)
  expect(text).toContain(`${otherCharge}: ₹600`)
  expect(text).toContain('Total: ₹1,200')
  expect(text).toContain('Paid: ₹1,000 (cash)')
  expect(text).toContain('Balance: ₹200')
  expect(text).toContain('*Next appointment*')
  const link = text.match(/Prescription: (https:\/\/\S+\/storage\/v1\/object\/sign\/visit-photos\/\S+)/)?.[1]
  expect(link).toBeTruthy()
  const token = new URL(link!).searchParams.get('token')!
  const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  const days = (exp * 1000 - Date.now()) / 86_400_000
  expect(days).toBeGreaterThan(29)
  expect(days).toBeLessThan(31)
  expect(await bookedCount()).toBe(1)

  // Coming back, the visit says the message went, and shows the booking
  await page.goto(visitUrl)
  await expect(visible(page.getByText('WhatsApp sent', { exact: true }))).toBeVisible()
  await expect(visible(page.getByText(/Booked: /))).toBeVisible()
})

test('a next visit booked from the visit can be changed; it moves, never doubles', async () => {
  const booked = visible(page.getByText(/Booked: /))
  const before = await booked.textContent()
  await visible(page.getByRole('button', { name: 'Change' })).click()
  const picker = page.getByRole('dialog', { name: 'Next visit' })
  await expect(picker).toBeVisible()

  // Back closes it without leaving the visit
  await page.goBack()
  await expect(picker).toHaveCount(0)
  await expect(page).toHaveURL(visitUrl)

  await visible(page.getByRole('button', { name: 'Change' })).click()
  await picker.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)/ }).first().click()
  await expect(picker).toHaveCount(0)
  await expect(booked).not.toHaveText(before!)
  expect(await bookedCount()).toBe(1)
})

test('Today lists the visit with its money; Collect lands on the payment card and settles it', async () => {
  await page.goto('/app')
  const visit = visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: '1 photo' }))
  await expect(visit).toHaveCount(1)
  await expect(visit).toContainText('₹200 due')
  await expect(visit).toContainText('WhatsApp sent')

  await visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: 'Collect' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[^/?]+\?step=bill$/)
  await expect(visible(page.locator('#payment'))).toBeInViewport()
  await expect(visible(page.locator('#payment-amount'))).toHaveValue('200')
  await visible(page.getByRole('button', { name: 'Cash received' })).click()
  await expect(visible(page.getByText('Paid in full'))).toBeVisible()
})

test('Start visit twice from the patient page opens one visit; an empty visit is listed nowhere', async () => {
  const name = `${runId} Returning`
  const patientId = await createPatient(name, newPhone('7'))
  await page.goto(`/app/patients/${patientId}`)
  await visible(page.getByRole('button', { name: 'Start visit' })).dblclick()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  await expect(visible(page.getByRole('heading', { name }))).toBeVisible()

  const { supabase } = await testDb()
  expect((await supabase.from('visits').select('id').eq('patient_id', patientId)).data).toHaveLength(1)

  // Back returns to the patient page; the visit has nothing in it, so it isn't listed
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/app/patients/${patientId}$`))
  await expect(visible(page.getByRole('heading', { name: 'Visits (0)' }))).toBeVisible()
  await page.goto('/app')
  await expect(visible(page.getByRole('heading', { name: /^Today/ }))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: name }))).toHaveCount(0)
})
