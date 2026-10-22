import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { addDays, inIndia } from '../src/lib/schedule'
import { newRunId, signIn, testDb, visible } from './helpers'

// Stock: an item with what is on the shelf; Add stock, Used, Remove and Count on its page; low stock
// on Today's Cockpit; changing an item and taking it off the list
const runId = newRunId()
const name = `${runId} Composite A2`

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  const { supabase } = await testDb()
  // Its moves go with it
  await supabase.from('stock_items').delete().like('name', `${runId}%`)
  await page.close()
})

const stockRow = () => visible(page.getByRole('list', { name: 'Stock' }).getByRole('link', { name: new RegExp(name) }))
const onHand = () => visible(page.getByRole('region', { name: 'On hand' }))

test('Stock is on the bottom bar; an item is added with what is on the shelf', async () => {
  await page.goto('/app')
  await visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stock' })).click()
  await expect(page).toHaveURL(/\/app\/stock$/)
  await visible(page.getByRole('link', { name: 'Add item' })).click()
  await expect(page).toHaveURL(/\/app\/stock\/new$/)

  await visible(page.getByLabel('Item', { exact: true })).fill(name)
  await visible(page.getByRole('button', { name: 'Material', exact: true })).click()
  await visible(page.getByLabel('Counted in')).fill('capsule')
  await visible(page.getByLabel('How many now')).fill('5')
  await visible(page.getByLabel('Warn me at')).fill('3')
  await visible(page.getByLabel('Price each (₹)')).fill('120')
  await visible(page.getByRole('button', { name: 'Add to stock' })).click()

  await expect(page).toHaveURL(/\/app\/stock$/)
  await expect(stockRow()).toContainText('5 capsules')
  await expect(stockRow()).not.toContainText('Low')
})

test('Add stock, Used and Count change what is on hand; a move can be taken back', async () => {
  await stockRow().click()
  await expect(visible(page.getByRole('heading', { name }))).toBeVisible()
  await expect(onHand().getByText('5 capsules', { exact: true })).toBeVisible()

  // Ten more came in, at the last price, expiring in ten days
  await visible(page.getByRole('button', { name: 'Add stock' })).click()
  const adding = page.getByRole('dialog', { name: 'Add stock' })
  await adding.getByLabel('How many capsules came in?').fill('10')
  await expect(adding.getByLabel('Price each (₹)')).toHaveValue('120')
  await adding.getByLabel('Expires (if it does)').fill(addDays(inIndia(new Date()).date, 10))
  await adding.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(adding).toHaveCount(0)
  await expect(onHand().getByText('15 capsules', { exact: true })).toBeVisible()
  await expect(onHand()).toContainText('Next expiry')

  // Two used, then taken back
  await visible(page.getByRole('button', { name: 'Used', exact: true })).click()
  const using = page.getByRole('dialog', { name: 'Used or thrown away' })
  await using.getByLabel('How many capsules?').fill('2')
  await using.getByRole('button', { name: 'Take off stock' }).click()
  await expect(onHand().getByText('13 capsules', { exact: true })).toBeVisible()
  const history = visible(page.getByRole('region', { name: 'History' }))
  const usedRow = history.getByRole('listitem').filter({ hasText: 'Used 2 capsules' })
  await usedRow.getByRole('button', { name: 'Remove' }).click()
  await usedRow.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(onHand().getByText('15 capsules', { exact: true })).toBeVisible()
  await expect(history).not.toContainText('Used 2 capsules')

  // The shelf has two: the count replaces the app's number, and it is low
  await visible(page.getByRole('button', { name: 'Count', exact: true })).click()
  const counting = page.getByRole('dialog', { name: 'Count' })
  await expect(counting).toContainText('The app has 15 capsules')
  await counting.getByLabel('How many capsules are there now?').fill('2')
  await counting.getByRole('button', { name: 'Save count' }).click()
  await expect(onHand().getByText('2 capsules', { exact: true })).toBeVisible()
  await expect(onHand()).toContainText('Low: at or below 3 capsules')
  await expect(history).toContainText('Counted: 13 capsules fewer than the app had')
  await expect(history).toContainText('Added 10 capsules at ₹120 each')
})

test("low stock shows on Today's Cockpit and leads to the list; Settings is the Cockpit's gear", async () => {
  await page.goto('/app')
  const stockLink = visible(page.getByRole('region', { name: 'Cockpit' }).getByRole('link', { name: /STOCK/ }))
  await expect(stockLink).toContainText(/\d+ low/)
  await stockLink.click()
  await expect(page).toHaveURL(/\/app\/stock$/)
  await expect(stockRow()).toContainText('Low')

  await page.goto('/app')
  await visible(page.getByRole('link', { name: 'Settings' })).click()
  await expect(page).toHaveURL(/\/app\/settings$/)
  await expect(visible(page.getByRole('heading', { name: 'Settings' }))).toBeVisible()
})

test('an item can be changed, and taken off the list', async () => {
  await page.goto('/app/stock')
  await stockRow().click()
  await visible(page.getByRole('link', { name: 'Edit item' })).click()
  await visible(page.getByLabel('Usual supplier')).fill(`${runId} Dental Depot`)
  await visible(page.getByRole('button', { name: 'Save changes' })).click()
  await expect(visible(page.getByRole('heading', { name }))).toBeVisible()
  await expect(onHand()).toContainText(`${runId} Dental Depot`)

  await visible(page.getByRole('link', { name: 'Edit item' })).click()
  await visible(page.getByRole('button', { name: 'Remove from the list' })).click()
  await visible(page.getByRole('button', { name: 'Yes, remove' })).click()
  await expect(page).toHaveURL(/\/app\/stock$/)
  await expect(stockRow()).toHaveCount(0)
})
