import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { inIndia } from '../src/lib/schedule'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, signIn, testDb, visible } from './helpers'

// Send to Tally: ledger names once, then Tally's import file (receipts to each patient's own ledger, and
// visits with nothing paid), only what is new by default; his List of Accounts matches patients to ledgers
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

// Tally's own export is UTF-16 with a byte-order mark
const listOfAccounts = (ledgers: string[]) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(
  `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>${ledgers.map((name) =>
    `<TALLYMESSAGE xmlns:UDF="TallyUDF">\r\n <LEDGER NAME="${name.replace(/&/g, '&amp;')}" RESERVEDNAME="">\r\n  <PARENT>Direct Incomes</PARENT>\r\n </LEDGER>\r\n</TALLYMESSAGE>`).join('\r\n')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`, 'utf16le')])

test("Practice, then Send to Tally: cash and bank ledgers first, then a file to each patient's own ledger", async () => {
  const patientId = await createPatient(`${runId} Tally & Co`, newPhone('7'))
  const visitId = await createVisit(patientId, today, 1200, 500)
  const { supabase } = await testDb()
  await supabase.from('payments').insert({ visit_id: visitId, patient_id: patientId, amount: 700, method: 'upi' })
  // A visit with nothing paid: he keeps those in Tally as receipts with no amount
  await createVisit(await createPatient(`${runId} Unpaid`, newPhone('6')), today, 300)

  await page.goto('/app')
  await visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Practice/ })).click()
  await expect(visible(page.getByRole('region', { name: 'Money collected' }))).toContainText('UPI')
  await visible(page.getByRole('link', { name: 'Send to Tally' })).click()
  await expect(page).toHaveURL(/\/app\/tally$/)

  // His ledgers are known from his Tally, so there is nothing to type first; Change shows them
  await expect(visible(page.getByText(/Ledgers: Cash · Savings A\/C \(each payment, to the patient's ledger\)/))).toBeVisible()
  await expect(visible(page.getByText(/with SMILE DENTAL0 open/))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Change' })).click()
  const form = visible(page.getByRole('form', { name: 'Tally ledger names' }))
  // Each payment goes to the patient's ledger, so no income ledger
  await expect(form.getByLabel('Cash ledger')).toHaveValue('Cash')
  await expect(form.getByLabel('Bank ledger (where UPI payments arrive)')).toHaveValue('Savings A/C')
  await expect(form.getByLabel('Income ledger (treatment fees)')).toHaveCount(0)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(visible(page.getByText(/Ledgers: Cash · Savings A\/C \(each payment, to the patient's ledger\)/))).toBeVisible()
  await expect(visible(page.getByRole('region', { name: 'New payments' }))).toContainText('with nothing paid')

  const file = await fileFrom(() => visible(page.getByRole('button', { name: 'Download for Tally' })).click())
  // Only into his company, as his own exports name it
  expect(file).toContain('<SVCURRENTCOMPANY>SMILE DENTAL0</SVCURRENTCOMPANY>')
  // A patient Tally doesn't have yet gets a ledger under Direct Incomes at the top of the file
  expect(file).toMatch(new RegExp(String.raw`<LEDGER NAME="${runId} Tally &amp; Co">\s*<NAME.LIST>\s*<NAME>${runId} Tally &amp; Co</NAME>\s*</NAME.LIST>\s*<PARENT>Direct Incomes</PARENT>`))
  // The narration names the treatment, as his Day Book notes do; the bank ledger is the party, as in Tally's own export
  expect(file).toContain(`<NARRATION>${runId} Tally &amp; Co - Check-up - Cash - visit`)
  expect(file).toMatch(new RegExp(String.raw`<PARTYLEDGERNAME>Savings A/C</PARTYLEDGERNAME>\s*<NARRATION>${runId} Tally &amp; Co - Check-up - UPI - visit [^<]+</NARRATION>\s*<ALLLEDGERENTRIES.LIST>\s*<LEDGERNAME>Savings A/C</LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\s*<AMOUNT>-700.00</AMOUNT>\s*</ALLLEDGERENTRIES.LIST>\s*<ALLLEDGERENTRIES.LIST>\s*<LEDGERNAME>${runId} Tally &amp; Co</LEDGERNAME>`))
  expect(file).toMatch(new RegExp(String.raw`<NARRATION>${runId} Unpaid - Check-up - nothing paid - visit [^<]+</NARRATION>\s*<ALLLEDGERENTRIES.LIST>\s*<LEDGERNAME>Cash</LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\s*</ALLLEDGERENTRIES.LIST>`))
  expect(file).toContain(`<DATE>${today.replace(/-/g, '')}</DATE>`)
  await expect(visible(page.getByRole('status').filter({ hasText: 'Downloaded' }))).toContainText('with nothing paid')
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/tally.png`, fullPage: true })
  // The name is kept, so every later file uses the same ledger
  const { data: saved } = await supabase.from('patients').select('tally_ledger, tally_ledger_listed').eq('id', patientId).single()
  expect(saved).toEqual({ tally_ledger: `${runId} Tally & Co`, tally_ledger_listed: false })

  // His List of Accounts now has it: matched, so later files no longer create it
  await page.reload()
  await visible(page.getByRole('region', { name: 'Patient ledgers' })).getByLabel('Match from your List of Accounts')
    .setInputFiles({ name: 'Master.xml', mimeType: 'text/xml', buffer: listOfAccounts([`${runId} Tally & Co`, 'Someone Else 50 Kaup']) })
  await expect(visible(page.getByRole('status').filter({ hasText: 'Read 2 patient ledgers' }))).toContainText('is now in Tally')
  await expect.poll(async () => (await supabase.from('patients').select('tally_ledger_listed').eq('id', patientId).single()).data?.tally_ledger_listed).toBe(true)

  // Now sent: the last file can be downloaded again, and it still has them
  await page.reload()
  const again = await fileFrom(() => visible(page.getByRole('button', { name: 'Download again' })).click())
  expect(again).toContain(`${runId} Tally &amp; Co - Check-up - UPI`)
  expect(again).not.toContain(`<LEDGER NAME="${runId} Tally`)

  // The whole month, to import into Tally: everything, with the visit's notes, as his Day Book has them
  await supabase.from('visits').update({ notes: 'Teeth:\n- 36 pain, IOPA taken' }).eq('id', visitId)
  const month = await fileFrom(() => visible(page.getByRole('button', { name: 'Download month' })).click())
  expect(month).toContain(`${runId} Tally &amp; Co - Check-up - Cash - visit`)
  expect(month).toMatch(new RegExp(String.raw`<NARRATION>${runId} Tally &amp; Co - Check-up - (Cash|UPI) - visit [^<]+ - Teeth:; 36 pain, IOPA taken</NARRATION>`))
  expect(month).toContain(`${runId} Unpaid - Check-up - nothing paid - visit`)
  // His list has the first patient's ledger now; the second is still made first
  expect(month).not.toContain(`<LEDGER NAME="${runId} Tally`)
  expect(month).toContain(`<LEDGER NAME="${runId} Unpaid">`)
})

test("Tally's List of Accounts is the only file it reads", async () => {
  await visible(page.getByRole('region', { name: 'Patient ledgers' })).getByLabel('Match from your List of Accounts')
    .setInputFiles({ name: 'notes.xml', mimeType: 'text/xml', buffer: Buffer.from('<notes>not Tally</notes>') })
  await expect(visible(page.getByRole('alert').filter({ hasText: "That isn't Tally's List of Accounts" }))).toContainText('Alt+E')
})

test('a whole month for the accountant, as one entry per day when chosen', async () => {
  await visible(page.getByRole('button', { name: 'Change' })).click()
  await visible(page.getByRole('radio', { name: /One per day/ })).check()
  // One per day needs the income ledger, and a Tally group is not a ledger: the screen says so
  const form = visible(page.getByRole('form', { name: 'Tally ledger names' }))
  await form.getByLabel('Income ledger (treatment fees)').fill('Direct Incomes')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(visible(page.getByRole('alert').filter({ hasText: 'is a group in Tally' }))).toContainText('"Direct Incomes" is a group in Tally, not a ledger')
  // A refused save keeps what he chose and typed
  await expect(visible(page.getByRole('radio', { name: /One per day/ }))).toBeChecked()
  await expect(form.getByLabel('Income ledger (treatment fees)')).toHaveValue('Direct Incomes')
  await form.getByLabel('Income ledger (treatment fees)').fill('Professional Fees')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(visible(page.getByText(/Ledgers: Cash · Savings A\/C · Professional Fees \(one per day\)/))).toBeVisible()
  await expect(page.getByRole('region', { name: 'Patient ledgers' })).toHaveCount(0)
  const month = await fileFrom(() => visible(page.getByRole('button', { name: 'Download month' })).click())
  expect(month).toMatch(/Smile Dental Clinic - \d+ UPI payments? - /)
  expect(month).not.toContain(`${runId} Tally`)
  expect(month).not.toContain('<LEDGER ')
})
