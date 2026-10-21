import { expect, test, type Locator } from '@playwright/test'
import { addDays, inIndia, weekday } from '../src/lib/schedule'

// The new homepage (website D) at /preview. Nothing is sent: public requests go to the clinic's own
// account, so the test stops before a request would be saved, and reads the WhatsApp links instead.
const timeButton = /^\d{1,2}:\d{2} (AM|PM)$/
const today = inIndia(new Date()).date
const nextFriday = (() => {
  let d = addDays(today, 1)
  while (weekday(d) !== 5) d = addDays(d, 1)
  return d
})()
const farAway = weekday(addDays(today, 40)) === 5 ? addDays(today, 41) : addDays(today, 40)
const top = async (l: Locator) => (await l.boundingBox())!.y
const middle = async (l: Locator) => { const b = (await l.boundingBox())!; return b.y + b.height / 2 }

test.beforeEach(async ({ page }) => {
  await page.goto('/preview')
  await expect(page.getByRole('heading', { name: 'Book an appointment' })).toBeVisible()
})

test('on a phone the header is one row (clinic, call, menu), the menu holds the rest, and a bar keeps Book close', async ({ page }) => {
  const header = page.locator('header.h-header')
  const brand = header.getByRole('link', { name: /Smile Dental Clinic/ })
  const call = header.getByRole('link', { name: /^Call the clinic/ })
  const menu = header.getByRole('button', { name: 'Menu' })
  await expect(call).toHaveAttribute('href', 'tel:+916361816711')
  const row = await middle(brand)
  expect(Math.abs((await middle(call)) - row)).toBeLessThan(8)
  expect(Math.abs((await middle(menu)) - row)).toBeLessThan(8)

  await menu.click()
  const sheet = page.getByRole('navigation', { name: 'Menu' })
  await expect(sheet.getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', /maps\.app\.goo\.gl/)
  await expect(sheet.getByRole('link', { name: 'WhatsApp the clinic' })).toHaveAttribute('href', 'https://wa.me/916361816711')
  await expect(sheet.getByRole('link', { name: 'Call +91 63618 16711' })).toHaveAttribute('href', 'tel:+916361816711')
  await sheet.getByRole('link', { name: 'Treatments and prices' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page).toHaveURL(/#treatments$/)

  // The bottom bar offers WhatsApp and Book, and steps aside while the booking card is on screen
  const bar = page.locator('.h-mobile-bar')
  await expect(bar.getByRole('link', { name: 'Book appointment' })).toBeVisible()
  await page.locator('#book').scrollIntoViewIfNeeded()
  await expect(bar).toHaveClass(/away/)
})

test('on a wide screen every header button sits in one row', async ({ browser }, testInfo) => {
  const wide = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await wide.goto(`${testInfo.project.use.baseURL}/preview`)
  const header = wide.locator('header.h-header')
  const buttons = [
    header.getByRole('link', { name: 'Treatments and prices' }),
    header.getByRole('link', { name: 'Dr. Rahil', exact: true }),
    header.getByRole('link', { name: 'Get directions' }),
    header.getByRole('link', { name: 'WhatsApp the clinic' }),
    header.getByRole('link', { name: /^Call the clinic/ }),
    header.getByRole('link', { name: 'Book appointment' }),
  ]
  const first = await top(buttons[0])
  for (const button of buttons) {
    await expect(button).toBeVisible()
    expect(Math.abs((await top(button)) - first)).toBeLessThan(4)
  }
  await expect(header.getByRole('button', { name: 'Menu' })).toBeHidden()
  await wide.close()
})

test('the headline leads, signed by Dr. Rahil, then whether the clinic is open and the way booking works', async ({ page }) => {
  const byline = page.locator('.h-byline')
  await expect(byline.getByRole('img', { name: 'Dr. Rahil Yusuf' })).toBeVisible()
  await expect(byline.getByText('Dr. Rahil Yusuf, BDS')).toBeVisible()
  await expect(byline.getByLabel('5 years of practice')).toBeVisible()
  expect(await top(page.getByRole('heading', { level: 1 }))).toBeLessThan(await top(byline))
  await expect(page.locator('.h-status').first()).toHaveText(/^(Open now|Opens today|Closed)/)
  await expect(page.getByText('How booking works')).toBeVisible()
  // Kept out of search until it replaces the homepage, with the clinic's details ready for it
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  expect(await page.locator('script[type="application/ld+json"]').first().textContent()).toContain('"openingHoursSpecification"')
})

test('booking asks what you need (or Not sure), a day, a free time, a name and a WhatsApp number', async ({ page }) => {
  const card = page.locator('#book')
  await expect(card.getByText(/gender/i)).toHaveCount(0)
  const reasons = card.getByRole('group', { name: 'What do you need?' })
  await expect(reasons.getByRole('button', { name: 'Not sure' })).toBeVisible()
  await expect(reasons.getByRole('button', { pressed: true })).toHaveCount(0)

  // Each day says how many free times it has
  await expect(card.getByRole('group', { name: 'Pick a day' }).getByText(/\d+ free/).first()).toBeVisible()

  // Send names what is missing, in order, and sends nothing
  const send = card.getByRole('button', { name: 'Request this appointment' })
  await send.click()
  await expect(card.getByText('Please choose what you need, or Not sure')).toBeVisible()
  await reasons.getByRole('button', { name: 'Not sure' }).click()
  await expect(card.getByText(/No problem: Dr. Rahil examines first/)).toBeVisible()

  await send.click()
  await expect(card.getByText('Please pick a free time')).toBeVisible()
  await expect(card.getByRole('group', { name: 'Pick a day' }).getByRole('button', { pressed: true })).toHaveCount(1)
  const firstTime = card.getByRole('button', { name: timeButton }).first()
  const label = (await firstTime.textContent())!.trim()
  await firstTime.click()
  await expect(firstTime).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByText(new RegExp(`at ${label}$`))).toBeVisible()

  await send.click()
  await expect(card.getByText('Please enter your WhatsApp number')).toBeVisible()
  await card.getByLabel('WhatsApp number').fill('9845021763')
  await send.click()
  await expect(card.getByText('Please enter your name')).toBeVisible()
  await card.getByLabel('Name').fill('Asha Rao')
  await expect(card.getByText('Request saved')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'No WhatsApp? Ask the clinic to call you' })).toBeVisible()
})

test('the earliest free time is one tap away, and the reason shows its price, or the earliest time for pain', async ({ page }) => {
  const card = page.locator('#book')
  const reasons = card.getByRole('group', { name: 'What do you need?' })
  await reasons.getByRole('button', { name: 'Cleaning' }).click()
  await expect(card.getByText('Teeth cleaning · ₹400 – ₹800')).toBeVisible()

  await reasons.getByRole('button', { name: 'Toothache' }).click()
  await expect(card.getByText(/^In pain\? The earliest free time is/)).toBeVisible()
  await card.getByRole('button', { name: /^Earliest:/ }).click()
  await expect(card.getByRole('button', { name: timeButton, pressed: true })).toHaveCount(1)
  await expect(card.getByRole('button', { name: /^Earliest:/ })).toHaveCount(0)

  // Today's times come with a way to come in right now
  const firstDay = card.getByRole('group', { name: 'Pick a day' }).getByRole('button').first()
  if ((await firstDay.textContent())?.startsWith('Today')) {
    await firstDay.click()
    await expect(card.getByRole('link', { name: 'Call the clinic' })).toHaveAttribute('href', 'tel:+916361816711')
  }
})

test('another date: its free times or why there are none; another time from a 12-hour list goes to WhatsApp', async ({ page }) => {
  const card = page.locator('#book')
  await card.getByRole('group', { name: 'What do you need?' }).getByRole('button', { name: 'Cleaning' }).click()
  await card.getByRole('button', { name: /Other date/ }).click()
  const date = card.getByLabel('Choose a date')
  await date.fill(nextFriday)
  await expect(card.getByText('The clinic is closed on Fridays. Please choose another date.')).toBeVisible()

  await date.fill(farAway)
  await expect(card.getByText(/Online booking opens four weeks ahead/)).toBeVisible()
  const preferred = card.getByLabel('Preferred time')
  // Only opening hours, in 12-hour words: 4:30 PM yes; nothing at lunch, nothing in 24-hour form
  await expect(preferred.locator('option', { hasText: '4:30 PM' })).toHaveCount(1)
  await expect(preferred.locator('option', { hasText: '1:30 PM' })).toHaveCount(0)
  await expect(preferred.locator('option', { hasText: '16:30' })).toHaveCount(0)
  await preferred.selectOption({ label: '4:30 PM' })
  await card.getByLabel('Name').fill('Asha Rao')
  const ask = card.getByRole('link', { name: 'Ask on WhatsApp' })
  const href = decodeURIComponent((await ask.getAttribute('href'))!)
  expect(href).toContain('https://wa.me/916361816711')
  expect(href).toContain('Name: Asha Rao')
  expect(href).toContain('Preferred time: around 4:30 PM')
  expect(href).toContain('For: Cleaning')
  expect(href).toMatch(/Date: \w{3}, \d{1,2} \w{3}/)

  // On a listed day (not today, so no times have passed), a time that isn't offered can still be asked for
  const days = card.getByRole('group', { name: 'Pick a day' }).getByRole('button')
  await days.nth((await days.count()) > 2 ? 1 : 0).click()
  await card.getByRole('button', { name: 'None of these work? Ask for another time' }).click()
  await expect(card.getByRole('button', { name: timeButton })).toHaveCount(0)
  await card.getByLabel('Preferred time').selectOption('any-evening')
  expect(decodeURIComponent((await ask.getAttribute('href'))!)).toContain('Preferred time: any time in the evening')
  await card.getByRole('button', { name: 'Back to the free times' }).click()
  await expect(card.getByRole('button', { name: timeButton }).first()).toBeVisible()
})

test('a treatment Book link and the tooth chart pick the reason, even if the card is still loading', async ({ page }) => {
  const reasons = page.locator('#book').getByRole('group', { name: 'What do you need?' })
  await page.getByRole('link', { name: 'Book Teeth cleaning' }).click()
  await expect(reasons.getByRole('button', { name: 'Cleaning' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Tooth 36, lower left first molar' }).click()
  await expect(page.getByText('Tooth 36, lower left first molar', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pain in a back tooth' })).toBeVisible()
  await page.getByRole('link', { name: 'Book a check-up for this' }).click()
  await expect(reasons.getByRole('button', { name: 'Toothache' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#book').getByText('Toothache (tooth 36, lower left first molar)')).toBeVisible()

  await page.getByRole('button', { name: 'Gums', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bleeding gums or tartar' })).toBeVisible()
  await page.getByRole('link', { name: 'Book a cleaning' }).click()
  await expect(reasons.getByRole('button', { name: 'Cleaning' })).toHaveAttribute('aria-pressed', 'true')
})

test('questions open in place, and the visit section has the map', async ({ page }) => {
  const sundays = page.getByRole('group').filter({ hasText: 'Are you open on Sundays?' })
  await page.getByText('Are you open on Sundays?').click()
  await expect(sundays.getByText(/We are only closed on Fridays/)).toBeVisible()
  await expect(page.locator('iframe[title="Map of Smile Dental Clinic, Katapadi"]')).toHaveAttribute('src', /google\.com\/maps\/embed/)
})
