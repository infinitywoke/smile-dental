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

  // Practice mode (header menu): new patients from this run are marked TEST
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Practice mode/ }).click()
  await expect(page.getByText('Practice mode: new patients are marked TEST')).toBeVisible()
})

test('adds a new patient and starts a visit', async () => {
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('link', { name: /New patient/ }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)

  await visible(page.getByLabel('Name', { exact: true })).fill(patientName)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await visible(page.getByLabel('Date of birth')).fill('1990-05-15')
  await visible(page.getByLabel('Medical alerts')).fill('Penicillin allergy')
  await page.getByRole('button', { name: 'Save and start visit' }).click()

  await expect(page).toHaveURL(/\/app\/patients\/[^/]+\/visits\/new$/)
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

  const whatsapp = { url: '' }
  await page.route('https://wa.me/**', (route) => {
    whatsapp.url = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>WhatsApp</body></html>' })
  })
  await visible(page.getByRole('button', { name: 'Send on WhatsApp' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  // One message to the patient: bill, balance, next visit and a 30-day photo link
  expect(whatsapp.url).toContain(`wa.me/91${phone}`)
  const text = new URL(whatsapp.url).searchParams.get('text') ?? ''
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
  const visit = visible(page.getByRole('link').filter({ hasText: patientName }))
  await expect(visit).toHaveCount(1)
  await expect(visit).toContainText(runId)
  await expect(visit).toContainText('1 photo')
  await expect(visit).toContainText('Done')
  await expect(visit).toContainText('₹1,200 billed')
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
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('link', { name: /New patient/ }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)

  await expect(visible(page.getByText('Already a patient with this number'))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toBeVisible()
})

test('the public booking page offers real times, no SOS, and goes straight on after a time is tapped', async () => {
  await page.goto('/book')
  await expect(page.getByRole('heading', { name: 'When suits you?' })).toBeVisible()
  await expect(page.getByText(/SOS|Emergency/i)).toHaveCount(0)
  await expect(page.getByText(/after 7 PM/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0)

  // Tapping a time moves on by itself, with the first field ready
  await page.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)$/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  await expect(page.getByLabel('WhatsApp number')).toBeFocused()

  await page.getByLabel('WhatsApp number').fill('9845021763')
  await page.getByLabel('Full name').fill(`${runId} Public`)
  await page.getByLabel('Date of birth').fill('1990-05-15')
  await page.getByLabel('Address').fill('Pangala, Udupi')
  await page.getByRole('button', { name: 'Tooth pain' }).click()
  await page.getByRole('button', { name: 'Review' }).click()

  // The review puts the Send button in focus; nothing is sent in the test
  await expect(page.getByRole('heading', { name: 'Looks good?' })).toBeVisible()
  await expect(page.getByText(/in under 15 minutes|after 6 AM/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm and send on WhatsApp' })).toBeFocused()

  // Editing a row jumps to that field
  await page.getByRole('button', { name: 'Edit' }).nth(3).click()
  await expect(page.getByLabel('Address')).toBeFocused()
})

// A request as the test account (the public form files requests under the clinic's own account)
async function makeRequest(label: string, hhmm: string, offset: number) {
  let day = addDays(inIndia(new Date()).date, 2 + offset + (Date.now() % 10))
  while (isClosedDay(day)) day = addDays(day, 1)
  const supabase = createClient(appEnv.NEXT_PUBLIC_SUPABASE_URL!, appEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  })
  const signedIn = await supabase.auth.signInWithPassword({ email: testLogin!.email, password: testLogin!.password })
  expect(signedIn.error).toBeNull()
  const requestPhone = `8${String(Date.now()).slice(-9)}`
  const requestName = `${runId} ${label}`
  const inserted = await supabase.from('booking_requests').insert({
    name: requestName, phone: requestPhone, date_of_birth: '1985-03-02', address: 'Katapadi',
    medical_alerts: 'Diabetes', heard_from: 'Google', reason: 'Tooth pain', requested_start: blockInstant(day, hhmm),
    preferred_date: day, preferred_time: hhmm, status: 'new', is_test: true,
  }).select('id').single()
  expect(inserted.error).toBeNull()
  return { id: inserted.data!.id, day, requestName, requestPhone }
}

// Stops WhatsApp opening for real: the test just reads the link the app would open
async function captureWhatsapp() {
  const captured = { url: '' }
  await page.route('https://wa.me/**', (route) => {
    captured.url = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>WhatsApp</body></html>' })
  })
  return captured
}

test('Today: one tap confirms a website request and prepares the patient message', async () => {
  const { day, requestName, requestPhone } = await makeRequest('Quick', '15:10', 0)
  const whatsapp = await captureWhatsapp()

  await page.goto('/app')
  const card = visible(page.locator('div').filter({ hasText: requestName }).filter({ has: page.getByRole('button', { name: 'Confirm' }) })).last()
  await expect(card).toBeVisible()
  await expect(card).toContainText('Diabetes')
  await card.getByRole('button', { name: 'Confirm' }).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  expect(whatsapp.url).toContain(`wa.me/91${requestPhone}`)
  const text = new URL(whatsapp.url).searchParams.get('text') ?? ''
  expect(text).toContain('confirmed')
  expect(text).toContain(formatBlock('15:10'))

  // It is now an appointment on that day's sheet
  await page.goto(`/app?d=${day}`)
  await expect(visible(page.getByRole('link').filter({ hasText: requestName }))).toHaveCount(1)
})

test('request screen: tap another time, save, WhatsApp confirmation for the patient', async () => {
  const { id, day, requestName, requestPhone } = await makeRequest('Booker', '10:30', 1)
  const whatsapp = await captureWhatsapp()

  // On Today the card offers Other time, which opens the request with the day's times
  await page.goto('/app')
  const card = visible(page.locator('div').filter({ hasText: requestName }).filter({ has: page.getByRole('link', { name: 'Other time' }) })).last()
  await card.getByRole('link', { name: 'Other time' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/requests/${id}`))
  await expect(visible(page.getByText('Diabetes').first())).toBeVisible()
  await expect(visible(page.getByText(`Asked for ${formatDay(day)}, ${formatBlock('10:30')}`))).toBeVisible()
  await page.goto(`/app/requests/${id}?d=${day}`)

  // Move the name from 10:30 to 11:10 (tap), then save
  await visible(page.getByRole('button', { name: /^11:10 AM/ })).click()
  await expect(visible(page.getByText(/Placed at/))).toContainText('11:10 AM')
  await visible(page.getByRole('button', { name: 'Save and confirm' })).click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })

  expect(whatsapp.url).toContain(`wa.me/91${requestPhone}`)
  const text = new URL(whatsapp.url).searchParams.get('text') ?? ''
  expect(text).toContain('confirmed')
  expect(text).toContain(formatBlock('11:10'))

  // On the day's sheet as an appointment; gone from Needs you
  await page.goto(`/app?d=${day}`)
  await expect(visible(page.getByRole('link').filter({ hasText: requestName }))).toHaveCount(1)
  await page.goto('/app')
  await expect(visible(page.getByText(requestName))).toHaveCount(0)
})

test('deletes test data in one go from the menu', async () => {
  await page.getByRole('link', { name: 'Patients', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients/)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Delete test data' }).click()
  await expect(page.getByRole('status')).toContainText('Deleted')

  await visible(page.getByPlaceholder('Search name or phone')).fill(phone)
  await visible(page.getByRole('button', { name: 'Search' })).click()
  await expect(visible(page.getByText('No patients found.'))).toBeVisible()
})

test('switches practice mode off and signs out from the menu', async () => {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Practice mode/ }).click()
  await expect(page.getByText('Practice mode: new patients are marked TEST')).toHaveCount(0)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login/)
})
