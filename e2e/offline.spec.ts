import path from 'node:path'
import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'

// With no signal: charges, payments and photos wait on the phone, show at once (marked as waiting),
// and reach the server once the signal is back, in order and only once. The browser is switched off
// the network for real (Playwright's offline mode).
const runId = newRunId()
const fixturePhoto = path.join(__dirname, 'fixtures', 'tooth.png')

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => { await cleanRun(runId) })

const rows = async (table: 'visit_charges' | 'payments' | 'visit_photos', visitId: string) => {
  const { supabase } = await testDb()
  return (await supabase.from(table).select('*').eq('visit_id', visitId)).data ?? []
}

test('with no signal a charge and a payment wait on the phone, show at once, and save when it is back', async ({ page, context }) => {
  const visitId = await createVisit(await createPatient(`${runId} Offline`, newPhone('5')), openDay(0), 300)
  await signIn(page)
  await page.goto(`/app/visits/${visitId}`)
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toBeVisible()

  await context.setOffline(true)
  const banner = visible(page.getByRole('status').filter({ hasText: 'No signal' }))
  await expect(banner).toBeVisible()

  // A usual charge, at once, marked as waiting
  const chip = visible(page.getByRole('group', { name: 'Usual charges' })).getByRole('button').first()
  await chip.click()
  await expect(visible(page.getByText('Waiting to save'))).toBeVisible()
  await expect(banner).toContainText('1 change will save')

  // The whole bill paid in cash, also waiting
  const amount = visible(page.locator('#payment-amount'))
  const due = await amount.inputValue()
  await visible(page.locator('#payment').getByRole('button', { name: 'Cash received' })).click()
  await expect(visible(page.locator('#payment'))).toContainText('waiting to save')
  await expect(banner).toContainText('2 changes will save')
  expect(await rows('visit_charges', visitId)).toHaveLength(1)
  expect(await rows('payments', visitId)).toHaveLength(0)

  // Signal back: both save, once each, and the banner goes
  await context.setOffline(false)
  await expect.poll(async () => (await rows('visit_charges', visitId)).length, { timeout: 30_000 }).toBe(2)
  await expect.poll(async () => (await rows('payments', visitId)).map((p) => Number(p.amount)), { timeout: 30_000 }).toEqual([Number(due)])
  await expect(page.getByRole('status').filter({ hasText: /No signal|waiting to save|Saving/ })).toHaveCount(0, { timeout: 30_000 })
  await expect(visible(page.getByText('Waiting to save'))).toHaveCount(0)
})

test('a payment taken back while it waited never reaches the server', async ({ page, context }) => {
  const visitId = await createVisit(await createPatient(`${runId} Undo`, newPhone('5')), openDay(0), 300)
  await signIn(page)
  await page.goto(`/app/visits/${visitId}`)
  await expect(visible(page.locator('#payment-amount'))).toBeVisible()

  await context.setOffline(true)
  await visible(page.locator('#payment').getByRole('button', { name: 'Cash received' })).click()
  await expect(visible(page.locator('#payment'))).toContainText('waiting to save')
  await visible(page.getByRole('button', { name: 'Undo' })).click()
  await expect(visible(page.locator('#payment'))).not.toContainText('waiting to save')

  await context.setOffline(false)
  await page.waitForTimeout(3000)
  expect(await rows('payments', visitId)).toHaveLength(0)
})

test('a photo taken with no signal uploads when the visit is opened again, even after the tab was closed', async ({ browser }) => {
  const context = await browser.newContext()
  const visitId = await createVisit(await createPatient(`${runId} Photo`, newPhone('5')), openDay(0), 300)
  const first = await context.newPage()
  await signIn(first)
  await first.goto(`/app/visits/${visitId}`)
  await expect(visible(first.getByRole('button', { name: 'Gallery' }))).toBeVisible()

  await context.setOffline(true)
  const [chooser] = await Promise.all([first.waitForEvent('filechooser'), visible(first.getByRole('button', { name: 'Gallery' })).click()])
  await chooser.setFiles(fixturePhoto)
  await expect(visible(first.getByAltText('New photo'))).toBeVisible()
  // Give the phone a moment to keep its copy, then close the tab with the photo not uploaded
  await first.waitForTimeout(1000)
  await first.close()
  expect(await rows('visit_photos', visitId)).toHaveLength(0)

  await context.setOffline(false)
  const again = await context.newPage()
  await again.goto(`/app/visits/${visitId}`)
  await expect.poll(async () => (await rows('visit_photos', visitId)).length, { timeout: 45_000 }).toBe(1)
  await again.reload()
  await expect(visible(again.getByRole('img', { name: /^Photo 1/ }))).toBeVisible({ timeout: 30_000 })
  await context.close()
})
