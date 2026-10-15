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

  // Nothing was added or booked by itself
  const { supabase } = await testDb()
  const charges = async () => (await supabase.from('visit_charges').select('description').eq('visit_id', visitId)).data!.map((c) => c.description)
  expect(await charges()).not.toContain('Root Canal Treatment – Standard Treatment (46)')

  await card.getByRole('button', { name: 'Add charge' }).click()
  await expect.poll(charges).toContain('Root Canal Treatment – Standard Treatment (46)')

  await card.getByRole('button', { name: 'Book next visit' }).click()
  await expect.poll(async () => (await supabase.from('appointments').select('duration_min').eq('from_visit_id', visitId).eq('status', 'booked')).data?.[0]?.duration_min).toBe(60)
})
