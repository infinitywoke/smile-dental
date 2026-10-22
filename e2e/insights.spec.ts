import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { blockInstant, inIndia } from '../src/lib/schedule'
import { cleanRun, createVisit, newPhone, newRunId, signIn, testDb, visible } from './helpers'

// This month's numbers: only what is recorded shows, each part beside the same days of last month
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
const today = inIndia(new Date()).date

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test('Practice opens this month: money, new patients and where they heard of you, bookings, missed visits, treatments', async () => {
  const { supabase } = await testDb()
  const { data: patient, error } = await supabase.from('patients')
    .insert({ name: `${runId} Numbers`, phone: newPhone('6'), gender: 'female', heard_from: `${runId} flyer` }).select('id').single()
  if (error) throw error
  // Seen and paid today; a missed appointment earlier today; a website booking
  await createVisit(patient.id, today, 1200, 1200)
  await supabase.from('appointments').insert({ patient_id: patient.id, starts_at: blockInstant(today, '06:00'), duration_min: 40, status: 'no_show' })
  await supabase.from('booking_requests').insert({ name: `${runId} Web`, phone: newPhone('8'), gender: 'male', reason: 'Check-up', requested_start: blockInstant(today, '23:00'), status: 'declined' })

  await page.goto('/app')
  await visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Practice/ })).click()
  await expect(page).toHaveURL(/\/app\/insights$/)
  await expect(visible(page.getByRole('heading', { name: 'This month' }))).toBeVisible()

  await expect(visible(page.getByRole('region', { name: 'Money collected' }))).toContainText('cash')
  await expect(visible(page.getByRole('region', { name: 'How new patients heard of you' }))).toContainText(`${runId} flyer`)
  await expect(visible(page.getByRole('region', { name: 'Website bookings' }))).toBeVisible()
  await expect(visible(page.getByRole('region', { name: "Didn't come" }))).toBeVisible()
  await expect(visible(page.getByRole('region', { name: 'Most billed treatments' }))).toContainText('Other charges')
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/insights.png`, fullPage: true })
})

test('earlier months, and back; Send to Tally is one tap away', async () => {
  await visible(page.getByRole('link', { name: 'Previous month' })).click()
  await expect(visible(page.getByRole('heading', { name: 'This month' }))).toHaveCount(0)
  await expect(page).toHaveURL(/m=\d{4}-\d{2}/)
  await visible(page.getByRole('link', { name: 'Next month' })).click()
  await expect(visible(page.getByRole('heading', { name: 'This month' }))).toBeVisible()
  await visible(page.getByRole('link', { name: 'Send to Tally' })).click()
  await expect(page).toHaveURL(/\/app\/tally$/)
})
