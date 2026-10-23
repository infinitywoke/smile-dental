import path from 'node:path'
import { expect, test } from '@playwright/test'
import { inIndia } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, signIn, testDb, visible } from './helpers'

// The installed app on the phone: shortcuts on its icon, and photos shared to it from the gallery or
// WhatsApp, which go to the visit chosen and upload there. The share is the form Android sends to
// /app/share; the service worker keeps the photos on the phone first (public/sw.js).
const runId = newRunId()
const today = inIndia(new Date()).date
const fixture = path.join(__dirname, 'fixtures', 'tooth.png')

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => { await cleanRun(runId) })

test('a photo shared from another app goes to the visit chosen, and uploads there', async ({ page }) => {
  const visitId = await createVisit(await createPatient(`${runId} Shared`, newPhone('7')), today, 300)
  await signIn(page)
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/app'))?.active?.state), { timeout: 30_000 }).toBe('activated')
  await page.goto('/app')

  // What Android sends when a photo is shared to Clinic OS
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
  await page.setInputFiles('#share-photos', fixture)
  await page.evaluate(() => (document.getElementById('share-photos')!.closest('form') as HTMLFormElement).submit())

  await expect(page).toHaveURL(/\/app\/share$/)
  await expect(visible(page.getByAltText('Shared photo 1'))).toBeVisible()
  await visible(page.getByRole('button', { name: new RegExp(`${runId} Shared`) })).click()
  await expect(page).toHaveURL(new RegExp(`/app/visits/${visitId}$`))
  const { supabase } = await testDb()
  await expect.poll(async () => (await supabase.from('visit_photos').select('id').eq('visit_id', visitId)).data?.length ?? 0, { timeout: 45_000 }).toBe(1)
})

test('the installed app has Today, Walk-in and Patients on its icon, and takes shared photos', async ({ request }) => {
  const manifest = await (await request.get('/clinic.webmanifest')).json()
  expect(manifest.shortcuts.map((s: { name: string; url: string }) => [s.name, s.url])).toEqual([['Today', '/app'], ['Walk-in', '/app/patients/new'], ['Patients', '/app/patients']])
  expect(manifest.share_target).toMatchObject({ action: '/app/share', method: 'POST', enctype: 'multipart/form-data' })
})
