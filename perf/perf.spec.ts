import { writeFileSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from '../e2e/env'
import { blocksLeftToday, cleanRun, createAppointmentAtFirstFree, createPatient, createVisit, newPhone, newRunId, signIn, visible } from '../e2e/helpers'
import { inIndia } from '../src/lib/schedule'

// How long Clinic OS takes on a slowed phone (CPU 4x slower, a modest 4G connection), and how much the
// page and its service worker fetch: Today, a visit from Today, a charge saved, the patient, back to
// Today. Run with PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 so the worker's fetches are counted.
// Writes the numbers to PERF_OUT (a JSON file) when it is set.
const runId = newRunId('PERF')
const ROUNDS = Number(process.env.PERF_ROUNDS ?? 3)

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => {
  await cleanRun(runId)
})

type Sample = Record<string, number>

async function slowDown(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  // About 4 Mbit/s down, 1.5 up, 120 ms round trips
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 500_000, uploadThroughput: 187_500 })
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

test('speed: Today, a visit, a charge, the patient, back', async ({ page, context }) => {
  // Today: three patients booked, two of them seen
  const today = inIndia(new Date()).date
  const patients: { id: string; name: string }[] = []
  for (let i = 1; i <= 3; i++) {
    const name = `${runId} Patient ${i}`
    patients.push({ id: await createPatient(name, newPhone(String(5 + i))), name })
  }
  for (const p of patients) await createAppointmentAtFirstFree(p.id, today, blocksLeftToday(30))
  const visits = [await createVisit(patients[0].id, today, 500, 200), await createVisit(patients[1].id, today, 300)]

  const requests: { at: number; url: string; worker: boolean; method: string }[] = []
  const log = (request: Request) => requests.push({ at: Date.now(), url: new URL(request.url()).pathname, worker: !!request.serviceWorker(), method: request.method() })
  context.on('request', log)
  // The experiment: the worker's keeping fetches fail at once (PERF_NO_KEEP=1)
  if (process.env.PERF_NO_KEEP) await context.route('**/*', (route) => (route.request().headers()['x-clinic-keep'] ? route.abort() : route.continue()))
  // The visit screen's server reply (its RSC fetch) and the scripts it loads
  const visitReplies: number[] = []
  let scriptBytes = 0
  let countScripts = false
  let measuring = true
  context.on('response', async (response) => {
    if (!measuring) return
    try {
      const request = response.request()
      if (request.serviceWorker()) return
      const url = new URL(request.url())
      if (url.pathname.startsWith('/app/visits/') && request.headers()['rsc']) {
        await response.finished()
        const t = request.timing()
        visitReplies.push(Math.round(t.responseEnd - t.requestStart))
      }
      if (countScripts && request.resourceType() === 'script') scriptBytes += (await response.body()).length
    } catch {
      // The page moved on, or the run ended
    }
  })
  await signIn(page)
  await slowDown(page)

  const samples: Sample[] = []
  const counted = (from: number, to: number) => {
    const inWindow = requests.filter((r) => r.at >= from && r.at < to)
    return { page: inWindow.filter((r) => !r.worker).length, worker: inWindow.filter((r) => r.worker).length, workerPages: inWindow.filter((r) => r.worker && r.url.startsWith('/app')).length }
  }

  for (let round = 0; round < ROUNDS; round++) {
    const sample: Sample = {}
    // Today, loaded whole
    let start = Date.now()
    await page.goto('/app')
    await expect(visible(page.getByRole('heading', { name: /^Today/ }))).toBeVisible()
    sample.todayLoad = Date.now() - start
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      return { server: nav.responseStart - nav.requestStart, html: nav.responseEnd - nav.requestStart }
    })
    sample.todayServer = Math.round(timing.server)
    sample.todayHtml = Math.round(timing.html)
    // What happens in the background in the next 15 seconds
    const quietFrom = Date.now()
    await page.waitForTimeout(15_000)
    const background = counted(quietFrom, Date.now())
    sample.todayBackgroundPage = background.page
    sample.todayBackgroundWorker = background.worker
    sample.todayBackgroundWorkerScreens = background.workerPages

    // A visit from Today
    const visitId = visits[round % visits.length]
    start = Date.now()
    scriptBytes = 0
    countScripts = true
    await visible(page.locator(`a[href="/app/visits/${visitId}"]`)).first().click()
    await expect(page).toHaveURL(new RegExp(`/app/visits/${visitId}`))
    await expect(visible(page.getByRole('heading', { level: 1 })).first()).toBeVisible()
    await expect(visible(page.getByRole('group', { name: 'Usual charges' }))).toBeVisible()
    sample.openVisit = Date.now() - start
    countScripts = false
    sample.openVisitScriptKB = Math.round(scriptBytes / 1024)
    sample.openVisitServerReply = visitReplies.at(-1) ?? -1

    // A charge, one tap: until the server has it
    const chip = visible(page.getByRole('group', { name: 'Usual charges' })).getByRole('button').first()
    start = Date.now()
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && !!r.request().headers()['next-action'] && r.url().includes('/app/visits/'), { timeout: 60_000 })
    await chip.click()
    await saved
    sample.saveCharge = Date.now() - start
    const afterSave = Date.now()
    await page.waitForTimeout(10_000)
    const saveBackground = counted(afterSave, Date.now())
    sample.afterSaveWorkerScreens = saveBackground.workerPages
    sample.afterSavePage = saveBackground.page

    // The patient's page, from the visit
    start = Date.now()
    await visible(page.locator('a[href^="/app/patients/"]').filter({ has: page.getByRole('heading', { level: 1 }) })).first().click()
    await expect(page).toHaveURL(/\/app\/patients\/[0-9a-f-]{36}$/)
    await expect(visible(page.getByRole('heading', { level: 1 })).first()).toBeVisible()
    sample.openPatient = Date.now() - start

    // Back to Today from the bottom bar
    start = Date.now()
    await visible(page.getByRole('link', { name: 'Today', exact: true })).first().click()
    await expect(page).toHaveURL(/\/app$/)
    await expect(visible(page.getByRole('heading', { name: /^Today/ }))).toBeVisible()
    sample.backToToday = Date.now() - start

    samples.push(sample)
  }

  measuring = false
  const keys = Object.keys(samples[0])
  const result = Object.fromEntries(keys.map((k) => [k, median(samples.map((s) => s[k]))]))
  const totals = { pageRequests: requests.filter((r) => !r.worker).length, workerRequests: requests.filter((r) => r.worker).length, workerScreens: requests.filter((r) => r.worker && r.url.startsWith('/app')).length }
  console.log(JSON.stringify({ median: result, samples, totals }, null, 2))
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify({ median: result, samples, totals }, null, 2))
})
