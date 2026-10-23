import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { kannadaTime } from '../src/lib/whatsapp'
import { cleanRun, createAppointmentAtFirstFree, newPhone, newRunId, openDay, signIn, testDb, visible, whatsappText } from './helpers'

// Kannada for patients who prefer it: chosen on their record, then every message to them is in Kannada.
// Settings shows each message, with the English one beside it.
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

test.afterAll(async () => {
  await cleanRun(runId)
})

test('Settings shows every patient message in Kannada, with the English one beside it', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/settings')
  await visible(page.getByRole('link', { name: 'Messages in Kannada' })).click()
  await expect(page).toHaveURL(/\/app\/settings\/messages$/)
  await expect(visible(page.getByRole('heading', { level: 2 }))).toHaveCount(10)
  await expect(visible(page.getByText('ಖಚಿತವಾಗಿದೆ')).first()).toBeVisible()
  await expect(visible(page.getByText(/ನಮಸ್ಕಾರ Prakash ಅವರೇ,/)).first()).toBeVisible()

  await visible(page.getByText('The English one')).first().click()
  await expect(visible(page.getByText(/Your appointment at Smile Dental Clinic is/)).first()).toBeVisible()
})

test('a patient set to Kannada on New patient gets their messages in Kannada; Edit sets English again', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/patients/new')
  const name = `${runId} Kannada`
  await visible(page.getByLabel('Name', { exact: true })).fill(name)
  await visible(page.getByLabel('WhatsApp number')).fill(newPhone('7'))
  await visible(page.getByRole('radio', { name: 'Male', exact: true })).click()
  const english = visible(page.getByRole('button', { name: 'English', exact: true }))
  const kannada = visible(page.getByRole('button', { name: 'ಕನ್ನಡ', exact: true }))
  await expect(english).toHaveAttribute('aria-pressed', 'true')
  await kannada.click()
  await visible(page.getByRole('checkbox', { name: /agree to the clinic keeping/ })).check()
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]{36}$/, { timeout: 30_000 })

  const { supabase } = await testDb()
  const { data } = await supabase.from('patients').select('id, language').eq('name', name).single()
  expect(data!.language).toBe('kn')
  const patientId = data!.id as string

  // A cancelled appointment's message, for one
  const booked = await createAppointmentAtFirstFree(patientId, openDay(3), ['10:00', '10:30', '11:00', '11:30', '12:00'])
  expect(booked).not.toBeNull()
  await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', booked!.id)
  await page.goto(`/app/appointments/${booked!.id}/cancelled`)
  const text = whatsappText((await visible(page.getByRole('link', { name: /on WhatsApp$/ })).getAttribute('href'))!)
  expect(text).toContain(`ನಮಸ್ಕಾರ ${runId} ಅವರೇ,`)
  expect(text).toContain('*ರದ್ದಾಗಿದೆ*')
  expect(text).toContain(`🕗 *${kannadaTime(booked!.time)}*`)
  expect(text).not.toContain('Dear')

  // The patient page says so; Edit sets English again
  await page.goto(`/app/patients/${patientId}`)
  await expect(visible(page.getByText(/WhatsApp in ಕನ್ನಡ/))).toBeVisible()
  await page.goto(`/app/patients/${patientId}/edit`)
  await expect(kannada).toHaveAttribute('aria-pressed', 'true')
  await english.click()
  await visible(page.getByRole('button', { name: 'Save changes' })).click()
  await expect(page).toHaveURL(new RegExp(`/app/patients/${patientId}$`))
  expect((await supabase.from('patients').select('language').eq('id', patientId).single()).data!.language).toBeNull()
})
