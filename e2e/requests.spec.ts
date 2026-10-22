import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, makeRequest, newRunId, signIn, testDb, visible } from './helpers'

// A website request holds its time only once its WhatsApp reached the clinic: for now, when Dr. Rahil
// opens the link inside the patient's message.
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await cleanRun(runId)
  await page.close()
})

test('a request is not held until its WhatsApp link is opened; then Today shows until when', async () => {
  const waiting = await makeRequest(runId, 'Waiting', '10:30', 2)
  const opened = await makeRequest(runId, 'Opened', '11:00', 2)

  // The link in the patient's WhatsApp message records that it arrived, then opens the request
  await page.goto(`/app/requests/${opened.id}/received`)
  await expect(page).toHaveURL(new RegExp(`/app/requests/${opened.id}$`))
  const { supabase } = await testDb()
  const received = async (id: string) => (await supabase.from('booking_requests').select('received_at').eq('id', id).single()).data!.received_at
  expect(await received(opened.id)).not.toBeNull()
  expect(await received(waiting.id)).toBeNull()

  await page.goto('/app')
  const card = (name: string) => visible(page.locator('div.rounded-2xl').filter({ hasText: name })).last()
  await expect(card(opened.requestName)).toContainText(/Held until/)
  await expect(card(waiting.requestName)).toContainText('Not held yet')
  // Neither is stale, so neither offers Decline on the card
  await expect(card(opened.requestName).getByRole('button', { name: 'Decline' })).toHaveCount(0)
})
