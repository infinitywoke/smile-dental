import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { inIndia } from '../src/lib/schedule'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, signIn, testDb, visible } from './helpers'

// Send to Tally: ledger names once, then Tally's import file (receipts), only new payments by default
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
const today = inIndia(new Date()).date

test.beforeAll(async ({ browser }) => {
  const { supabase, userId } = await testDb()
  await supabase.from('tally_settings').delete().eq('owner_id', userId)
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  const { supabase, userId } = await testDb()
  await cleanRun(runId)
  await supabase.from('tally_settings').delete().eq('owner_id', userId)
  await page.close()
})

const fileFrom = async (click: () => Promise<void>) => {
  const [download] = await Promise.all([page.waitForEvent('download'), click()])
  return readFileSync((await download.path())!, 'utf8')
}

test('Practice, then Send to Tally: ledger names first, then a file of the new payments', async () => {
  const patientId = await createPatient(`${runId} Tally & Co`, newPhone('7'))
  const visitId = await createVisit(patientId, today, 1200, 500)
  const { supabase } = await testDb()
  await supabase.from('payments').insert({ visit_id: visitId, patient_id: patientId, amount: 700, method: 'upi' })

  await page.goto('/app')
  await visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Practice/ })).click()
  await expect(visible(page.getByRole('region', { name: 'Money collected' }))).toContainText('UPI')
  await visible(page.getByRole('link', { name: 'Send to Tally' })).click()
  await expect(page).toHaveURL(/\/app\/tally$/)

  const form = visible(page.getByRole('form', { name: 'Tally ledger names' }))
  // His cash and bank ledger names come filled in
  await expect(form.getByLabel('Cash ledger')).toHaveValue('Cash')
  await expect(form.getByLabel('Bank ledger (where UPI payments arrive)')).toHaveValue('Bank of Baroda')
  // A Tally group is not a ledger: the screen says so instead of saving a name Tally would refuse
  await form.getByLabel('Income ledger (treatment fees)').fill('Direct Incomes')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(visible(page.getByRole('alert').filter({ hasText: 'is a group in Tally' }))).toContainText('"Direct Incomes" is a group in Tally, not a ledger')
  await form.getByLabel('Income ledger (treatment fees)').fill('Professional Fees')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(visible(page.getByText(/Ledgers: Cash · Bank of Baroda · Professional Fees/))).toBeVisible()

  const file = await fileFrom(() => visible(page.getByRole('button', { name: 'Download for Tally' })).click())
  expect(file).toContain(`<NARRATION>${runId} Tally &amp; Co - Cash - visit`)
  expect(file).toMatch(new RegExp(String.raw`${runId} Tally &amp; Co - UPI - visit [^<]+</NARRATION>\s*<ALLLEDGERENTRIES.LIST>\s*<LEDGERNAME>Bank of Baroda</LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\s*<AMOUNT>-700.00</AMOUNT>`))
  expect(file).toContain(`<DATE>${today.replace(/-/g, '')}</DATE>`)
  await expect(visible(page.getByRole('status'))).toContainText('Downloaded')
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/tally.png`, fullPage: true })

  // Now sent: the last file can be downloaded again, and it still has them
  await page.reload()
  const again = await fileFrom(() => visible(page.getByRole('button', { name: 'Download again' })).click())
  expect(again).toContain(`${runId} Tally &amp; Co - UPI`)
})

test('a whole month for the accountant, as one entry per day when chosen', async () => {
  await visible(page.getByRole('button', { name: 'Change' })).click()
  await visible(page.getByRole('radio', { name: /One per day/ })).check()
  await visible(page.getByRole('button', { name: 'Save' })).click()
  await expect(visible(page.getByText(/\(one per day\)/))).toBeVisible()
  const month = await fileFrom(() => visible(page.getByRole('button', { name: 'Download month' })).click())
  expect(month).toMatch(/Smile Dental Clinic - \d+ UPI payments? - /)
  expect(month).not.toContain(`${runId} Tally`)
})
