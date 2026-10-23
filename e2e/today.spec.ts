import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import {
  blocksLeftToday, cleanRun, createAppointment, createAppointmentAtFirstFree, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible,
} from './helpers'
import { addDays, formatBlock, inIndia } from '../src/lib/schedule'

// Today (one list, Start buttons, seen rows, money owed), finding patients (and a failed search),
// the New patient form (age, Back, Start fresh, errors), the patient page, and Sign out.
const runId = newRunId()
const patientName = `${runId} Known`
const phone = newPhone()
const bookedName = `${runId} Booked`
const bookedPhone = newPhone('8')
const today = inIndia(new Date()).date
// Seen today with money still owed, and someone who owes from an earlier visit. Large amounts, so
// they are among the few dues Today lists whatever else the test account holds.
const seenName = `${runId} Seen Venkataramana Shetty Kodavoor`
const owesName = `${runId} Owes`

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

const bothName = `${runId} Both`

let page: Page
let bookedId = ''
// The 7:00 PM booking today: the database refuses it once that time is over (or on a Friday)
let bookedToday = false
// A visit listed today plus a later booking the same day
let bothBookedAt: string | null = null

test.beforeAll(async ({ browser }) => {
  await createPatient(patientName, phone)
  bookedId = await createPatient(bookedName, bookedPhone)
  // Booked today (while 7:00 PM is still ahead on an open day) and again in two days
  if (openDay(0) === today) bookedToday = !!(await createAppointmentAtFirstFree(bookedId, today, ['19:00']))
  await createAppointment(bookedId, openDay(2), '12:30')
  const bothId = await createPatient(bothName, newPhone('5'))
  await createVisit(bothId, today, 500)
  bothBookedAt = (await createAppointmentAtFirstFree(bothId, today, blocksLeftToday(10).filter((t) => t !== '19:00')))?.time ?? null
  await createVisit(await createPatient(seenName, newPhone('7')), today, 80_000, 20_000)
  await createVisit(await createPatient(owesName, newPhone('6')), addDays(today, -1), 90_000)
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

test('a seen patient shows the whole name, with the time and badges under it, and is not repeated in Needs you', async () => {
  await page.goto('/app')
  const row = visible(page.getByRole('link').filter({ hasText: seenName }))
  await expect(row).toHaveCount(1)
  const name = row.getByText(seenName, { exact: true })
  await expect(name).toBeVisible()
  // Nothing cut off: the name fits on its line(s)
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  const time = row.getByText(/^\d{1,2}:\d{2}\s?(am|pm)$/i)
  const [n, t] = [await name.boundingBox(), await time.boundingBox()]
  expect(t!.y).toBeGreaterThanOrEqual(n!.y + n!.height - 1)
  await expect(row).toContainText('₹60,000 due')
  await expect(row).not.toContainText('billed')

  // The amount owed shows once, on the row; a due from an earlier visit is still in Needs you
  await expect(visible(page.getByRole('link').filter({ hasText: seenName }).filter({ hasText: 'Collect' }))).toHaveCount(0)
  await expect(visible(page.getByRole('link').filter({ hasText: owesName }).filter({ hasText: 'Collect' }))).toHaveCount(1)

  // Collect lands on that visit's payment card
  await visible(page.getByRole('link').filter({ hasText: owesName }).filter({ hasText: 'Collect' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[^/?]+\?step=bill$/)
  await expect(visible(page.locator('#payment'))).toBeInViewport()
  await expect(visible(page.locator('#payment-amount'))).toHaveValue('90000')
})

test("a patient's visit is listed and their later booking that day still shows, each once", async () => {
  test.skip(!bothBookedAt, 'No clinic time is left today to book')
  await page.goto('/app')
  const seen = visible(page.getByRole('link').filter({ hasText: bothName }).filter({ hasText: '₹500 due' }))
  await expect(seen).toHaveCount(1)
  const booked = visible(page.getByRole('list', { name: 'Schedule' }).getByRole('listitem').filter({ hasText: bothName }).filter({ has: page.getByRole('button', { name: 'Start', exact: true }) }))
  await expect(booked).toHaveCount(1)
  await expect(booked).toContainText(formatBlock(bothBookedAt!))
  // The row shows the whole amount owed, so Needs you doesn't repeat it
  await expect(visible(page.getByRole('link').filter({ hasText: bothName }).filter({ hasText: 'Collect' }))).toHaveCount(0)
})

test('a booked patient has a Start button that opens the visit', async () => {
  test.skip(!bookedToday, 'Nothing could be booked for 7:00 PM today (the clinic is closed, or that time is over)')
  await page.goto('/app')
  const row = visible(page.getByRole('list', { name: 'Schedule' }).getByRole('listitem').filter({ hasText: bookedName }))
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

test('a search that fails says so and leaves no list on screen', async () => {
  await page.goto('/app/patients')
  const box = visible(page.getByPlaceholder('Search name or phone'))
  await expect(visible(page.getByText('Newest patients'))).toBeVisible()
  await expect(visible(page.locator('main ul li')).first()).toBeVisible()
  // The search reaches the server as a POST to this page; make it fail as on a dead connection
  await page.route('**/app/patients', (route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue()))
  await box.fill(phone.slice(0, 7))
  await expect(visible(page.getByText(/Couldn.t search\. Check the internet\./))).toBeVisible()
  await expect(visible(page.getByText(/results? for/))).toHaveCount(0)
  await expect(visible(page.locator('main ul li'))).toHaveCount(0)

  // Back online, the next search works again
  await page.unroute('**/app/patients')
  await box.fill(phone.slice(0, 8))
  await expect(visible(page.getByText(/^1 result for/))).toBeVisible()
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
  await visible(page.getByRole('link', { name: 'Walk-in' })).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)
  await expect(visible(page.getByText('Already a patient with this number'))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toBeVisible()

  // The date of birth asks for the number keypad; the heard-from answers are chips only
  for (const part of ['Day', 'Month', 'Year']) await expect(visible(page.getByLabel(part, { exact: true }))).toHaveAttribute('inputmode', 'numeric')
  await expect(page.getByPlaceholder('Or type…')).toHaveCount(0)

  await visible(page.getByLabel('Name')).fill(`${runId} half typed`)
  await visible(page.getByLabel('Medical alerts')).fill('Asthma')
  await page.goBack()
  await visible(page.getByRole('link', { name: 'Walk-in' })).click()
  await expect(visible(page.getByLabel('Name'))).toHaveValue(`${runId} half typed`)
  // Coming back, the form says whose typing it is
  await expect(visible(page.getByText(`Continuing ${runId} half typed`))).toBeVisible()
})

test('Start fresh empties every field and the returning-patient box', async () => {
  const fresh = visible(page.getByRole('button', { name: 'Start fresh' }))
  expect((await fresh.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await visible(page.getByRole('radio', { name: 'Male', exact: true })).click()
  await fresh.click()
  for (const label of ['WhatsApp number', 'Name', 'Medical alerts']) await expect(visible(page.getByLabel(label))).toHaveValue('')
  await expect(visible(page.getByRole('radio', { name: 'Male', exact: true }))).toHaveAttribute('aria-checked', 'false')
  await expect(visible(page.getByText('Already a patient with this number'))).toHaveCount(0)
  await expect(visible(page.getByText(/^Continuing/))).toHaveCount(0)
  await expect(visible(page.getByRole('button', { name: 'Start fresh' }))).toHaveCount(0)

  // Typing again brings Start fresh back
  await visible(page.getByLabel('Name')).fill(`${runId} half typed`)
  await expect(visible(page.getByRole('button', { name: 'Start fresh' }))).toBeVisible()
})

test('without a gender the message shows just above the button', async () => {
  const start = visible(page.getByRole('button', { name: 'Start visit' }))
  await start.click()
  const alert = visible(page.getByText(/choose the patient/))
  await expect(alert).toContainText('gender')
  const [a, b] = [await alert.boundingBox(), await start.boundingBox()]
  expect(b!.y - (a!.y + a!.height)).toBeLessThan(24)
})

test('saves with a name and gender, keeps the date of birth (and its year) and opens the visit', async () => {
  await visible(page.getByRole('radio', { name: 'Female' })).click()
  await visible(page.getByLabel('Day', { exact: true })).fill('12')
  await visible(page.getByLabel('Month', { exact: true })).fill('3')
  await visible(page.getByLabel('Year', { exact: true })).fill('1985')
  const age = Number(today.slice(0, 4)) - 1985 - (today.slice(5) < '03-12' ? 1 : 0)
  await expect(visible(page.getByText(`${age} yrs`, { exact: true }))).toBeVisible()
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/)

  const { supabase } = await testDb()
  const { data } = await supabase.from('patients').select('name, birth_year, birth_date, gender').like('name', `${runId} Half%`)
  expect(data).toEqual([{ name: `${runId} Half Typed`, birth_year: 1985, birth_date: '1985-03-12', gender: 'female' }])

  // Back never returns to a form that would save the patient again, and the next form starts empty
  await visible(page.getByRole('link', { name: 'Patients', exact: true })).click()
  await visible(page.getByRole('link', { name: 'Walk-in' })).click()
  await expect(visible(page.getByLabel('Name'))).toHaveValue('')
  await expect(visible(page.getByRole('button', { name: 'Start fresh' }))).toHaveCount(0)
})

test('when only the age is known, "Only know the age?" keeps it as a birth year', async () => {
  await visible(page.getByLabel('Name')).fill(`${runId} only age`)
  await visible(page.getByRole('radio', { name: 'Male', exact: true })).click()
  await visible(page.getByRole('button', { name: 'Only know the age?' })).click()
  await expect(visible(page.getByLabel(/^Age/))).toHaveAttribute('inputmode', 'numeric')
  await visible(page.getByLabel(/^Age/)).fill('40')
  await visible(page.getByRole('button', { name: 'Start visit' })).click()
  await expect(page).toHaveURL(/\/app\/visits\/[0-9a-f-]+$/)
  const { supabase } = await testDb()
  const { data } = await supabase.from('patients').select('birth_year, birth_date').like('name', `${runId} Only%`)
  expect(data).toEqual([{ birth_year: Number(today.slice(0, 4)) - 40, birth_date: null }])
})

test('on a birthday the patient page and the visit say so, with the age from the date of birth', async () => {
  // Born in a leap year, so even a 29 February today is a real date of birth
  const born = `1992-${today.slice(5)}`
  const patientId = await createPatient(`${runId} Birthday`, newPhone('8'))
  const { supabase } = await testDb()
  await supabase.from('patients').update({ birth_date: born, birth_year: 1992 }).eq('id', patientId)
  await page.goto(`/app/patients/${patientId}`)
  await expect(visible(page.getByText('Birthday today'))).toBeVisible()
  await expect(visible(page.getByText(`${Number(today.slice(0, 4)) - 1992} yrs`))).toBeVisible()
  const visitId = await createVisit(patientId, today, 300)
  await page.goto(`/app/visits/${visitId}`)
  await expect(visible(page.getByText('Birthday today'))).toBeVisible()
})

test('Sign out is at the bottom of Patients', async () => {
  await page.goto('/app/patients')
  await visible(page.getByRole('button', { name: 'Sign out' })).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login/)
})
