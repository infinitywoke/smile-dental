import { expect, test } from '@playwright/test'
import { formatDate } from '../src/lib/dates'
import { HOLIDAYS, holidayName } from '../src/lib/holidays'
import { ALL_BLOCKS, addDays, blockInstant, inIndia, isClosedDay } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createAppointmentAtFirstFree, createPatient, createVisit, newPhone, newRunId, openDay, showMonth, signIn, testDb, visible } from './helpers'

// The calendar on every day picker (Today's date, the next visit, the booking screens): days, months and
// years, each day with its holiday or festival (src/lib/holidays.ts), how many are booked, and whether
// the clinic is closed. The holidays tested are the next ones in the list, so the tests keep working
// as the dates go by.
const runId = newRunId()
const today = inIndia(new Date()).date
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const monthYear = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonth = (date: string) => `${Number(date.slice(8))} ${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' })}`
const todayLabel = formatDate(today, { weekday: 'short', day: 'numeric', month: 'short' })

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => { await cleanRun(runId) })

test("Today's calendar marks each holiday and festival, the day's title says it, and so does booking that day", async ({ page }) => {
  const soon = HOLIDAYS.find((h) => h.date >= today && h.date <= addDays(today, 13))
  test.skip(!soon, 'No holiday or festival in the next two weeks')
  const name = holidayName(soon!.date)!
  const label = soon!.kind === 'holiday' ? 'Holiday' : 'Festival'
  await signIn(page)
  await visible(page.getByRole('button', { name: todayLabel })).click()
  const sheet = page.getByRole('dialog', { name: 'Pick a day' })
  if (soon!.date.slice(0, 7) !== today.slice(0, 7)) await sheet.getByRole('button', { name: 'Next month' }).click()
  await sheet.getByRole('group', { name: /^Days of / }).getByRole('button', { name: new RegExp(`\\b${dayMonth(soon!.date)}\\b: ${escape(soon!.name)}`) }).click()
  await expect(page).toHaveURL(soon!.date === today ? /\/app$/ : new RegExp(`d=${soon!.date}`))
  await expect(visible(page.getByText(`${label}: ${name}`))).toBeVisible()

  await page.goto(`/app/book?d=${soon!.date}`)
  await expect(visible(page.getByText(`${label}: ${name}`))).toBeVisible()
})

test('the calendar has days, months and years, and shows how many are booked on a day', async ({ page }) => {
  // One booked a few days on
  const day = openDay(5)
  const booked = await createAppointmentAtFirstFree(await createPatient(`${runId} Booked`, newPhone('7')), day, ALL_BLOCKS)
  expect(booked).not.toBeNull()
  await signIn(page)
  await visible(page.getByRole('button', { name: todayLabel })).click()
  const sheet = page.getByRole('dialog', { name: 'Pick a day' })
  if (day.slice(0, 7) !== today.slice(0, 7)) await sheet.getByRole('button', { name: 'Next month' }).click()
  await expect(sheet.getByRole('group', { name: /^Days of / }).getByRole('button', { name: new RegExp(`\\b${dayMonth(day)}\\b.*\\d+ booked`) })).toBeVisible()

  // Up to the months, then the years: a day a year and a half on
  const year = Number(today.slice(0, 4)) + 1
  await sheet.getByRole('button', { name: /: choose another month$/ }).click()
  await sheet.getByRole('button', { name: /: choose another year$/ }).click()
  await sheet.getByRole('group', { name: 'Years' }).getByRole('button', { name: String(year) }).click()
  await sheet.getByRole('group', { name: `Months of ${year}` }).getByRole('button', { name: new RegExp(`^June ${year}`) }).click()
  await sheet.getByRole('group', { name: `Days of June ${year}` }).getByRole('button', { name: /\b15 June\b/ }).click()
  await expect(page).toHaveURL(new RegExp(`d=${year}-06-15`))

  // A booking screen's day opens the same calendar, and goes to the day picked
  await page.goto(`/app/book?d=${day}`)
  await visible(page.getByRole('button', { name: /: pick another day$/ })).click()
  const picker = page.getByRole('dialog', { name: 'Pick a day' })
  const target = openDay(9)
  if (target.slice(0, 7) !== day.slice(0, 7)) await picker.getByRole('button', { name: 'Next month' }).click()
  await picker.getByRole('group', { name: /^Days of / }).getByRole('button', { name: new RegExp(`\\b${dayMonth(target)}\\b`) }).click()
  await expect(page).toHaveURL(new RegExp(`/app/book\\?d=${target}`))
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
    const days = picker.getByRole('group', { name: /^Days of / })

    // The holiday's month: listed under the calendar, and its day says it once picked
    await showMonth(picker, coming!.date.slice(0, 7))
    await expect(picker.getByRole('list', { name: `Holidays in ${monthYear(coming!.date)}` })).toContainText(coming!.name)
    await days.getByRole('button', { name: new RegExp(`\\b${dayMonth(coming!.date)}\\b: ${escape(coming!.name)}`) }).click()
    await expect(picker.getByText(`Holiday: ${holidayName(coming!.date)}`)).toBeVisible()

    // The blocked day can't be picked, and is listed as closed
    await showMonth(picker, blocked.slice(0, 7))
    await expect(days.getByRole('button', { name: new RegExp(`\\b${dayMonth(blocked)}\\b.*clinic closed`) })).toBeDisabled()
    await expect(picker.getByRole('list', { name: `Holidays in ${monthYear(blocked)}` })).toContainText('Clinic closed')
  } finally {
    if (off) await supabase.from('time_off').delete().eq('id', off.id)
  }
})
