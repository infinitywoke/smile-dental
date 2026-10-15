import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { addDays, blockInstant, inIndia } from '../src/lib/schedule'
import {
  captureWhatsapp, cleanRun, createAppointmentAtFirstFree, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible, whatsappText,
} from './helpers'

// Today's self-emptying lists: "Didn't come" and its call-back list, tomorrow's reminders, check-ups due
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
const today = inIndia(new Date()).date
const yesterday = addDays(today, -1)

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test("didn't come: marked from the day, undone, then followed up on WhatsApp from Needs you", async () => {
  const name = `${runId} Missed`
  const patientId = await createPatient(name, newPhone('3'))
  const { supabase } = await testDb()
  // A booked appointment that is already over (made as cancelled, then booked: the database refuses
  // to book a time that has passed)
  const { data, error } = await supabase
    .from('appointments')
    .insert({ patient_id: patientId, starts_at: blockInstant(yesterday, '06:00'), duration_min: 40, status: 'cancelled' })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  await supabase.from('appointments').update({ status: 'booked' }).eq('id', id)
  const status = async () => (await supabase.from('appointments').select('status, followed_up_at').eq('id', id).single()).data!

  await page.goto(`/app?d=${yesterday}`)
  await visible(page.getByRole('button', { name: `Didn't come: ${name}` })).click()
  await expect.poll(async () => (await status()).status).toBe('no_show')
  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect(visible(page.getByText('Undone'))).toBeVisible()
  await expect.poll(async () => (await status()).status).toBe('booked')
  await visible(page.getByRole('button', { name: `Didn't come: ${name}` })).click()
  await expect.poll(async () => (await status()).status).toBe('no_show')

  await page.goto('/app')
  const link = visible(page.getByRole('link', { name: `WhatsApp ${name}` }))
  expect(whatsappText((await link.getAttribute('href'))!)).toContain('We missed you at your appointment')
  expect(whatsappText((await link.getAttribute('href'))!)).toContain(`Dear ${runId},`)
  const wa = await captureWhatsapp(page)
  await link.click()
  await expect.poll(() => wa.url).toContain('wa.me')
  await expect.poll(async () => (await status()).followed_up_at).not.toBeNull()
  await page.goto('/app')
  await expect(page.getByRole('link', { name: `WhatsApp ${name}` })).toHaveCount(0)
})

test("tomorrow's reminders: one tap each, and the card goes once all are sent", async () => {
  const name = `${runId} Remind`
  const phone = newPhone('4')
  const patientId = await createPatient(name, phone)
  const day = openDay(1)
  const booked = await createAppointmentAtFirstFree(patientId, day, ['19:00', '18:20', '17:40', '17:00', '16:20', '15:40'])
  test.skip(!booked, 'No free evening time on the next open day')
  const { supabase } = await testDb()

  await page.goto('/app')
  await visible(page.getByText(/Remind .+'s patients/)).click()
  const link = visible(page.getByRole('link', { name: `Remind ${name} on WhatsApp` }))
  const text = whatsappText((await link.getAttribute('href'))!)
  expect(text).toContain('A reminder of your appointment')
  expect(text).not.toContain(phone)
  const wa = await captureWhatsapp(page)
  await link.click()
  await expect.poll(() => wa.url).toContain('wa.me')
  await expect.poll(async () => (await supabase.from('appointments').select('reminded_at').eq('id', booked!.id).single()).data!.reminded_at).not.toBeNull()
  await page.goto('/app')
  await expect(page.getByRole('link', { name: `Remind ${name} on WhatsApp` })).toHaveCount(0)
})

test('check-ups due: a patient last seen 7 months ago, sent once, back after undo', async () => {
  const name = `${runId} Recall`
  const patientId = await createPatient(name, newPhone('5'))
  const [y, m, d] = today.split('-').map(Number)
  const longAgo = new Date(Date.UTC(y, m - 8, Math.min(d, 28))).toISOString().slice(0, 10)
  await createVisit(patientId, longAgo, 300, 300)
  const { supabase } = await testDb()
  const recalled = async () => (await supabase.from('patients').select('recalled_at').eq('id', patientId).single()).data!.recalled_at

  await page.goto('/app')
  await visible(page.getByText('Check-ups due')).click()
  const send = visible(page.getByRole('link', { name: `Check-up reminder for ${name}` }))
  expect(whatsappText((await send.getAttribute('href'))!)).toContain('six months since your last visit')
  // Skip, then undo: still due
  await visible(page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'Skip' })).click()
  await expect.poll(recalled).not.toBeNull()
  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect.poll(recalled).toBeNull()

  const wa = await captureWhatsapp(page)
  const again = page.getByRole('link', { name: `Check-up reminder for ${name}` })
  // The list may have folded while it refreshed
  if (!(await visible(again).isVisible())) await visible(page.getByText('Check-ups due')).click()
  await visible(again).click()
  await expect.poll(() => wa.url).toContain('wa.me')
  await expect.poll(recalled).not.toBeNull()
})
