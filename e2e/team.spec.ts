import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createAppointment, createPatient, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'
import { blockInstant } from '../src/lib/schedule'

// Chairs and dentists: the owner keeps them in Clinic settings. With more than one, a booking says who sees the
// patient and Today says where; a dentist already busy is refused, and booked only on an explicit yes.
test.skip(!testLogin, NO_TEST_LOGIN)

const runId = newRunId()
const chair = `${runId} Chair`
const specialist = `${runId} Visiting`

test.afterAll(async () => {
  await cleanRun(runId)
  // Taken out of use, so the test clinic is back to one chair and one dentist for the other specs
  const { supabase } = await testDb()
  await supabase.from('chairs').update({ active: false }).eq('name', chair)
  await supabase.from('dentists').update({ active: false }).eq('name', specialist)
})

test('the owner adds a chair and a visiting specialist; two chairs at once needs an explicit yes', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/settings/clinic')
  await visible(page.getByLabel("New chair's name")).fill(chair)
  await visible(page.getByRole('button', { name: 'Add', exact: true })).click()
  await expect(visible(page.getByRole('region', { name: 'Chairs' })).getByText(chair)).toBeVisible()
  await visible(page.getByLabel("Dentist's full name")).fill(specialist)
  await visible(page.getByLabel('Visiting specialist')).check()
  await visible(page.getByRole('button', { name: 'Add dentist' })).click()
  await expect(visible(page.getByRole('region', { name: 'Dentists' })).getByText(specialist)).toBeVisible()

  // The dentist has a patient at 10:00; another is booked for the same time, with the same dentist
  const day = openDay(3)
  const first = await createPatient(`${runId} First`, newPhone())
  const second = await createPatient(`${runId} Second`, newPhone())
  await createAppointment(first, day, '10:00')
  await page.goto(`/app/book?at=${encodeURIComponent(blockInstant(day, '10:00'))}&patient=${second}`)
  await expect(visible(page.getByText('Who will see them?'))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Book appointment' })).click()
  const asked = visible(page.getByRole('alert')).filter({ hasText: `${runId} First` })
  await expect(asked).toContainText('already has')

  // Nothing is booked yet: only the answer does
  const { supabase } = await testDb()
  const booked = () => supabase.from('appointments').select('chair_id, two_chairs').eq('patient_id', second).eq('status', 'booked')
  expect((await booked()).data).toHaveLength(0)
  await asked.getByRole('button', { name: 'Yes, two chairs at once' }).click()
  await expect(visible(page.getByRole('heading', { name: 'Booked' }))).toBeVisible()
  const { data: two } = await booked()
  expect(two).toHaveLength(1)
  expect(two![0].two_chairs).toBe(true)

  // Today says where each patient is
  await page.goto(`/app?d=${day}`)
  await expect(visible(page.getByRole('link', { name: new RegExp(`${runId} Second`) }))).toContainText(chair)

  // A third at that time, with the visiting specialist: the website's own rule is a chair each
  const third = await createPatient(`${runId} Third`, newPhone())
  await page.goto(`/app/book?at=${encodeURIComponent(blockInstant(day, '10:00'))}&patient=${third}`)
  await expect(visible(page.getByRole('button', { name: 'Book appointment' }))).toHaveCount(0)
})
