import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, signIn, testDb, visible } from './helpers'
import { todayInIndia } from '../src/lib/dates'

// Alerts: the bottom bar's button says how many things need him now; its screen lists everything that
// needs him with a line on each, and a tap goes to where it is dealt with
test.skip(!testLogin, NO_TEST_LOGIN)

const runId = newRunId()
test.afterAll(async () => cleanRun(runId))

test('Alerts lists a booking request and a bill changed after sending, and each leads to where it is done', async ({ page }) => {
  const { supabase } = await testDb()
  // A website request waiting for a decision (the test account's own: the public website books into the clinic)
  const requester = `${runId} Asks For Time`
  const { data: request, error: requestError } = await supabase.from('booking_requests')
    .insert({ name: requester, phone: newPhone('8'), reason: 'Check-up' }).select('id').single()
  expect(requestError).toBeNull()
  // A visit whose bill changed after its WhatsApp went
  const patient = `${runId} Bill Changed`
  const visitId = await createVisit(await createPatient(patient, newPhone()), todayInIndia(), 500)
  const { error: sentError } = await supabase.from('visits').update({ closed_at: new Date().toISOString(), resend_needed: true }).eq('id', visitId)
  expect(sentError).toBeNull()

  await signIn(page)
  const alerts = visible(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Alerts, \d+ need you$/ }))
  await expect(alerts).toBeVisible()
  await alerts.click()
  await expect(page).toHaveURL(/\/app\/alerts$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible()

  const now = page.getByRole('list', { name: 'Needs you now' })
  const requestRow = now.getByRole('link').filter({ hasText: `Booking request: ${requester}` })
  await expect(requestRow).toContainText('No time chosen · Check-up · asked')
  await expect(requestRow).toContainText('Book a time')
  const billRow = now.getByRole('link').filter({ hasText: `Bill changed after sending: ${patient}` })
  await expect(billRow).toContainText('Send new bill')

  await requestRow.click()
  await expect(page).toHaveURL(new RegExp(`/app/requests/${request!.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: requester })).toBeVisible()

  await page.goto('/app/alerts')
  await page.getByRole('list', { name: 'Needs you now' }).getByRole('link').filter({ hasText: `Bill changed after sending: ${patient}` }).click()
  await expect(page).toHaveURL(new RegExp(`/app/visits/${visitId}$`))

  // Dealt with, it goes: the request handled, the bill sent again
  await supabase.from('booking_requests').update({ status: 'declined' }).eq('id', request!.id)
  await supabase.from('visits').update({ resend_needed: false }).eq('id', visitId)
  await page.goto('/app/alerts')
  await expect(page.getByText(`Booking request: ${requester}`)).toHaveCount(0)
  await expect(page.getByText(`Bill changed after sending: ${patient}`)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Notifications on this phone' })).toHaveAttribute('href', '/app/notifications')
})
