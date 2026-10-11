import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createAppointment, createPatient, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'
import { inIndia } from '../src/lib/schedule'

// Today (one list, Start buttons), finding patients, the New patient form (age, Back, errors),
// the patient page, and Sign out.
const runId = newRunId()
const patientName = `${runId} Known`
const phone = newPhone()
const bookedName = `${runId} Booked`
const bookedPhone = newPhone('8')
const today = inIndia(new Date()).date

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
let bookedId = ''

test.beforeAll(async ({ browser }) => {
  await createPatient(patientName, phone)
  bookedId = await createPatient(bookedName, bookedPhone)
  // Booked today (when the clinic is open) and again in two days
  if (openDay(0) === today) await createAppointment(bookedId, today, '19:00')
  await createAppointment(bookedId, openDay(2), '12:30')
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await page?.close()
  await cleanRun(runId)
})

test('Today is one list with no search box, no menu and no practice banner', async () => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0)
  await expect(page.getByPlaceholder('Search name or phone')).toHaveCount(0)
  await expect(page.getByText(/Practice mode|TEST/)).toHaveCount(0)
  await expect(page.getByText('Back to today')).toHaveCount(0)
})

test('a booked patient has a Start button that opens the visit', async () => {
  test.skip(openDay(0) !== today, 'The clinic is closed today, so nothing can be booked for today')
  await page.goto('/app')
  const row = visible(page.locator('div.rounded-2xl').filter({ hasText: bookedName }))
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/)
})

test('finds the patient by phone while typing, with no Search button', async () => {
  await page.getByRole('link', { name: 'Patients', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients$/)
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0)
  await visible(page.getByPlaceholder('Search name or phone')).fill(phone.slice(0, 7))

  await expect(visible(page.getByText(/^1 result for/))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toHaveCount(1)
  await visible(page.getByRole('link').filter({ hasText: patientName })).click()
  await expect(page).toHaveURL(/\/app\/patients\/[0-9a-f-]+$/)
})

test('the patient page leads with Start visit, and Move and Cancel sit side by side', async () => {
  await page.goto(`/app/patients/${bookedId}`)
  const buttons = visible(page.locator('main a, main button'))
  await expect(visible(page.getByRole('heading', { name: bookedName }))).toBeVisible()
  // Start visit (or Open today's visit) is the first big button, and nothing is owed
  await expect(buttons.filter({ hasText: /Start visit|Open today/ }).first()).toBeVisible()
  await expect(page.getByText(/^Collect/)).toHaveCount(0)
  await expect(visible(page.getByRole('link', { name: 'Book appointment' }))).toBeVisible()

  const move = visible(page.getByRole('link', { name: 'Move', exact: true })).first()
  const cancel = visible(page.getByRole('button', { name: 'Cancel appointment' })).first()
  const [m, c] = [await move.boundingBox(), await cancel.boundingBox()]
  expect(Math.abs(m!.y - c!.y)).toBeLessThan(2)
  expect(m!.height).toBeGreaterThanOrEqual(48)
  expect(c!.height).toBeGreaterThanOrEqual(48)
})

test('"+" opens New patient directly, spots a returning number, and keeps typing after Back', async () => {
  await page.goto('/app')
  await visible(page.getByRole('link', { name: 'New patient' })).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await expect(visible(page.getByText('Already a patient with this number'))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toBeVisible()

  // The age asks for the number keypad; the heard-from answers are chips only
  await expect(visible(page.getByLabel(/^Age/))).toHaveAttribute('inputmode', 'numeric')
  await expect(page.getByPlaceholder('Or type…')).toHaveCount(0)

  await visible(page.getByLabel('Name')).fill(`${runId} half typed`)
  await page.goBack()
  await visible(page.getByRole('link', { name: 'New patient' })).click()
  await expect(visible(page.getByLabel('Name'))).toHaveValue(`${runId} half typed`)
})

test('without a gender the message shows just above the button', async () => {
  const start = visible(page.getByRole('button', { name: 'Start visit' }))
  await start.click()
  const alert = visible(page.getByText(/choose the patient/))
  await expect(alert).toContainText('gender')
  const [a, b] = [await alert.boundingBox(), await start.boundingBox()]
  expect(b!.y - (a!.y + a!.height)).toBeLessThan(24)
})

test('saves with a name and gender, stores the age as a birth year and opens the visit', async () => {
  await visible(page.getByLabel('WhatsApp number')).fill('')
  await visible(page.getByRole('radio', { name: 'Female' })).click()
  await visible(page.getByLabel(/^Age/)).fill('40')
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/)

  const { supabase } = await testDb()
  const { data } = await supabase.from('patients').select('name, birth_year, gender').like('name', `${runId} Half%`)
  expect(data).toEqual([{ name: `${runId} Half Typed`, birth_year: Number(today.slice(0, 4)) - 40, gender: 'female' }])

  // Back never returns to a form that would save the patient again, and the next form starts empty
  await visible(page.getByRole('link', { name: 'Patients', exact: true })).click()
  await visible(page.getByRole('link', { name: 'New patient' })).click()
  await expect(visible(page.getByLabel('Name'))).toHaveValue('')
})

test('Sign out is at the bottom of Patients', async () => {
  await page.goto('/app/patients')
  await visible(page.getByRole('button', { name: 'Sign out' })).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login/)
})
