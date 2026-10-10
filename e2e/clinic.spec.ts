import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { addDays, blockInstant, formatBlock, formatDay, inIndia, isClosedDay } from '../src/lib/schedule'
import { appEnv, NO_TEST_LOGIN, testLogin } from './env'

// One patient's first visit, end to end, as the dedicated test account.
// Every run makes its own patient and phone number, so runs never collide.
const runId = `E2E-${Date.now()}`
const patientName = `${runId} Patient`
const phone = `9${String(Date.now()).slice(-9)}`
const notes = `${runId}: pain in lower right. Tooth 46 tender on percussion.`
const caption = `${runId} x-ray`
const fixturePhoto = path.join(__dirname, 'fixtures', 'tooth.png')

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

// Next keeps recently visited screens mounted but hidden, so the same text or
// field can exist twice on the page. Only ever match what's visible.
const visible = <T extends ReturnType<Page['locator']>>(locator: T) => locator.filter({ visible: true }) as T

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
})

test.afterAll(async () => {
  await page?.close()
})

test('signs in with the test login', async () => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(testLogin!.email)
  await page.getByLabel('Password').fill(testLogin!.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
})

test('adds a new patient and starts a visit', async () => {
  await page.getByRole('link', { name: 'New patient' }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)

  await visible(page.getByLabel('Name', { exact: true })).fill(patientName)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await visible(page.getByLabel('Date of birth')).fill('1990-05-15')
  await visible(page.getByLabel('Medical alerts')).fill('Penicillin allergy')
  await visible(page.getByLabel(/Test patient/)).check()
  await page.getByRole('button', { name: 'Save and start visit' }).click()

  await expect(page).toHaveURL(/\/app\/patients\/[^/]+\/visits\/new$/)
  await expect(page.getByRole('heading', { name: 'New visit' })).toBeVisible()
  await expect(visible(page.locator('p', { hasText: 'Medical alert:' }))).toContainText('Penicillin allergy')
})

test('saves a visit with notes and a captioned photo', async () => {
  await visible(page.getByLabel('Notes', { exact: true })).fill(notes)
  // Tap Gallery like a person would; this picks the visible screen's file input
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Gallery' }).click()])
  await chooser.setFiles(fixturePhoto)
  await visible(page.getByPlaceholder('What is this?')).fill(caption)
  await page.getByRole('button', { name: 'Save visit' }).click()

  // A failed upload keeps the editor open, so landing on the visit page means everything saved
  await expect(page).toHaveURL(/\/app\/visits\/[^/?]+$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: patientName })).toBeVisible()
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toHaveValue(notes)
  await expect(page.getByRole('img', { name: caption })).toHaveCount(1)
  await expect(visible(page.getByText(caption, { exact: true }))).toBeVisible()
})

test('lists the visit on Today', async () => {
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
  const visit = visible(page.getByRole('link').filter({ hasText: patientName }))
  await expect(visit).toHaveCount(1)
  await expect(visit).toContainText(runId)
  await expect(visit).toContainText('1 photo')
})

test('finds the patient by phone on the Patients tab', async () => {
  await page.getByRole('link', { name: 'Patients', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients$/)
  await visible(page.getByPlaceholder('Search name or phone')).fill(phone)
  await visible(page.getByRole('button', { name: 'Search' })).click()

  await expect(page).toHaveURL(new RegExp(`/app/patients\\?q=${phone}$`))
  await expect(visible(page.getByText(`1 result for “${phone}”`))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toHaveCount(1)
})

test('spots the returning patient when the same phone is typed', async () => {
  await page.getByRole('link', { name: 'New', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)

  await expect(visible(page.getByText('Already a patient with this number'))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toBeVisible()
})

test('the public booking page offers real times, no SOS, and a call note for evenings', async () => {
  await page.goto('/book')
  await expect(page.getByRole('heading', { name: 'Pick a time' })).toBeVisible()
  await expect(page.getByText(/SOS|Emergency/i)).toHaveCount(0)
  await expect(page.getByText(/after 7 PM/)).toBeVisible()

  // Choose the first free day and time, fill the details, reach the review (nothing is sent)
  await page.locator('button', { hasText: /^(Sun|Mon|Tue|Wed|Thu|Sat)/ }).first().click()
  await page.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)$/ }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('WhatsApp number').fill('9845021763')
  await page.getByLabel('Full name').fill(`${runId} Public`)
  await page.getByLabel('Date of birth').fill('1990-05-15')
  await page.getByLabel('Address').fill('Pangala, Udupi')
  await page.getByRole('button', { name: 'Tooth pain' }).click()
  await page.getByRole('button', { name: 'Review' }).click()

  await expect(page.getByRole('heading', { name: 'Check and send' })).toBeVisible()
  await expect(page.getByText(/in under 15 minutes|after 6 AM/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible()
})

test('confirms a website request: slide to a block, save, WhatsApp confirmation for the patient', async () => {
  // Make a request as the test account (the public form files requests under the clinic's own account)
  let day = addDays(inIndia(new Date()).date, 2 + (Date.now() % 12))
  while (isClosedDay(day)) day = addDays(day, 1)
  const requestedStart = blockInstant(day, '10:30')

  const supabase = createClient(appEnv.NEXT_PUBLIC_SUPABASE_URL!, appEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  })
  const signedIn = await supabase.auth.signInWithPassword({ email: testLogin!.email, password: testLogin!.password })
  expect(signedIn.error).toBeNull()
  const requestPhone = `8${String(Date.now()).slice(-9)}`
  const requestName = `${runId} Booker`
  const inserted = await supabase.from('booking_requests').insert({
    name: requestName, phone: requestPhone, date_of_birth: '1985-03-02', address: 'Katapadi',
    medical_alerts: 'Diabetes', heard_from: 'Google', reason: 'Tooth pain', requested_start: requestedStart,
    preferred_date: day, preferred_time: '10:30 AM', status: 'new', is_test: true,
  }).select('id').single()
  expect(inserted.error).toBeNull()

  // It shows on Today, with the patient's details on the request screen
  await page.goto('/app')
  const card = visible(page.getByRole('link').filter({ hasText: requestName }))
  await expect(card).toHaveCount(1)
  await card.click()
  await expect(page).toHaveURL(new RegExp(`/app/requests/${inserted.data!.id}`))
  await expect(visible(page.getByText('Diabetes').first())).toBeVisible()
  await expect(visible(page.getByText(`Asked for ${formatDay(day)}, ${formatBlock('10:30')}`))).toBeVisible()
  await page.goto(`/app/requests/${inserted.data!.id}?d=${day}`)

  // Move the name from 10:30 to 11:10 (tap), then save
  await visible(page.getByRole('button', { name: /^11:10 AM/ })).click()
  await expect(visible(page.getByText(/Placed at/))).toContainText('11:10 AM')

  let whatsappUrl = ''
  await page.route('https://wa.me/**', (route) => {
    whatsappUrl = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>WhatsApp</body></html>' })
  })
  await visible(page.getByRole('button', { name: 'Save and confirm' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  // The confirmation is addressed to the patient and names the new time
  expect(whatsappUrl).toContain(`wa.me/91${requestPhone}`)
  const text = new URL(whatsappUrl).searchParams.get('text') ?? ''
  expect(text).toContain('confirmed')
  expect(text).toContain(formatBlock('11:10'))

  // The appointment is on the calendar, the request is gone from Today
  await page.goto(`/app/calendar?d=${day}`)
  await expect(visible(page.getByRole('link').filter({ hasText: requestName }))).toHaveCount(1)
  await page.goto('/app')
  await expect(visible(page.getByRole('link').filter({ hasText: requestName }))).toHaveCount(0)
})

test('deletes test patients in one go', async () => {
  await page.getByRole('link', { name: 'Patients', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients/)
  page.once('dialog', (dialog) => dialog.accept())
  await visible(page.getByRole('button', { name: /Delete test patients/ })).click()
  await expect(visible(page.getByRole('button', { name: /Delete test patients/ }))).toHaveCount(0)

  await visible(page.getByPlaceholder('Search name or phone')).fill(phone)
  await visible(page.getByRole('button', { name: 'Search' })).click()
  await expect(visible(page.getByText('No patients found.'))).toBeVisible()
})

test('signs out', async () => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login$/)
})
