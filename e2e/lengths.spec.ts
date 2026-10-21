import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { captureWhatsapp, cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'
import { blockInstant } from '../src/lib/schedule'

// Appointment lengths: Dr. Rahil chooses 20, 40, 60, 80 or 120 minutes; Move keeps the length; a start
// between the usual blocks appears only where it fills a gap.
const runId = newRunId()
const time = /^\d{1,2}:\d{2} (AM|PM)/

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let patientId = ''
let longId = ''

const durationOf = async (id: string) => {
  const { supabase } = await testDb()
  return (await supabase.from('appointments').select('duration_min, starts_at').eq('id', id).single()).data!
}

test.beforeAll(async ({ browser }) => {
  patientId = await createPatient(`${runId} Length`, newPhone('3'))
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test('booking for 1 h 20 min from the length chips books 80 minutes', async () => {
  await page.goto(`/app/book?patient=${patientId}`)
  await visible(page.getByRole('link', { name: '1 h 20 min' })).click()
  await expect(page).toHaveURL(/len=80/)
  await visible(page.getByRole('link', { name: time })).first().click()
  await expect(visible(page.getByRole('heading', { name: /\(1 h 20 min\)$/ }))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Book appointment' })).click()
  await expect(visible(page.getByRole('heading', { name: 'Booked' }))).toBeVisible()

  const { supabase } = await testDb()
  const { data } = await supabase.from('appointments').select('id, duration_min').eq('patient_id', patientId).eq('status', 'booked').single()
  expect(data!.duration_min).toBe(80)
  longId = data!.id
})

test('Move keeps the appointment its own length', async () => {
  const before = await durationOf(longId)
  // A free time on a day ahead, where the Move page offers only times that fit 80 minutes, whatever the
  // time now. (Late in the day the last time left today can be the appointment's own, where 80 minutes
  // run past closing.) Not openDay(4): the last test needs that morning free.
  const day = openDay(6)
  await page.goto(`/app/appointments/${longId}/move?d=${day}`)
  await expect(visible(page.getByText('1 h 20 min appointment'))).toBeVisible()
  // Free times are named by the time alone; a booked one also carries the patient's name
  const free = visible(page.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)$/, disabled: false })).first()
  const [, h, m, ampm] = (await free.textContent())!.trim().match(/^(\d{1,2}):(\d{2}) (AM|PM)$/)!
  const chosen = `${String((Number(h) % 12) + (ampm === 'PM' ? 12 : 0)).padStart(2, '0')}:${m}`
  await free.click()
  // The moved message opens WhatsApp: wait for it, so it can't land in the next test
  const wa = await captureWhatsapp(page)
  await visible(page.getByRole('button', { name: 'Move appointment' })).click()
  await expect.poll(() => wa.url).toContain('wa.me')
  await expect.poll(async () => (await durationOf(longId)).starts_at).not.toBe(before.starts_at)
  const after = await durationOf(longId)
  expect(new Date(after.starts_at).getTime()).toBe(new Date(blockInstant(day, chosen)).getTime())
  expect(after.duration_min).toBe(80)
})

test('a 20-minute next visit can be booked from the visit', async () => {
  // A patient with nothing booked yet, so the visit offers the choice
  const fresh = await createPatient(`${runId} Follow`, newPhone('3'))
  const visitId = await createVisit(fresh, openDay(0), 300)
  await page.goto(`/app/visits/${visitId}`)
  await visible(page.getByRole('button', { name: '20 min', exact: true })).click()
  await visible(page.getByRole('button', { name: 'Pick another time' })).click()
  const picker = page.getByRole('dialog', { name: 'Next visit' })
  // Late in the day nothing may be left today: look at the next days
  for (let i = 0; i < 4 && (await picker.getByRole('button', { name: time }).count()) === 0; i++) {
    await picker.getByRole('button', { name: 'Next day' }).click()
    await picker.getByText('Checking availability…').waitFor({ state: 'detached' }).catch(() => {})
  }
  await picker.getByRole('button', { name: time }).first().click()
  await expect(picker).toHaveCount(0)
  const { supabase } = await testDb()
  await expect.poll(async () => (await supabase.from('appointments').select('duration_min').eq('from_visit_id', visitId).eq('status', 'booked')).data?.[0]?.duration_min).toBe(20)
})

test('after a 20-minute appointment, 8:50 AM is offered; it is hidden while 8:30 is free', async () => {
  const day = openDay(4)
  // A clean morning on a future open day for this check
  await page.goto(`/app/book?d=${day}&len=40`)
  await expect(visible(page.getByRole('link', { name: /^8:30 AM/ }))).toBeVisible()
  await expect(page.getByRole('link', { name: /^8:50 AM/ })).toHaveCount(0)

  const { supabase } = await testDb()
  const other = await createPatient(`${runId} Short`, newPhone('3'))
  const { error } = await supabase.from('appointments').insert({ patient_id: other, starts_at: blockInstant(day, '08:30'), duration_min: 20, status: 'booked' })
  expect(error).toBeNull()

  await page.goto(`/app/book?d=${day}&len=40`)
  await expect(visible(page.getByRole('link', { name: /^8:50 AM/ }))).toBeVisible()
})
