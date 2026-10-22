import { expect, test } from '@playwright/test'
import { formatDate } from '../src/lib/dates'
import { HOLIDAYS, holidayName } from '../src/lib/holidays'
import { addDays, blockInstant, inIndia, isClosedDay } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'

// Holidays and festivals (src/lib/holidays.ts) and the days the clinic is blocked off show wherever a
// day is picked: Today's two weeks and its title, the booking screens, the next visit's month calendar.
// The days tested are the next ones in the list, so the tests keep working as the dates go by.
const runId = newRunId()
const today = inIndia(new Date()).date
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const monthYear = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonth = (date: string) => `${Number(date.slice(8))} ${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' })}`

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => { await cleanRun(runId) })

test("Today's two weeks name each holiday and festival, the day's title says it, and so does booking that day", async ({ page }) => {
  const soon = HOLIDAYS.find((h) => h.date >= today && h.date <= addDays(today, 13))
  test.skip(!soon, 'No holiday or festival in the next two weeks')
  const name = holidayName(soon!.date)!
  const label = soon!.kind === 'holiday' ? 'Holiday' : 'Festival'
  await signIn(page)
  await visible(page.getByRole('button', { name: formatDate(today, { weekday: 'short', day: 'numeric', month: 'short' }) })).click()
  await visible(page.getByRole('link', { name: new RegExp(escape(soon!.name)) })).click()
  await expect(page).toHaveURL(soon!.date === today ? /\/app$/ : new RegExp(`d=${soon!.date}`))
  await expect(visible(page.getByText(`${label}: ${name}`))).toBeVisible()

  await page.goto(`/app/book?d=${soon!.date}`)
  await expect(visible(page.getByText(`${label}: ${name}`))).toBeVisible()
})

test("the next visit's calendar marks holidays, lists the month's, and closes a day blocked off", async ({ page }) => {
  const coming = HOLIDAYS.find((h) => h.kind === 'holiday' && h.date > today && !isClosedDay(h.date))
  test.skip(!coming, 'No holiday ahead in the list')
  // A day blocked off a few weeks on, as "Block the day" on Today does
  const blocked = openDay(40)
  const { supabase } = await testDb()
  const { data: off, error } = await supabase.from('time_off')
    .insert({ starts_at: blockInstant(blocked, '00:00'), ends_at: blockInstant(addDays(blocked, 1), '00:00'), note: `${runId} closed` })
    .select('id').single()
  expect(error).toBeNull()
  try {
    const visitId = await createVisit(await createPatient(`${runId} Holiday`, newPhone('7')), openDay(0), 300)
    await signIn(page)
    await page.goto(`/app/visits/${visitId}`)
    await visible(page.getByRole('button', { name: 'Pick another date' })).click()
    const picker = page.getByRole('dialog', { name: 'Next visit' })
    const month = picker.getByRole('combobox', { name: 'Month', exact: true })
    const days = picker.getByRole('group', { name: /^Days of / })

    // The holiday's month: listed under the calendar, and its day says it once picked
    await month.selectOption(coming!.date.slice(0, 7))
    await expect(picker.getByRole('list', { name: `Holidays in ${monthYear(coming!.date)}` })).toContainText(coming!.name)
    await days.getByRole('button', { name: new RegExp(`\\b${dayMonth(coming!.date)}\\b: ${escape(coming!.name)}`) }).click()
    await expect(picker.getByText(`Holiday: ${holidayName(coming!.date)}`)).toBeVisible()

    // The blocked day can't be picked, and is listed as closed
    await month.selectOption(blocked.slice(0, 7))
    await expect(days.getByRole('button', { name: new RegExp(`\\b${dayMonth(blocked)}\\b.*clinic closed`) })).toBeDisabled()
    await expect(picker.getByRole('list', { name: `Holidays in ${monthYear(blocked)}` })).toContainText('Clinic closed')
  } finally {
    if (off) await supabase.from('time_off').delete().eq('id', off.id)
  }
})
