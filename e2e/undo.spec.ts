import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'

// Quick actions take effect at once and offer "Undo" for a few seconds; a next visit booked by
// mistake can be removed.
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let visitId = ''

const bookedFromVisit = async () => {
  const { supabase } = await testDb()
  const { data } = await supabase.from('appointments').select('id').eq('from_visit_id', visitId).eq('status', 'booked')
  return data!.length
}

test.beforeAll(async ({ browser }) => {
  const patientId = await createPatient(`${runId} Undo`, newPhone('4'))
  visitId = await createVisit(patientId, openDay(0), 600)
  page = await browser.newPage()
  await signIn(page)
  await page.goto(`/app/visits/${visitId}`)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test('booking the next visit offers Undo, which takes it back', async () => {
  await visible(page.getByRole('button', { name: /^Book / })).click()
  await expect(visible(page.getByText(/^Next visit booked: /))).toBeVisible()
  expect(await bookedFromVisit()).toBe(1)

  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect(visible(page.getByText('Undone'))).toBeVisible()
  expect(await bookedFromVisit()).toBe(0)
  await expect(visible(page.getByText('None', { exact: true }))).toBeVisible()
})

test('a next visit booked by mistake can be removed, and Undo books it again', async () => {
  await visible(page.getByRole('button', { name: /^Book / })).click()
  await expect(visible(page.getByText(/Booked: /))).toBeVisible()

  await visible(page.getByRole('button', { name: 'Remove', exact: true })).click()
  await expect(visible(page.getByText('Next visit removed'))).toBeVisible()
  expect(await bookedFromVisit()).toBe(0)

  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect(visible(page.getByText('Undone'))).toBeVisible()
  await expect(visible(page.getByText(/Booked: /))).toBeVisible()
  expect(await bookedFromVisit()).toBe(1)
})

test('a payment just recorded can be undone', async () => {
  await visible(page.locator('#payment-amount')).fill('100')
  await visible(page.getByRole('button', { name: 'Cash received' })).click()
  await expect(visible(page.getByText('₹100 cash recorded'))).toBeVisible()
  const { supabase } = await testDb()
  const payments = async () => (await supabase.from('payments').select('id').eq('visit_id', visitId)).data!.length
  expect(await payments()).toBe(1)

  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect(visible(page.getByText('Undone'))).toBeVisible()
  expect(await payments()).toBe(0)
})
