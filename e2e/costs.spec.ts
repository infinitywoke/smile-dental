import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { inIndia } from '../src/lib/schedule'
import { newRunId, signIn, testDb, visible } from './helpers'

// Costs: one with a bill photo, a regular bill marked paid once this month, what is left on Money,
// deleting a cost and stopping a bill
const runId = newRunId()
const supplier = `${runId} Dental Depot`
const rent = `${runId} Rent`
const billPhoto = path.join(__dirname, 'fixtures', 'tooth.png')
const today = inIndia(new Date()).date

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  const { supabase } = await testDb()
  const { data } = await supabase.from('costs').select('bill_path').like('payee', `${runId}%`)
  const paths = (data ?? []).flatMap((c) => (c.bill_path ? [c.bill_path as string] : []))
  if (paths.length > 0) await supabase.storage.from('cost-bills').remove(paths)
  await supabase.from('costs').delete().like('payee', `${runId}%`)
  await supabase.from('fixed_costs').delete().like('name', `${runId}%`)
  await page.close()
})

const costRow = (name: string) => visible(page.getByRole('region', { name: 'Costs this month' }).getByRole('link', { name: new RegExp(name) }))

test('Money leads to Costs; a cost is saved with a photo of its bill', async () => {
  await page.goto('/app/insights')
  await visible(page.getByRole('link', { name: 'Costs and what is left' })).click()
  await expect(page).toHaveURL(/\/app\/costs$/)
  await expect(visible(page.getByRole('region', { name: 'Spent' }))).toBeVisible()

  await visible(page.getByRole('link', { name: 'Add a cost' })).click()
  await visible(page.getByLabel('Amount (₹)')).fill('1200')
  await visible(page.getByRole('button', { name: 'Supplies', exact: true })).click()
  await visible(page.getByLabel('Paid to')).fill(supplier)
  await visible(page.getByRole('button', { name: 'Cash', exact: true })).click()
  await visible(page.getByLabel('Note')).fill('Gloves and composite')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), visible(page.getByRole('button', { name: 'Add a photo of the bill' })).click()])
  await chooser.setFiles(billPhoto)
  await expect(visible(page.getByRole('img', { name: 'The bill' }))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Save cost' })).click()

  await expect(page).toHaveURL(new RegExp(`/app/costs\\?m=${today.slice(0, 7)}$`))
  await expect(costRow(supplier)).toContainText('₹1,200')
  await expect(costRow(supplier)).toContainText('Supplies · Gloves and composite')

  await costRow(supplier).click()
  const cost = visible(page.getByRole('region', { name: 'Cost' }))
  await expect(cost).toContainText('₹1,200')
  await expect(cost).toContainText('Paid by Cash')
  await expect(visible(page.getByRole('img', { name: 'The bill' }))).toBeVisible()
})

test('a regular bill is added, then marked paid once this month with the amount actually paid', async () => {
  await page.goto('/app/costs')
  await visible(page.getByRole('link', { name: 'Regular bills', exact: true })).click()
  await expect(page).toHaveURL(/\/app\/costs\/regular$/)
  await visible(page.getByRole('link', { name: 'Add', exact: true })).click()
  await visible(page.getByLabel('Bill', { exact: true })).fill(rent)
  await visible(page.getByLabel('Usual amount (₹)')).fill('15000')
  await expect(visible(page.getByLabel('Due on'))).toHaveValue(today)
  await visible(page.getByRole('button', { name: 'Add bill' })).click()
  await expect(page).toHaveURL(/\/app\/costs\/regular$/)
  await expect(visible(page.getByRole('list', { name: 'Regular bills' }))).toContainText(`${rent}₹15,000 every month, on the `)

  await page.goto('/app/costs')
  const bills = visible(page.getByRole('region', { name: 'Regular bills this month' }))
  const row = bills.getByRole('listitem').filter({ hasText: rent })
  await row.getByRole('button', { name: 'Mark paid' }).click()
  const sheet = page.getByRole('dialog', { name: `Paid: ${rent}` })
  await expect(sheet.getByLabel('Amount paid (₹)')).toHaveValue('15000')
  await sheet.getByLabel('Amount paid (₹)').fill('15500')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(row).toContainText('₹15,500')
  await expect(row.getByRole('link', { name: 'Paid' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Mark paid' })).toHaveCount(0)
  await expect(costRow(rent)).toContainText('Rent')

  // What is left shows on Money
  await page.goto('/app/insights')
  await expect(visible(page.getByRole('link', { name: 'Costs and what is left' }))).toContainText('Left after costs')
})

test('a cost can be deleted, and a regular bill stopped', async () => {
  await page.goto('/app/costs')
  await costRow(supplier).click()
  await visible(page.getByRole('button', { name: 'Delete this cost' })).click()
  await visible(page.getByRole('button', { name: 'Yes, delete' })).click()
  await expect(page).toHaveURL(/\/app\/costs\?m=/)
  await expect(costRow(supplier)).toHaveCount(0)

  await page.goto('/app/costs/regular')
  await visible(page.getByRole('list', { name: 'Regular bills' }).getByRole('link', { name: new RegExp(rent) })).click()
  await visible(page.getByRole('button', { name: 'Stop this bill' })).click()
  await visible(page.getByRole('button', { name: 'Yes, stop it' })).click()
  await expect(page).toHaveURL(/\/app\/costs\/regular$/)
  await expect(visible(page.getByRole('list', { name: 'Regular bills' }).getByRole('link', { name: new RegExp(rent) }))).toContainText('Stopped')
})
