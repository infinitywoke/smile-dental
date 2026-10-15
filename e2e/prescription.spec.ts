import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, stubShareSheet, testDb, visible } from './helpers'

// The typed prescription: medicines go into the notes' "Prescription:" lines, and the letterhead image
// is shared (Android) or downloaded (no file sharing)
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let visitId = ''

test.beforeAll(async ({ browser }) => {
  const patientId = await createPatient(`${runId} Rx`, newPhone('6'))
  visitId = await createVisit(patientId, openDay(0), 0)
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test('quick and typed medicines go into the notes; the prescription image is shared', async () => {
  const share = await stubShareSheet(page)
  await page.goto(`/app/visits/${visitId}`)
  await visible(page.getByRole('button', { name: 'Write prescription' })).click()
  const card = visible(page.getByRole('region', { name: 'Prescription' }))

  // A one-tap medicine, then a typed one
  const quick = card.getByRole('button').filter({ hasText: ' - ' }).first()
  const quickText = (await quick.innerText()).trim()
  await quick.click()
  await card.getByLabel('Type a medicine').fill('Vitamin C 500 mg - once a day - 10 days')
  await card.getByRole('button', { name: 'Add', exact: true }).click()

  const notes = visible(page.getByLabel('Notes', { exact: true }))
  await expect(notes).toHaveValue(`Prescription:\n- ${quickText}\n- Vitamin C 500 mg - once a day - 10 days`)
  const { supabase } = await testDb()
  await expect.poll(async () => (await supabase.from('visits').select('notes').eq('id', visitId).single()).data!.notes, { timeout: 15_000 })
    .toContain('- Vitamin C 500 mg - once a day - 10 days')

  // Remove one, undo
  await card.getByRole('button', { name: `Remove ${quickText}` }).click()
  await expect(notes).toHaveValue('Prescription:\n- Vitamin C 500 mg - once a day - 10 days')
  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect(notes).toHaveValue(/- Vitamin C 500 mg - once a day - 10 days\n- /)

  // Advice in the notes is printed too; then preview and share
  await notes.fill(`${await notes.inputValue()}\nAdvice: Soft food for a day`)
  await card.getByRole('button', { name: 'Done adding' }).click()
  await card.getByRole('button', { name: 'Preview' }).click()
  const preview = card.getByRole('img', { name: 'Prescription preview' })
  await expect(preview).toBeVisible()
  if (process.env.E2E_SHOTS) await preview.screenshot({ path: `${process.env.E2E_SHOTS}/prescription.png` })

  await card.getByRole('button', { name: 'Send prescription' }).click()
  await expect.poll(async () => (await share.shared()).length).toBe(1)
  const [sent] = await share.shared()
  expect(sent.files).toHaveLength(1)
  expect(sent.files[0].type).toBe('image/jpeg')
  expect(sent.files[0].name).toMatch(/^Prescription-\d{1,2}-[A-Za-z]{3}-\d{4}\.jpg$/)
  expect(sent.files[0].size).toBeGreaterThan(20_000)
})

test('without file sharing, the prescription downloads', async () => {
  const share = await stubShareSheet(page)
  await share.turnOff()
  await page.goto(`/app/visits/${visitId}`)
  const download = page.waitForEvent('download')
  await visible(page.getByRole('link', { name: 'Download prescription' })).click()
  expect((await download).suggestedFilename()).toMatch(/^Prescription-.*\.jpg$/)
})
