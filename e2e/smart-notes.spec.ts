import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'

// Record notes: the visit's recording goes to Gemini (a pretend answer in tests: GEMINI_FAKE), the
// sorted notes are added to the notes box, and the charge and next visit are only suggestions.
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)
test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
})

let page: Page
let visitId = ''

test.beforeAll(async ({ browser }) => {
  const patientId = await createPatient(`${runId} Notes`, newPhone('2'))
  visitId = await createVisit(patientId, openDay(0), 0)
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test('record, stop: the notes are written out and sorted; the charge and next visit are only suggested', async () => {
  await page.goto(`/app/visits/${visitId}`)
  await visible(page.getByRole('button', { name: 'Record notes' })).click()
  await expect(visible(page.getByText(/Don't say the patient's name or number/))).toBeVisible()
  await page.waitForTimeout(2200)
  await visible(page.getByRole('button', { name: 'Stop' })).click()

  await expect(visible(page.getByLabel('Notes', { exact: true }))).toHaveValue(/Complaint: Pain lower right back tooth[\s\S]*Prescription:\n- Amoxicillin/, { timeout: 30_000 })
  const card = visible(page.getByRole('region', { name: 'Suggestions from your notes' }))
  await expect(card).toContainText('Root Canal Treatment – Standard Treatment (46)')
  await expect(card).toContainText('₹3,500')
  await expect(card).toContainText('X-Ray – Standard X-Ray (46)')

  // Nothing was added or booked by itself (the visit was made with a ₹0 check-up)
  const { supabase } = await testDb()
  const charges = async () => (await supabase.from('visit_charges').select('description').eq('visit_id', visitId)).data!.map((c) => c.description).sort()
  expect(await charges()).toEqual(['Check-up'])

  // The sure charges go on the bill in one tap, with one Undo for both
  await card.getByRole('button', { name: 'Add all 2 charges' }).click()
  await expect(visible(page.getByText('Added 2 charges from your notes'))).toBeVisible()
  await expect.poll(charges).toEqual(['Check-up', 'Root Canal Treatment – Standard Treatment (46)', 'X-Ray – Standard X-Ray (46)'])

  // What Gemini couldn't match or make out is said plainly
  await expect(card).toContainText('occlusal adjustment on 16')
  await expect(card).toContainText('Not on your price list')
  await expect(card).toContainText('the mouthwash name in the advice')

  // The clinic keeps the recording with the visit
  expect((await supabase.from('visit_recordings').select('id').eq('visit_id', visitId)).data).toHaveLength(1)

  await card.getByRole('button', { name: 'Book next visit' }).click()
  await expect.poll(async () => (await supabase.from('appointments').select('duration_min').eq('from_visit_id', visitId).eq('status', 'booked')).data?.[0]?.duration_min).toBe(60)
  await page.reload()
  await expect(visible(page.getByText(/Recordings \(1\)/))).toBeVisible()
})

test('Undo takes back only what a recording wrote into the notes', async () => {
  const notesBox = visible(page.getByLabel('Notes', { exact: true }))
  const before = await notesBox.inputValue()
  await visible(page.getByRole('button', { name: 'Record notes' })).click()
  await page.waitForTimeout(2200)
  await visible(page.getByRole('button', { name: 'Stop' })).click()
  await expect(notesBox).toHaveValue(/Complaint: Pain lower right back tooth[\s\S]*Complaint: Pain lower right back tooth/, { timeout: 30_000 })

  await visible(page.getByRole('status').filter({ hasText: 'Notes added from the recording' })).getByRole('button', { name: 'Undo' }).click()
  await expect(notesBox).toHaveValue(before)
  const { supabase } = await testDb()
  await expect.poll(async () => (await supabase.from('visits').select('notes').eq('id', visitId).single()).data?.notes, { timeout: 15_000 }).toBe(before)
})
