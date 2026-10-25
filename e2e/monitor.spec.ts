import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { inIndia } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, signIn, testDb, visible } from './helpers'

// A photo from the chair monitor: Monitor on the visit scans the QR code the monitor shows and pulls the
// photo into the visit. The camera and its QR reader are stood in for (a phone's camera can't be used
// here), and so is the monitor at 192.168.1.1. Where the monitor won't let the app read the photo, the
// share sheet brings it straight to the visit instead.
const runId = newRunId()
const today = inIndia(new Date()).date
const photo = readFileSync(path.join(__dirname, 'fixtures', 'tooth.png'))
const ADDRESS = 'http://192.168.1.1/store/00017.jpg'

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => { await cleanRun(runId) })

// The camera shows a blank picture, and the QR reader reads the monitor's code from it
async function fakeCamera(page: Page) {
  await page.addInitScript((code) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const draw = () => {
      canvas.getContext('2d')!.fillRect(0, 0, 64, Math.random() * 64)
      setTimeout(draw, 100)
    }
    draw()
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(10)
    ;(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
      async detect() { return [{ rawValue: code }] }
    }
  }, ADDRESS)
}

const photosOf = async (visitId: string) => (await (await testDb()).supabase.from('visit_photos').select('id').eq('visit_id', visitId)).data?.length ?? 0

test('scanning the QR code pulls the photo into the visit', async ({ page }) => {
  const visitId = await createVisit(await createPatient(`${runId} Pulled`, newPhone('7')), today, 300)
  await fakeCamera(page)
  // The monitor lets the app read the photo
  await page.route(ADDRESS, (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: photo, headers: { 'Access-Control-Allow-Origin': '*' } }))
  await signIn(page)
  await page.goto(`/app/visits/${visitId}`)

  await visible(page.getByRole('button', { name: 'Monitor' })).click()
  // Straight to the camera, with the monitor's Wi-Fi said above it; the photo comes in by itself
  await expect.poll(() => photosOf(visitId), { timeout: 45_000 }).toBe(1)
  await expect(page.getByRole('dialog', { name: 'Photo from the monitor' })).toHaveCount(0)
  await expect(visible(page.getByRole('heading', { name: 'Photos' }))).toBeVisible()
})

test("where the monitor won't let the app read it, Open the photo and Share image bring it to the same visit", async ({ page }) => {
  const visitId = await createVisit(await createPatient(`${runId} Shared`, newPhone('6')), today, 300)
  await fakeCamera(page)
  // The browser refuses the app the photo (no permission for the local network, or no CORS header from the monitor)
  await page.route(ADDRESS, (route) => route.abort('blockedbyclient'))
  await signIn(page)
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/app'))?.active?.state), { timeout: 30_000 }).toBe('activated')
  await page.goto(`/app/visits/${visitId}`)

  await visible(page.getByRole('button', { name: 'Monitor' })).click()
  const sheet = page.getByRole('dialog', { name: 'Photo from the monitor' })
  await expect(visible(sheet.getByRole('link', { name: 'Open the photo' }))).toHaveAttribute('href', ADDRESS)
  await expect(sheet.getByText('This phone on the Intellicam monitor')).toBeVisible()

  // What Android sends when Chrome's "Share image" picks Clinic OS: it goes to the visit that asked, not a list
  await page.evaluate(() => {
    const form = document.createElement('form')
    form.method = 'post'
    form.action = '/app/share'
    form.enctype = 'multipart/form-data'
    const input = document.createElement('input')
    input.type = 'file'
    input.name = 'photos'
    input.id = 'share-photos'
    form.append(input)
    document.body.append(form)
  })
  await page.setInputFiles('#share-photos', { name: '00017.jpg', mimeType: 'image/jpeg', buffer: photo })
  await page.evaluate(() => (document.getElementById('share-photos')!.closest('form') as HTMLFormElement).submit())
  await expect(page).toHaveURL(new RegExp(`/app/visits/${visitId}$`))
  await expect.poll(() => photosOf(visitId), { timeout: 45_000 }).toBe(1)
})
