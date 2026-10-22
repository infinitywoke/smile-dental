import { expect, test, type Page } from '@playwright/test'
import { inIndia } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, signIn, testDb, visible } from './helpers'

// With no signal the app still opens: a screen opened before comes from the copy kept on the phone
// (public/sw.js), saying when it was made, and Today's visits are kept before they are opened. In
// development the worker keeps nothing unless the phone is told to, as these tests do.
const runId = newRunId()
const today = inIndia(new Date()).date

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => { await cleanRun(runId) })
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('clinic-offline-dev', '1'))
})

// The phone's copy of a screen, if it has one
const kept = (page: Page, path: string) => page.evaluate(async (href) => {
  const cache = await caches.open('clinic-pages-v1')
  return Boolean(await cache.match(new URL(href, location.origin).href))
}, path)

// Signing in opens Today, which starts the worker. That page began as the login page, outside the
// worker's /app, so Today is opened again as a page of its own for the worker to look after it.
const signInWithWorker = async (page: Page) => {
  await signIn(page)
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/app'))?.active?.state), { timeout: 30_000 }).toBe('activated')
  await page.goto('/app')
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))
}

const charges = async (visitId: string) => {
  const { supabase } = await testDb()
  return (await supabase.from('visit_charges').select('id').eq('visit_id', visitId)).data ?? []
}

test('a visit opened before opens with no signal, says when its copy is from, and its changes save when the signal is back', async ({ page, context }) => {
  const visitId = await createVisit(await createPatient(`${runId} Copy`, newPhone('6')), today, 300)
  await signInWithWorker(page)
  await page.goto(`/app/visits/${visitId}`)
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toBeVisible()
  await expect.poll(() => kept(page, `/app/visits/${visitId}`), { timeout: 30_000 }).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toBeVisible()
  await expect(visible(page.getByRole('status').filter({ hasText: 'No signal' }))).toBeVisible()
  const copyNote = page.getByRole('status').filter({ hasText: /Showing this screen as it was at \d/ })
  await expect(visible(copyNote)).toBeVisible()

  // The copy works as the screen does: a charge tapped now waits on the phone
  await visible(page.getByRole('group', { name: 'Usual charges' })).getByRole('button').first().click()
  await expect(visible(page.getByText('Waiting to save'))).toBeVisible()

  // Signal back: it saves, and the screen is the server's again
  await context.setOffline(false)
  await expect.poll(async () => (await charges(visitId)).length, { timeout: 30_000 }).toBe(2)
  await expect(copyNote).toHaveCount(0, { timeout: 30_000 })
  await expect(visible(page.getByText('Waiting to save'))).toHaveCount(0)
})

test("Today keeps the day's visits, so one never opened opens with no signal; a screen never kept says so", async ({ page, context }) => {
  const visitId = await createVisit(await createPatient(`${runId} Ahead`, newPhone('6')), today, 300)
  await signInWithWorker(page)
  await expect.poll(() => kept(page, `/app/visits/${visitId}`), { timeout: 90_000 }).toBe(true)

  await context.setOffline(true)
  await visible(page.getByRole('link', { name: new RegExp(`${runId} Ahead`) })).click()
  await expect(page).toHaveURL(new RegExp(`/app/visits/${visitId}$`))
  await expect(visible(page.getByLabel('Notes', { exact: true }))).toBeVisible()
  await expect(visible(page.getByRole('status').filter({ hasText: 'Showing this screen as it was' }))).toBeVisible()

  await page.goto('/app/stock')
  await expect(page.getByRole('heading', { name: 'No signal' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to Today' })).toBeVisible()
  await context.setOffline(false)
})

test('with no signal Sign out waits for it; signing out deletes the screens kept on the phone', async ({ page, context }) => {
  await signInWithWorker(page)
  await page.goto('/app/settings')
  await expect.poll(() => kept(page, '/app/settings'), { timeout: 30_000 }).toBe(true)
  await expect.poll(() => kept(page, '/app'), { timeout: 30_000 }).toBe(true)

  await context.setOffline(true)
  await expect(visible(page.getByRole('button', { name: 'Sign out' }))).toBeDisabled()
  await expect(visible(page.getByText("No signal: you can sign out when it's back."))).toBeVisible()

  await context.setOffline(false)
  await visible(page.getByRole('button', { name: 'Sign out' })).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await kept(page, '/app/settings')).toBe(false)
  expect(await kept(page, '/app')).toBe(false)
})
