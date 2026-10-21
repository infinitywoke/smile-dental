import { expect, test, type Page } from '@playwright/test'
import { treatments } from '../src/config/site'

// The rest of the new website (D), under /preview until it replaces the old one: the price list, a
// treatment's page, the booking page and the privacy policy. Nothing is sent: public requests go to the
// clinic's own account, so the tests stop before a request would be saved.

// React is running once the open status (worked out in the browser) shows, so no tap is lost
const ready = (page: Page) => expect(page.locator('.h-status').first()).toHaveText(/\S/)

test('the price list shows every treatment with its prices, and Book opens the booking page with it chosen', async ({ page }) => {
  await page.goto('/preview')
  await page.getByRole('link', { name: 'See the full price list' }).click()
  await expect(page).toHaveURL(/\/preview\/treatments$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Every treatment, with the price.' })).toBeVisible()
  for (const t of treatments) await expect(page.getByRole('link', { name: t.name, exact: true })).toBeVisible()

  // Prices in the website's words: a note such as per crown, ranges, and the extra-tooth formula
  await expect(page.locator('#crown').getByText('₹7,499 per crown')).toBeVisible()
  await expect(page.locator('#braces').getByText('₹45,000–₹65,000')).toBeVisible()
  await expect(page.locator('#dentures').getByText('₹1,200 + ₹400 each')).toBeVisible()
  await expect(page.locator('#rootcanal').getByRole('link', { name: 'Post and Core Build Up' })).toBeVisible()

  await page.getByRole('link', { name: 'Book Teeth cleaning' }).click()
  await expect(page).toHaveURL(/\/preview\/book\?reason=cleaning$/)
  const reasons = page.locator('#book').getByRole('group', { name: 'What do you need?' })
  await expect(reasons.getByRole('button', { name: 'Cleaning' })).toHaveAttribute('aria-pressed', 'true')
})

test('a treatment page shows its prices, books it or asks about it, and leads back to the price list', async ({ page }) => {
  await page.goto('/preview/treatments/crowns-bridges-zirconia')
  await expect(page.getByRole('heading', { level: 1, name: 'Crowns & Bridges (Zirconia/Emax)' })).toBeVisible()
  await expect(page.getByText('₹9,999 per crown')).toBeVisible()
  await expect(page.getByRole('link', { name: 'All treatments and prices' })).toHaveAttribute('href', '/preview/treatments')
  await expect(page.getByRole('link', { name: 'Crowns & Bridges (Ceramic)' })).toHaveAttribute('href', '/preview/treatments/crowns-bridges-ceramic')
  await expect(page.getByRole('link', { name: 'Ask about it on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/916361816711\?text=/)

  await page.locator('.h-side-card').getByRole('link', { name: 'Book appointment' }).click()
  await expect(page).toHaveURL(/\/preview\/book\?reason=crown$/)
  const reasons = page.locator('#book').getByRole('group', { name: 'What do you need?' })
  await expect(reasons.getByRole('button', { name: 'Crown or bridge' })).toHaveAttribute('aria-pressed', 'true')

  // A treatment that isn't on the price list is a real "not found"
  expect((await page.goto('/preview/treatments/whitening'))?.status()).toBe(404)
})

test('the booking page takes the reason from an older link and where the visitor came from, and keeps Book on its card', async ({ page }) => {
  await page.goto('/preview/book?reason=Root%20Canal%20Treatment&utm_source=google')
  await expect(page.getByRole('heading', { level: 1, name: 'Book a visit with Dr. Rahil.' })).toBeVisible()
  const reasons = page.locator('#book').getByRole('group', { name: 'What do you need?' })
  await expect(reasons.getByRole('button', { name: 'Root canal' })).toHaveAttribute('aria-pressed', 'true')
  await ready(page)
  expect(await page.evaluate(() => sessionStorage.getItem('smile_heard_from'))).toBe('Google')

  // The phone bar steps aside while the card is on screen; its Book stays on this page's card
  const bar = page.locator('.h-mobile-bar')
  await expect(bar).toHaveClass(/away/)
  await expect(bar.getByRole('link', { name: 'Book appointment', includeHidden: true })).toHaveAttribute('href', '#book')
  await expect(page.getByText('Are you open on Sundays?')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.locator('iframe[title="Map of Smile Dental Clinic, Katapadi"]')).toHaveCount(1)
})

test('from any page, the menu and the foot of the page lead to the homepage sections and the other pages', async ({ page }) => {
  await page.goto('/preview/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible()
  await expect(page.getByText(/nothing is sent on WhatsApp until you press Send/)).toBeVisible()
  // The new card asks only for a name and a WhatsApp number
  await expect(page.getByText(/your name, your WhatsApp number, the time you chose/)).toBeVisible()
  await expect(page.locator('footer#visit').getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/preview/privacy')

  const header = page.locator('header.h-header')
  await expect(header.getByRole('link', { name: /Smile Dental Clinic/ })).toHaveAttribute('href', '/preview')
  await ready(page)
  await expect(page.locator('.h-mobile-bar').getByRole('link', { name: 'Book appointment' })).toHaveAttribute('href', '/preview/book')
  await header.getByRole('button', { name: 'Menu' }).click()
  const sheet = page.getByRole('navigation', { name: 'Menu' })
  await expect(sheet.getByRole('link', { name: 'Book appointment' })).toHaveAttribute('href', '/preview/book')
  await expect(sheet.getByRole('link', { name: 'Dr. Rahil' })).toHaveAttribute('href', '/preview#doctor')
  await sheet.getByRole('link', { name: 'Treatments and prices' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page).toHaveURL(/\/preview\/treatments$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Every treatment, with the price.' })).toBeVisible()
})
