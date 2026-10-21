import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, makeRequest, newRunId, signIn, testDb, visible } from './helpers'

// The patient voice note test: each website visitor sees one of two versions on the booking card.
// Nothing is sent from the website here (a real request would go to the clinic's own account).
const runId = newRunId()

test.skip(!testLogin, NO_TEST_LOGIN)
// A pretend microphone, already allowed, so the recorder can be tried without a person speaking
test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
})

test('recorder version: the patient can record, hear and remove a voice note on the booking card', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('smile_voice_variant', 'page'))
  await page.goto('/book')
  const card = page.locator('#book')
  await expect(card.getByText("Tell Dr. Rahil what's bothering you")).toBeVisible()
  await card.getByRole('button', { name: 'Tap to record (up to 1 minute)' }).click()
  const stop = card.getByRole('button', { name: /^Stop \(0:0\d of 1:00\)$/ })
  await expect(stop).toBeVisible()
  await page.waitForTimeout(2200)
  await stop.click()
  await expect(card.getByLabel('Your voice note')).toBeVisible()
  await card.getByRole('button', { name: 'Remove' }).click()
  await expect(card.getByRole('button', { name: 'Tap to record (up to 1 minute)' })).toBeVisible()
})

test('WhatsApp version: the booking card explains how to send a voice note after Send, with no recorder', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('smile_voice_variant', 'whatsapp'))
  await page.goto('/book')
  const card = page.locator('#book')
  await expect(card.getByText("Tell Dr. Rahil what's bothering you, in a voice note")).toBeVisible()
  await expect(card.getByText(/hold the microphone button/)).toBeVisible()
  await expect(card.getByRole('button', { name: 'Tap to record (up to 1 minute)' })).toHaveCount(0)
})

test('Clinic OS plays a voice note on the request card, and says when one was asked for on WhatsApp', async ({ page }) => {
  const recorded = await makeRequest(runId, 'Voice', '12:30', 2)
  const asked = await makeRequest(runId, 'Asked', '14:30', 2)
  const { supabase } = await testDb()
  // A tiny WebM file stands in for the recording; the same rules as the website apply
  const path = `${recorded.id}.webm`
  const { error: uploadError } = await supabase.storage.from('request-voice')
    .upload(path, new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm' }), { contentType: 'audio/webm' })
  expect(uploadError).toBeNull()
  expect((await supabase.rpc('set_request_voice', { p_request: recorded.id, p_variant: 'page', p_path: path })).error).toBeNull()
  expect((await supabase.rpc('set_request_voice', { p_request: asked.id, p_variant: 'whatsapp', p_path: null })).error).toBeNull()

  try {
    await signIn(page)
    const card = (name: string) => visible(page.locator('div.rounded-2xl').filter({ hasText: name })).last()
    await expect(card(recorded.requestName).getByLabel(`Voice note from ${recorded.requestName}`)).toBeVisible()
    await expect(card(asked.requestName)).toContainText('Asked to send a voice note on WhatsApp')
  } finally {
    await supabase.storage.from('request-voice').remove([path])
    await cleanRun(runId)
  }
})
