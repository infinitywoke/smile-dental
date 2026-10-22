import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { chargeName, priceListOptions } from '../src/lib/pricing'
import { addDays, inIndia } from '../src/lib/schedule'
import { cleanRun, createPatient, newPhone, newRunId, signIn, testDb, visible } from './helpers'

// Stock: an item with what is on the shelf; Add stock, Used, Remove and Count on its page; low stock
// on Today's Cockpit; what a treatment uses, taken off by a visit; changing an item and taking it off the list
const runId = newRunId()
const name = `${runId} Composite A2`
const options = priceListOptions()
const filling = options.find((o) => o.price.kind === 'fixed' && /fill/i.test(o.treatment)) ?? options.find((o) => o.price.kind === 'fixed')!

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  // The patient (with the visit and its charge) first, then the item with its moves and materials
  await cleanRun(runId)
  const { supabase } = await testDb()
  await supabase.from('stock_items').delete().like('name', `${runId}%`)
  await page.close()
})

const stockRow = () => visible(page.getByRole('list', { name: 'Stock' }).getByRole('link', { name: new RegExp(name) }))
const onHand = () => visible(page.getByRole('region', { name: 'On hand' }))

test('Stock is under Practice; an item is added with what is on the shelf', async () => {
  await page.goto('/app')
  await visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Practice/ })).click()
  await visible(page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Stock' })).click()
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

test('low stock puts a dot on Practice, and Stock lists it first; Settings is under Practice too', async () => {
  await page.goto('/app')
  const practiceLink = visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Practice/ }))
  await expect(practiceLink).toHaveAccessibleName(/stock low/)
  await practiceLink.click()
  const practice = visible(page.getByRole('navigation', { name: 'Practice' }))
  await practice.getByRole('link', { name: 'Stock' }).click()
  await expect(page).toHaveURL(/\/app\/stock$/)
  await expect(stockRow()).toContainText('Low')

  await visible(page.getByRole('navigation', { name: 'Practice' }).getByRole('link', { name: 'Settings' })).click()
  await expect(page).toHaveURL(/\/app\/settings$/)
  await expect(visible(page.getByRole('heading', { name: 'Settings' }))).toBeVisible()
})

test('what a treatment uses: set once, then a visit takes it off stock and removing the charge puts it back', async () => {
  await page.goto('/app/stock')
  await visible(page.getByRole('link', { name: 'What each treatment uses' })).click()
  await expect(page).toHaveURL(/\/app\/stock\/materials$/)
  await visible(page.getByLabel('Find a treatment')).fill(filling.detail || filling.treatment)
  await visible(page.getByRole('list', { name: 'Treatments' })).getByRole('button').filter({ hasText: filling.detail || filling.treatment }).first().click()

  const sheet = page.getByRole('dialog', { name: chargeName(filling) })
  await sheet.getByRole('region', { name: 'Add an item' }).getByRole('button').filter({ hasText: name }).click()
  await sheet.getByLabel('How many capsules does one use?').fill('1')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('region', { name: 'Uses' })).toContainText(name)
  await expect(sheet.getByRole('region', { name: 'Uses' })).toContainText('1 capsule')
  await expect(sheet.getByRole('status')).toContainText('Materials ₹120')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)

  await page.goto('/app/stock')
  await stockRow().click()
  await expect(visible(page.getByRole('region', { name: 'Treatments that use it' }))).toContainText(chargeName(filling))
  await expect(onHand().getByText('2 capsules', { exact: true })).toBeVisible()

  // A visit billed that filling: the database takes one off, and gives it back when the charge goes
  const { supabase } = await testDb()
  const patientId = await createPatient(`${runId} Materials`, newPhone('7'))
  const { data: visit, error } = await supabase.from('visits').insert({ patient_id: patientId, visit_date: inIndia(new Date()).date }).select('id').single()
  if (error) throw error
  const amount = filling.price.kind === 'fixed' ? filling.price.amount : 1000
  const { data: charge, error: chargeError } = await supabase.from('visit_charges')
    .insert({ visit_id: visit.id, patient_id: patientId, description: chargeName(filling), amount, treatment_slug: filling.slug }).select('id').single()
  if (chargeError) throw chargeError
  await page.reload()
  await expect(onHand().getByText('1 capsule', { exact: true })).toBeVisible()
  const history = visible(page.getByRole('region', { name: 'History' }))
  const fromVisit = history.getByRole('listitem').filter({ hasText: `Used 1 capsule for ${chargeName(filling)}` })
  await expect(fromVisit).toContainText('from a visit')
  await expect(fromVisit.getByRole('button', { name: 'Remove' })).toHaveCount(0)

  await supabase.from('visit_charges').delete().eq('id', charge.id)
  await page.reload()
  await expect(onHand().getByText('2 capsules', { exact: true })).toBeVisible()
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
