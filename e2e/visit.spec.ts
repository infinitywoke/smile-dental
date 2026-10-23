import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { formatDate } from '../src/lib/dates'
import { addDays, formatBlock, inIndia } from '../src/lib/schedule'
import {
  blocksLeftToday, captureWhatsapp, cleanRun, createAppointmentAtFirstFree, createPatient, createVisit, newPhone, newRunId, photoFolderFiles,
  signIn, stubShareSheet, testDb, visible, whatsappText,
} from './helpers'

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
  await visible(page.getByRole('link', { name: 'Walk-in' })).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)

  await visible(page.getByLabel('Name', { exact: true })).fill(patientName)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await visible(page.getByRole('radio', { name: 'Male', exact: true })).click()
  await visible(page.getByLabel('Medical alerts')).fill('Penicillin allergy')
  await visible(page.getByRole('checkbox', { name: /agree to the clinic keeping/ })).check()
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

test('a photo uploads by itself; Other asks what it is; Prescription is one tap', async () => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), visible(page.getByRole('button', { name: 'Gallery' })).click()])
  await chooser.setFiles(fixturePhoto)
  await expect(visible(page.getByRole('img', { name: /^Photo 1/ }))).toBeVisible({ timeout: 30_000 })
  await expect(visible(page.getByText('Uploading…'))).toHaveCount(0)

  const { supabase } = await testDb()
  const captions = async () => (await supabase.from('visit_photos').select('caption').eq('visit_id', visitId)).data?.map((p) => p.caption)

  // Other asks what it is, and goes by that name
  await visible(page.getByRole('button', { name: 'Other', exact: true })).click()
  await visible(page.getByLabel('Photo 1: what is it?')).fill('Lab slip')
  await visible(page.getByRole('button', { name: 'Save', exact: true })).click()
  await expect.poll(captions).toEqual(['Other: Lab slip'])
  await expect(visible(page.getByRole('checkbox', { name: 'Lab slip 1: send on WhatsApp' }))).not.toBeChecked()

  await visible(page.getByRole('button', { name: 'Prescription', exact: true })).click()
  await expect(visible(page.getByRole('button', { name: 'Prescription', exact: true }))).toHaveAttribute('aria-pressed', 'true')
  // Ticked to send by default
  await expect(visible(page.getByRole('checkbox', { name: 'Prescription 1' }))).toBeChecked()
  await expect.poll(captions).toEqual(['Prescription'])
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
  await visible(page.locator('#payment').getByRole('button', { name: 'Cash received' })).click()
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

  // Part paid, the rest perhaps another day: the bar above the bottom bar moves on to sending
  await page.evaluate(() => window.scrollTo(0, 0))
  const bar = page.getByRole('region', { name: 'Next step' })
  await expect(bar.getByRole('button', { name: 'Send on WhatsApp' })).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Cash received' })).toHaveCount(0)
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

// Tap Send on WhatsApp and wait for WhatsApp to open. Within 2 seconds it opens by itself; slower than
// that (a cold test server), a big "Open WhatsApp" button appears for a second tap.
async function sendOnWhatsapp() {
  await visible(page.getByRole('link', { name: 'Send on WhatsApp' })).click()
  const openButton = visible(page.getByRole('link', { name: 'Open WhatsApp' }))
  await Promise.race([
    page.waitForURL(/wa\.me\//, { timeout: 30_000 }),
    openButton.waitFor({ timeout: 30_000 }).then(() => openButton.click()),
  ])
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
}

let share: Awaited<ReturnType<typeof stubShareSheet>>

test('Send tapped straight after booking the next visit: a professional message with no photo link; then the prescription goes as a photo', async () => {
  // An Android phone: it can share files
  share = await stubShareSheet(page)
  await page.reload()
  const photoButton = visible(page.getByRole('button', { name: 'Send prescription photo' }))
  // Step 2 only appears once the message has gone
  await expect(visible(page.getByRole('link', { name: 'Send on WhatsApp' }))).toBeVisible()
  await expect(photoButton).toHaveCount(0)

  const whatsapp = await captureWhatsapp(page)
  // No waiting between the two taps: Send waits for the booking itself
  await visible(page.getByRole('button', { name: /^Book / })).click()
  await sendOnWhatsapp()

  expect(whatsapp.url).toContain(`wa.me/91${phone}`)
  const text = whatsappText(whatsapp.url)
  expect(text.startsWith(`*Smile Dental Clinic*\n_Dr. Rahil Yusuf, BDS_\n\nDear ${runId},\nThank you for visiting us on `)).toBe(true)
  expect(text).not.toContain(patientName)
  expect(text).not.toContain('Penicillin')
  expect(text).toContain(`*Treatment & charges*\n- ${scaling}: ₹600\n- ${otherCharge}: ₹600\n*Total: ₹1,200*`)
  expect(text).toContain('*Payment*\nPaid: ₹1,000 (Cash)\n*Balance due: ₹200*')
  expect(text).toMatch(/\*Next appointment\*\n📅 \*\w+day, \d{1,2} \w+\*\n🕗 \*\d{1,2}:\d{2} (AM|PM)\*\n📍 /)
  expect(text).toContain('Warm regards,\n*Dr. Rahil Yusuf*\nSmile Dental Clinic, Katapadi')
  // The photo goes as a file, so no link is made or sent
  expect(text).not.toContain('storage/v1/object')
  expect(text).not.toContain('Prescription:')
  expect(await bookedCount()).toBe(1)

  // Coming back, the visit says the message went, shows the booking, and offers the photo
  await page.goto(visitUrl)
  await expect(visible(page.getByText('WhatsApp sent', { exact: true }))).toBeVisible()
  await expect(visible(page.getByText(/Booked: /))).toBeVisible()
  await expect(photoButton).toBeEnabled({ timeout: 30_000 })
  await photoButton.click()
  await expect.poll(async () => (await share.shared()).length).toBe(1)
  const [sharedNow] = await share.shared()
  expect(sharedNow.files).toHaveLength(1)
  expect(sharedNow.files[0].type).toMatch(/^image\//)
  expect(sharedNow.files[0].size).toBeGreaterThan(0)
  expect(sharedNow.files[0].name).toMatch(/^Prescription-\d{1,2}-\w{3}-\d{4}\.(jpg|png|webp)$/)
  expect(sharedNow.text).toBe(`Prescription · Smile Dental Clinic · ${formatDate(inIndia(new Date()).date)}`)

  // It stays, so he can send it again
  await photoButton.click()
  await expect.poll(async () => (await share.shared()).length).toBe(2)
})

test('a browser that cannot share files gets a 30-day prescription link in the text instead; nothing doubles', async () => {
  await share.turnOff()
  await page.reload()
  await expect(visible(page.getByText('WhatsApp sent', { exact: true }))).toBeVisible()
  await expect(visible(page.getByRole('button', { name: 'Send prescription photo' }))).toHaveCount(0)

  const whatsapp = await captureWhatsapp(page)
  await sendOnWhatsapp()
  const text = whatsappText(whatsapp.url)
  expect(text).toContain('*Your photo* _(the link works for 30 days)_')
  const link = text.match(/- Prescription: (https:\/\/\S+\/storage\/v1\/object\/sign\/visit-photos\/\S+)/)?.[1]
  expect(link).toBeTruthy()
  const token = new URL(link!).searchParams.get('token')!
  const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  const days = (exp * 1000 - Date.now()) / 86_400_000
  expect(days).toBeGreaterThan(29)
  expect(days).toBeLessThan(31)
  // Sending again never books or bills twice
  expect(text).toContain('*Total: ₹1,200*')
  expect(await bookedCount()).toBe(1)
  await page.goto(visitUrl)
})

test('a next visit booked from the visit can be changed; it moves, never doubles, and after Send the patient is told', async () => {
  const booked = visible(page.getByText(/Booked: /))
  const before = await booked.textContent()
  await visible(page.getByRole('button', { name: 'Change' })).click()
  const picker = page.getByRole('dialog', { name: 'Next visit' })
  await expect(picker).toBeVisible()

  // Back closes it without leaving the visit
  await page.goBack()
  await expect(picker).toHaveCount(0)
  await expect(page).toHaveURL(visitUrl)

  // The visit's WhatsApp already went with the old time, so WhatsApp opens with the moved message
  const whatsapp = await captureWhatsapp(page)
  await visible(page.getByRole('button', { name: 'Change' })).click()
  await picker.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)/ }).first().click()
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  expect(whatsapp.url).toContain(`wa.me/91${phone}`)
  const text = whatsappText(whatsapp.url)
  expect(text).toContain(`Dear ${runId},`)
  expect(text).toContain('has been moved to:')
  expect(text).not.toContain(patientName)

  await page.goto(visitUrl)
  await expect(booked).not.toHaveText(before!)
  expect(await bookedCount()).toBe(1)
})

test('Today lists the visit with its money once (no Collect in Needs you); the rest is settled on the visit', async () => {
  await page.goto('/app')
  const visit = visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: '1 photo' }))
  await expect(visit).toHaveCount(1)
  await expect(visit).toContainText('₹200 due')
  await expect(visit).toContainText('WhatsApp sent')
  // Owed on today's visit: the row's badge says so, so Needs you doesn't repeat it
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: 'Collect' }))).toHaveCount(0)

  await visit.click()
  await expect(page).toHaveURL(visitUrl)
  await expect(visible(page.locator('#payment-amount'))).toHaveValue('200')
  await visible(page.locator('#payment').getByRole('button', { name: 'Cash received' })).click()
  await expect(visible(page.getByText('Paid in full'))).toBeVisible()
})

test('a payment changed after Send: "Bill changed – send again" until it is sent again', async () => {
  const changed = visible(page.getByText('The bill changed after the WhatsApp was sent.'))
  await expect(changed).toBeVisible()
  // The ₹200 never arrived: remove it
  page.once('dialog', (dialog) => void dialog.accept())
  await visible(page.getByRole('button', { name: 'Remove payment ₹200' })).click()
  await expect(visible(page.locator('#payment'))).toContainText('Still due₹200')
  await expect(changed).toBeVisible()
  await expect(visible(page.getByText('WhatsApp sent', { exact: true }))).toHaveCount(0)
  // Send is the main button again
  await expect(visible(page.getByRole('link', { name: 'Send on WhatsApp' }))).toHaveClass(/bg-blue-600/)

  await page.goto('/app')
  const row = visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: '1 photo' }))
  await expect(row).toContainText('₹200 due')
  await expect(row).toContainText('Bill changed – send again')
  await expect(row).not.toContainText('WhatsApp sent')

  await page.goto(visitUrl)
  const whatsapp = await captureWhatsapp(page)
  await sendOnWhatsapp()
  expect(whatsappText(whatsapp.url)).toContain('*Balance due: ₹200*')
  await page.goto('/app')
  await expect(row).toContainText('WhatsApp sent')
  await expect(row).not.toContainText('Bill changed')
})

test('Delete visit is refused while it holds a payment; once removed, it goes and leaves no "Advance"', async () => {
  const name = `${runId} Refund`
  const patientId = await createPatient(name, newPhone('6'))
  await page.goto(`/app/patients/${patientId}`)
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const id = page.url().split('/').pop()!

  await visible(page.getByRole('button', { name: 'Add charge' })).click()
  const sheet = page.getByRole('dialog', { name: 'Add charge' })
  await sheet.getByRole('button', { name: 'Other charge' }).click()
  await sheet.getByLabel('What for').fill('Consultation')
  await sheet.getByLabel('Amount (₹)').fill('200')
  await sheet.getByRole('button', { name: 'Add to bill' }).click()
  await expect(visible(page.locator('#payment-amount'))).toHaveValue('200')
  await visible(page.locator('#payment').getByRole('button', { name: 'Cash received' })).click()
  await expect(visible(page.getByText('Paid in full'))).toBeVisible()
  // The payment shows at once; the Undo offer means the server has it
  await expect(visible(page.getByText('₹200 cash recorded'))).toBeVisible()

  // Refused at once, naming the money; nothing is asked and nothing is deleted
  await visible(page.getByRole('button', { name: 'Delete visit' })).click()
  await expect(visible(page.getByRole('alert').filter({ hasText: 'This visit holds' }))).toHaveText(
    'This visit holds ₹200 in payments (cash ₹200). If they were a mistake, remove them in Payment first, then delete the visit.',
  )
  page.once('dialog', (dialog) => void dialog.accept())
  await visible(page.getByRole('button', { name: 'Remove payment ₹200' })).click()
  await expect(visible(page.getByText('Paid by cash'))).toHaveCount(0)

  // A payment recorded meanwhile in another tab: the server refuses too
  const { supabase } = await testDb()
  const { data: late } = await supabase.from('payments').insert({ visit_id: id, patient_id: patientId, amount: 100, method: 'upi' }).select('id').single()
  page.once('dialog', (dialog) => void dialog.accept())
  await visible(page.getByRole('button', { name: 'Delete visit' })).click()
  await expect(visible(page.getByRole('alert').filter({ hasText: 'This visit holds' }))).toContainText('₹100 in payments (UPI ₹100)')
  expect((await supabase.from('visits').select('id').eq('id', id)).data).toHaveLength(1)
  await supabase.from('payments').delete().eq('id', late!.id)

  await page.reload()
  let question = ''
  page.once('dialog', (dialog) => {
    question = dialog.message()
    void dialog.accept()
  })
  await visible(page.getByRole('button', { name: 'Delete visit' })).click()
  await expect(page).toHaveURL(new RegExp(`/app/patients/${patientId}$`), { timeout: 30_000 })
  expect(question).toBe('Delete this visit, with its notes, photos and bill?')
  await expect(visible(page.getByRole('heading', { name: 'Visits (0)' }))).toBeVisible()
  await expect(visible(page.getByText(/Advance/))).toHaveCount(0)
  await expect(visible(page.getByText(/^Collect/))).toHaveCount(0)
  expect((await supabase.from('payments').select('id').eq('patient_id', patientId)).data).toHaveLength(0)
})

test('an advance from an earlier visit: Today, the patient page, the card, the box and the message all say ₹4,499', async () => {
  const name = `${runId} Advance`
  const advancePhone = newPhone('5')
  const patientId = await createPatient(name, advancePhone)
  // Day 1: Consultation ₹200, paid ₹3,200
  await createVisit(patientId, addDays(inIndia(new Date()).date, -1), 200, 3200)
  await page.goto(`/app/patients/${patientId}`)
  await expect(visible(page.getByText('Advance with us: ₹3,000'))).toBeVisible()
  await expect(visible(page.getByText(/^Collect/))).toHaveCount(0)

  // Day 2 (today): a crown
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const url = page.url()
  await visible(page.getByRole('button', { name: 'Add charge' })).click()
  const sheet = page.getByRole('dialog', { name: 'Add charge' })
  await sheet.getByRole('button', { name: 'Other charge' }).click()
  await sheet.getByLabel('What for').fill('Crown')
  await sheet.getByLabel('Amount (₹)').fill('7499')
  await sheet.getByRole('button', { name: 'Add to bill' }).click()
  const card = visible(page.locator('#payment'))
  await expect(card).toContainText('Advance from other visits₹3,000')
  await expect(card).toContainText('Still due₹4,499')
  await expect(visible(page.locator('#payment-amount'))).toHaveValue('4499')

  const whatsapp = await captureWhatsapp(page)
  await sendOnWhatsapp()
  const text = whatsappText(whatsapp.url)
  expect(text).toContain('*Total: ₹7,499*\n\n*Payment*\nAdvance from other visits: ₹3,000\n*Balance due: ₹4,499*')

  await page.goto('/app')
  const row = visible(page.getByRole('link').filter({ hasText: name }))
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('₹4,499 due')
  await expect(visible(page.getByRole('link').filter({ hasText: name }).filter({ hasText: 'Collect' }))).toHaveCount(0)

  await page.goto(`/app/patients/${patientId}`)
  await expect(visible(page.getByRole('link', { name: 'Collect ₹4,499' }))).toBeVisible()
  await expect(visible(page.getByText(/Advance with us/))).toHaveCount(0)
  await page.goto(url)
})

test('Send leaves a later booking today booked; deleting the sent visit empties its photo folder and books its appointment again', async () => {
  const name = `${runId} Meena`
  const patientId = await createPatient(name, newPhone('4'))
  const today = inIndia(new Date()).date
  const first = await createAppointmentAtFirstFree(patientId, today, blocksLeftToday(10))
  const later = first && (await createAppointmentAtFirstFree(patientId, today, blocksLeftToday(10).filter((t) => t > first.time)))
  test.skip(!first || !later, 'Two clinic times are not left today')
  const { supabase } = await testDb()
  const statusOf = async (appointmentId: string) =>
    (await supabase.from('appointments').select('status').eq('id', appointmentId).single()).data!.status as string

  // Start from the earlier booking
  await page.goto('/app')
  const firstRow = visible(page.getByRole('list', { name: 'Schedule' }).getByRole('listitem').filter({ hasText: name }).filter({ hasText: formatBlock(first!.time) }))
  await firstRow.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const id = page.url().split('/').pop()!

  // A photo, and a stray file in the visit's folder (an upload that was never recorded)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), visible(page.getByRole('button', { name: 'Gallery' })).click()])
  await chooser.setFiles(fixturePhoto)
  await expect(visible(page.getByRole('img', { name: /^Photo 1/ }))).toBeVisible({ timeout: 30_000 })
  const { userId } = await testDb()
  const { error: strayError } = await supabase.storage
    .from('visit-photos')
    .upload(`${userId}/${id}/stray.png`, readFileSync(fixturePhoto), { contentType: 'image/png' })
  expect(strayError).toBeNull()
  expect(await photoFolderFiles(id)).toHaveLength(2)

  const whatsapp = await captureWhatsapp(page)
  await sendOnWhatsapp()
  expect(whatsappText(whatsapp.url)).toContain(`🕗 *${formatBlock(later!.time)}*`)
  // The booking she came for is done; the later one is still to come
  expect(await statusOf(first!.id)).toBe('done')
  expect(await statusOf(later!.id)).toBe('booked')

  await page.goto('/app')
  const laterRow = visible(page.getByRole('list', { name: 'Schedule' }).getByRole('listitem').filter({ hasText: name }).filter({ hasText: formatBlock(later!.time) }))
  await expect(laterRow.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: name }).filter({ hasText: 'WhatsApp sent' }))).toHaveCount(1)

  await page.goto(`/app/visits/${id}`)
  let question = ''
  page.once('dialog', (dialog) => {
    question = dialog.message()
    void dialog.accept()
  })
  await visible(page.getByRole('button', { name: 'Delete visit' })).click()
  await expect(page).toHaveURL(new RegExp(`/app/patients/${patientId}$`), { timeout: 30_000 })
  expect(question).toContain('Delete this visit, with its notes, photos and bill?')
  expect(question).toContain('This bill was sent on WhatsApp.')

  expect(await photoFolderFiles(id)).toEqual([])
  expect((await supabase.from('visit_photos').select('id').eq('visit_id', id)).data).toHaveLength(0)
  expect(await statusOf(first!.id)).toBe('booked')

  // Both bookings are back on Today
  await page.goto('/app')
  await expect(firstRow).toHaveCount(1)
  await expect(laterRow).toHaveCount(1)
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

test('a patient added before the form asked is asked at the visit, once; the access log lists the visit', async () => {
  const name = `${runId} Not Asked`
  const { supabase } = await testDb()
  const { data } = await supabase.from('patients').insert({ name, phone: newPhone('8'), gender: 'female' }).select('id').single()
  const patientId = data!.id as string
  await page.goto(`/app/patients/${patientId}`)
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const visitPage = page.url()

  const ask = visible(page.getByText(/^Ask once:/))
  await expect(ask).toBeVisible()
  await visible(page.getByRole('button', { name: 'They agree' })).click()
  await expect(ask).toHaveCount(0)
  await expect.poll(async () => (await supabase.from('patients').select('consent_at').eq('id', patientId).single()).data?.consent_at).toBeTruthy()
  await page.reload()
  await expect(visible(page.getByRole('heading', { name }))).toBeVisible()
  await expect(visible(page.getByText(/^Ask once:/))).toHaveCount(0)

  // Settings > Access log: the visit opened, with this device, and the sign-in
  await page.goto('/app/settings')
  await visible(page.getByRole('link', { name: 'Access log' })).click()
  await expect(page).toHaveURL(/\/app\/settings\/access$/)
  // Written once the screen had gone to the phone, so it can take a moment
  const opened = visible(page.locator(`a[href="${new URL(visitPage).pathname}"]`))
  await expect(async () => {
    await page.reload()
    await expect(opened).toHaveText(name, { timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(opened).toHaveCount(1)
  await expect(visible(page.getByRole('heading', { name: 'Sign-ins' }))).toBeVisible()
  await expect(visible(page.getByText(/Chrome/)).first()).toBeVisible()

  // Withdrawn on the patient's Edit: the tick comes off, and the next visit asks again
  await page.goto(`/app/patients/${patientId}/edit`)
  const agree = visible(page.getByRole('checkbox', { name: /agree to the clinic keeping/ }))
  await expect(agree).toBeChecked()
  await agree.uncheck()
  await visible(page.getByRole('button', { name: 'Save changes' })).click()
  await expect(page).toHaveURL(new RegExp(`/app/patients/${patientId}$`))
  expect((await supabase.from('patients').select('consent_at').eq('id', patientId).single()).data?.consent_at).toBeNull()
})
