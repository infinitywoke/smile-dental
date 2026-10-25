import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { captureWhatsapp, cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible, whatsappText } from './helpers'

// The typed prescription: medicines go into the notes' "Prescription:" lines; Send puts it in the
// message's short link, whose page draws it on the letterhead; Download keeps a copy, to print
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

test('quick and typed medicines go into the notes; Send puts the prescription in the link, drawn on the letterhead', async ({ browser }) => {
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

  await expect(card.getByText('It goes with the WhatsApp message, in its link.')).toBeVisible()
  await expect(card.getByRole('button', { name: /^Send/ })).toHaveCount(0)

  // One tap: the message carries the link, and nothing else is sent
  const whatsapp = await captureWhatsapp(page)
  await visible(page.getByRole('link', { name: 'Send on WhatsApp' })).click()
  const openButton = visible(page.getByRole('link', { name: 'Open WhatsApp' }))
  await Promise.race([page.waitForURL(/wa\.me\//, { timeout: 30_000 }), openButton.waitFor({ timeout: 30_000 }).then(() => openButton.click())])
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  const text = whatsappText(whatsapp.url)
  const link = text.match(/Your prescription(?: and bill)? (?:is|are) here _\(the link works for 30 days\)_:\n(https?:\/\/\S+\/r\/[A-Za-z0-9_-]{32})\n/)?.[1]
  expect(link).toBeTruthy()
  expect(text).not.toContain('Vitamin C')

  // Opened on another phone, not signed in: the prescription on the letterhead, with Save
  const elsewhere = await browser.newContext()
  const stranger = await elsewhere.newPage()
  await stranger.goto(new URL(link!).pathname)
  await expect(stranger.getByRole('heading', { name: /^Your prescription/ })).toBeVisible()
  const sheet = stranger.getByRole('img', { name: 'Prescription' })
  await expect.poll(() => sheet.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1080), { timeout: 20_000 }).toBe(true)
  await expect(stranger.getByRole('link', { name: 'Save' })).toHaveAttribute('download', /^Prescription-\d{1,2}-[A-Za-z]{3}-\d{4}\.jpg$/)
  await elsewhere.close()
})

test('the prescription can still be downloaded, to print', async () => {
  await page.goto(`/app/visits/${visitId}`)
  const download = page.waitForEvent('download')
  await visible(page.getByRole('link', { name: 'Download prescription' })).click()
  expect((await download).suggestedFilename()).toMatch(/^Prescription-.*\.jpg$/)
  if (process.env.E2E_SHOTS) await (await download).saveAs(`${process.env.E2E_SHOTS}/prescription-sheet.jpg`)
})
