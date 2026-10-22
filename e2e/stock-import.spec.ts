import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { chargeName, priceListOptions } from '../src/lib/pricing'
import { makeXlsx } from '../src/lib/xlsx-write'
import { newRunId, signIn, testDb, visible } from './helpers'

// Loading the filled-in "Stock and costs" spreadsheet: what it adds and can't take is shown first; Load
// adds items with their starting counts, regular bills and what a treatment uses; loading again adds nothing
const runId = newRunId()
const gloves = `${runId} Gloves`
const composite = `${runId} Composite A2`
const bill = `${runId} Electricity`
const filling = priceListOptions().find((o) => chargeName(o) === 'Fillings – 3M Z350 Composite')!
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const spreadsheet = Buffer.from(makeXlsx({
  'Read me': [['Stock and costs for Clinic OS']],
  Supplies: [
    ['Everything you buy and keep.'],
    ['Item', 'Kind', 'Counted in (box, piece, ml, capsule, pack)', 'How many now', 'Warn me at', 'Usual supplier', 'Price per unit (₹)', 'Expiry date (if any)'],
    ['Example: Gloves, medium', 'Consumable', 'box', 4, 1, 'Example supplier', 450],
    [gloves, 'Consumable', 'Boxes', 4, 1, 'Dental Mart', 450],
    [composite, 'Material', 'capsule', 10, 3, '', 120, new Date(Date.UTC(2027, 5, 30))],
  ],
  'Regular bills': [
    ['What you pay every month or every year.'],
    ['Bill', 'Kind', 'Amount (₹)', 'Every', 'Usually paid on (day of the month)'],
    [bill, 'Electricity', 2500, 'Month', 10],
  ],
  'Lab fees': [['What the lab charges you.'], ['Work', 'Lab', 'Fee (₹)'], ['Ceramic crown (Vita)', 'Sri Lab', 1100]],
  'Materials per treatment': [
    ['One row per treatment option.'],
    ['Treatment option (as on the price list)', 'Item used (from Supplies)', 'How much per treatment'],
    [chargeName(filling), composite, 1],
    [null, `${runId} Matrix band`, 1],
  ],
}))

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  // Removing the items removes their starting counts and what treatments use them
  const { supabase } = await testDb()
  await supabase.from('stock_items').delete().like('name', `${runId}%`)
  await supabase.from('fixed_costs').delete().like('name', `${runId}%`)
  await page.close()
})

const pickFile = (name: string, buffer: Buffer, mimeType = XLSX) => page.getByLabel('The spreadsheet').setInputFiles({ name, mimeType, buffer })

test('a file that isn’t a spreadsheet is refused', async () => {
  await page.goto('/app/stock')
  await visible(page.getByRole('link', { name: 'Load the spreadsheet' })).click()
  await expect(page).toHaveURL(/\/app\/stock\/import$/)
  await expect(visible(page.getByRole('heading', { name: 'Load the spreadsheet' }))).toBeVisible()
  await pickFile('notes.xlsx', Buffer.from('Item,Kind\nGloves,Consumable'), 'text/plain')
  await expect(visible(page.getByRole('alert').filter({ hasText: 'couldn’t be read' }))).toBeVisible()
})

test('the spreadsheet shows what it adds and what it can’t take, then loads', async () => {
  await pickFile('Stock-and-costs.xlsx', spreadsheet)

  const items = visible(page.getByRole('region', { name: /^Stock items/ }))
  await expect(items).toContainText('Stock items (2)')
  await expect(items.getByRole('listitem').filter({ hasText: gloves })).toContainText('4 boxes · warn at 1 · ₹450 each · Consumable · Dental Mart')
  await expect(items.getByRole('listitem').filter({ hasText: composite })).toContainText('10 capsules · warn at 3 · ₹120 each · expires 30 Jun 2027 · Material')
  await expect(visible(page.getByRole('region', { name: /^Regular bills/ }))).toContainText('₹2,500 every month, on the 10th · Electricity')
  const uses = visible(page.getByRole('region', { name: /^What each treatment uses/ }))
  await expect(uses).toContainText(chargeName(filling))
  await expect(uses).toContainText(`${composite}: 1 capsule`)
  await expect(page.getByText('Lab fees (1) aren’t loaded')).toBeVisible()
  const check = visible(page.getByRole('region', { name: 'Check these' }))
  await expect(check).toContainText('Materials per treatment, row 4:')
  await expect(check).toContainText(`“${runId} Matrix band” isn't on the stock list or loaded from Supplies`)

  await expect(page.getByText('Adds 2 items, 1 regular bill and what 1 treatment uses.')).toBeVisible()
  await visible(page.getByRole('button', { name: 'Load into Clinic OS' })).click()
  await expect(visible(page.getByRole('status')).filter({ hasText: 'Loaded' })).toContainText('Loaded 2 items, 1 regular bill and what 1 treatment uses.')

  // The same file again: everything on it is in now
  await pickFile('Stock-and-costs.xlsx', spreadsheet)
  await expect(page.getByText('Nothing new to load: what is on it is already in Clinic OS.')).toBeVisible()
  await expect(visible(page.getByRole('region', { name: /^Stock items/ }))).toContainText(`Already on the stock list, left as they are: ${gloves}, ${composite}.`)
  await expect(page.getByRole('button', { name: 'Load into Clinic OS' })).toHaveCount(0)
})

test('what was loaded is on the stock list, in Regular bills and on the item', async () => {
  await page.goto('/app/stock')
  const list = visible(page.getByRole('list', { name: 'Stock' }))
  await expect(list.getByRole('link', { name: new RegExp(gloves) })).toContainText('4 boxes')
  await list.getByRole('link', { name: new RegExp(composite) }).click()
  await expect(visible(page.getByRole('heading', { name: composite }))).toBeVisible()
  await expect(visible(page.getByRole('region', { name: 'On hand' }))).toContainText('10 capsules')
  await expect(visible(page.getByRole('region', { name: 'Treatments that use it' }))).toContainText(chargeName(filling))
  await expect(visible(page.getByRole('region', { name: 'History' }))).toContainText('Added 10 capsules at ₹120 each, expires 30 Jun 2027')

  await page.goto('/app/costs/regular')
  await expect(visible(page.getByRole('list', { name: 'Regular bills' }))).toContainText(bill)
})
