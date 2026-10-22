import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { captureWhatsapp, cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'
import { blockInstant } from '../src/lib/schedule'

// Appointment lengths: Dr. Rahil chooses any length from the quick picks (30 min, 1 h, 1 h 30, 2 h) or
// with − / + in 5-minute steps, on every booking screen; Move keeps the length unless he changes it; the
// moment an appointment ends is offered as a free time where it fills a gap.
const runId = newRunId()
const time = /^\d{1,2}:\d{2} (AM|PM)/
const freeTime = /^\d{1,2}:\d{2} (AM|PM)$/

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let patientId = ''
let longId = ''

const durationOf = async (id: string) => {
  const { supabase } = await testDb()
  return (await supabase.from('appointments').select('duration_min, starts_at').eq('id', id).single()).data!
}
const length = () => visible(page.locator('output[aria-label="Length"]'))

test.beforeAll(async ({ browser }) => {
  patientId = await createPatient(`${runId} Length`, newPhone('3'))
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test('booking for 1 h 30 min from the quick picks books 90 minutes', async () => {
  await page.goto(`/app/book?patient=${patientId}`)
  await visible(page.getByRole('link', { name: '1 h 30 min' })).click()
  await expect(page).toHaveURL(/len=90/)
  await expect(length()).toHaveText('1 h 30')
  await visible(page.getByRole('link', { name: time })).first().click()
  await expect(visible(page.getByRole('heading', { name: /\(1 h 30 min\)$/ }))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Book appointment' })).click()
  await expect(visible(page.getByRole('heading', { name: 'Booked' }))).toBeVisible()

  const { supabase } = await testDb()
  const { data } = await supabase.from('appointments').select('id, duration_min').eq('patient_id', patientId).eq('status', 'booked').single()
  expect(data!.duration_min).toBe(90)
  longId = data!.id
})

test('Move keeps the appointment its own length, and can change it', async () => {
  const before = await durationOf(longId)
  // A day ahead, where the Move page offers only times that fit, whatever the time now.
  // Not openDay(4): the last test needs that morning free.
  const day = openDay(6)
  await page.goto(`/app/appointments/${longId}/move?d=${day}`)
  await expect(length()).toHaveText('1 h 30')
  // Free times are named by the time alone; a booked one also carries the patient's name
  const free = visible(page.getByRole('button', { name: freeTime, disabled: false })).first()
  const [, h, m, ampm] = (await free.textContent())!.trim().match(/^(\d{1,2}):(\d{2}) (AM|PM)$/)!
  const chosen = `${String((Number(h) % 12) + (ampm === 'PM' ? 12 : 0)).padStart(2, '0')}:${m}`
  await free.click()
  // The moved message opens WhatsApp: wait for it, so it can't land in the next step
  let wa = await captureWhatsapp(page)
  await visible(page.getByRole('button', { name: 'Move appointment' })).click()
  await expect.poll(() => wa.url).toContain('wa.me')
  await expect.poll(async () => (await durationOf(longId)).starts_at).not.toBe(before.starts_at)
  const after = await durationOf(longId)
  expect(new Date(after.starts_at).getTime()).toBe(new Date(blockInstant(day, chosen)).getTime())
  expect(after.duration_min).toBe(90)

  // 15 minutes shorter, at a time on another day
  await page.goto(`/app/appointments/${longId}/move?d=${openDay(7)}`)
  // Quick taps add up; the page follows the last one
  for (let i = 0; i < 3; i++) await visible(page.getByRole('button', { name: '5 minutes shorter' })).click()
  await expect(length()).toHaveText('1 h 15')
  await expect(page).toHaveURL(/len=75/)
  await visible(page.getByRole('button', { name: freeTime, disabled: false })).first().click()
  wa = await captureWhatsapp(page)
  await visible(page.getByRole('button', { name: 'Move appointment' })).click()
  await expect.poll(() => wa.url).toContain('wa.me')
  await expect.poll(async () => (await durationOf(longId)).duration_min).toBe(75)
})

test('a 45-minute next visit can be booked from the visit', async () => {
  // A patient with nothing booked yet, so the visit offers the choice
  const fresh = await createPatient(`${runId} Follow`, newPhone('3'))
  const visitId = await createVisit(fresh, openDay(0), 300)
  await page.goto(`/app/visits/${visitId}`)
  for (let i = 0; i < 3; i++) await visible(page.getByRole('button', { name: '5 minutes longer' })).click()
  await expect(length()).toHaveText('45 min')
  await visible(page.getByRole('button', { name: 'Pick another time' })).click()
  const picker = page.getByRole('dialog', { name: 'Next visit' })
  // The same length in the picker
  await expect(picker.locator('output[aria-label="Length"]')).toHaveText('45 min')
  // Late in the day nothing may be left today: look at the next days
  for (let i = 0; i < 4 && (await picker.getByRole('button', { name: time }).count()) === 0; i++) {
    await picker.getByRole('button', { name: 'Next day' }).click()
    await picker.getByText('Checking availability…').waitFor({ state: 'detached' }).catch(() => {})
  }
  await picker.getByRole('button', { name: time }).first().click()
  await expect(picker).toHaveCount(0)
  const { supabase } = await testDb()
  await expect.poll(async () => (await supabase.from('appointments').select('duration_min').eq('from_visit_id', visitId).eq('status', 'booked')).data?.[0]?.duration_min).toBe(45)
})

test('after a 45-minute appointment at 9:00, 9:45 AM is offered; not before', async () => {
  const day = openDay(4)
  // A clean morning on a future open day for this check
  await page.goto(`/app/book?d=${day}`)
  await expect(visible(page.getByRole('link', { name: /^9:00 AM/ }))).toBeVisible()
  await expect(page.getByRole('link', { name: /^9:45 AM/ })).toHaveCount(0)

  const { supabase } = await testDb()
  const other = await createPatient(`${runId} Short`, newPhone('3'))
  const { error } = await supabase.from('appointments').insert({ patient_id: other, starts_at: blockInstant(day, '09:00'), duration_min: 45, status: 'booked' })
  expect(error).toBeNull()

  await page.goto(`/app/book?d=${day}`)
  await expect(visible(page.getByRole('link', { name: /^9:45 AM/ }))).toBeVisible()
  await expect(visible(page.getByRole('link', { name: /^10:00 AM/ }))).toBeVisible()
})
