import { expect, test, type Page } from '@playwright/test'
import { treatments } from '../src/config/site'

// The website's other pages (website D): the price list, a treatment's page, the booking page and the
// privacy policy, and where the old pages went. Nothing is sent: public requests go to the clinic's own
// account, so the tests stop before a request would be saved.

// React is running once the open status (worked out in the browser) shows, so no tap is lost
const ready = (page: Page) => expect(page.locator('.h-status').first()).toHaveText(/\S/)

test('the price list shows every treatment with its prices, and Book opens the booking page with it chosen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'See the full price list' }).click()
  await expect(page).toHaveURL(/\/treatments$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Every treatment, with the price.' })).toBeVisible()
  for (const t of treatments) await expect(page.getByRole('link', { name: t.name, exact: true })).toBeVisible()

  // Prices in the website's words: a note such as per crown, ranges, and the extra-tooth formula
  await expect(page.locator('#crown').getByText('₹7,499 per crown')).toBeVisible()
  await expect(page.locator('#braces').getByText('₹45,000–₹65,000')).toBeVisible()
  await expect(page.locator('#dentures').getByText('₹1,200 + ₹400 each')).toBeVisible()
  await expect(page.locator('#rootcanal').getByRole('link', { name: 'Post and Core Build Up' })).toBeVisible()
  // The same prices for search engines and AI assistants, under the same 8 headings
  const catalog = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!)
  expect(catalog.hasOfferCatalog.itemListElement).toHaveLength(8)

  await page.getByRole('link', { name: 'Book Teeth cleaning' }).click()
  await expect(page).toHaveURL(/\/book\?reason=cleaning$/)
  // The card starts at the day, with the reason already answered
  await expect(page.locator('#book').getByText('Step 2 of 4')).toBeVisible()
  await expect(page.locator('#book').getByRole('list', { name: 'Your answers so far' })).toContainText('Cleaning')
})

test('a treatment page shows its prices, books it or asks about it, and leads back to the price list', async ({ page }) => {
  await page.goto('/treatments/crowns-bridges-zirconia')
  await expect(page.getByRole('heading', { level: 1, name: 'Crowns & Bridges (Zirconia/Emax)' })).toBeVisible()
  await expect(page.getByText('₹9,999 per crown')).toBeVisible()
  await expect(page.getByRole('link', { name: 'All treatments and prices' })).toHaveAttribute('href', '/treatments')
  await expect(page.getByRole('link', { name: 'Crowns & Bridges (Ceramic)' })).toHaveAttribute('href', '/treatments/crowns-bridges-ceramic')
  await expect(page.getByRole('link', { name: 'Ask about it on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/916361816711\?text=/)
  // Each option's price in rupees, readable by search engines and AI assistants
  const service = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!)
  expect(service['@type']).toBe('Service')
  expect(service.offers.map((o: { price: number }) => o.price)).toEqual([6499, 7499, 9999])
  expect(service.offers[0].priceCurrency).toBe('INR')

  await page.locator('.h-side-card').getByRole('link', { name: 'Book appointment' }).click()
  await expect(page).toHaveURL(/\/book\?reason=crown$/)
  await expect(page.locator('#book').getByRole('list', { name: 'Your answers so far' })).toContainText('Crown or bridge')

  // A treatment that isn't on the price list is a real "not found"
  expect((await page.goto('/treatments/whitening'))?.status()).toBe(404)
})

test('the booking page takes the reason from an older link and where the visitor came from, and keeps Book on its card', async ({ page }) => {
  // The Google profile's appointment link, as an older treatment page would have added a reason to it
  await page.goto('/book?reason=Root%20Canal%20Treatment&utm_source=google')
  await expect(page.getByRole('heading', { level: 1, name: 'Book a visit with Dr. Rahil.' })).toBeVisible()
  await expect(page.locator('#book').getByRole('list', { name: 'Your answers so far' })).toContainText('Root canal')
  await ready(page)
  expect(await page.evaluate(() => sessionStorage.getItem('smile_heard_from'))).toBe('Google')

  // The phone bar steps aside while the card is on screen; its Book stays on this page's card
  const bar = page.locator('.h-mobile-bar')
  await expect(bar).toHaveClass(/away/)
  await expect(bar.getByRole('link', { name: 'Book appointment', includeHidden: true })).toHaveAttribute('href', '#book')
  await expect(page.getByText('Are you open on Sundays?')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  await expect(page.locator('iframe[title="Map of Smile Dental Clinic, Katapadi"]')).toHaveCount(1)
})

test('from any page, the menu and the foot of the page lead to the homepage sections and the other pages', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible()
  await expect(page.getByText(/nothing is sent on WhatsApp until you press Send/)).toBeVisible()
  // The booking card asks only for a name and a WhatsApp number
  await expect(page.getByText(/your name, your WhatsApp number, the time you chose/)).toBeVisible()
  await expect(page.locator('footer#visit').getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')

  const header = page.locator('header.h-header')
  await expect(header.getByRole('link', { name: /Smile Dental Clinic/ })).toHaveAttribute('href', '/')
  await ready(page)
  await expect(page.locator('.h-mobile-bar').getByRole('link', { name: 'Book appointment' })).toHaveAttribute('href', '/book')
  await header.getByRole('button', { name: 'Menu' }).click()
  const sheet = page.getByRole('navigation', { name: 'Menu' })
  await expect(sheet.getByRole('link', { name: 'Book appointment' })).toHaveAttribute('href', '/book')
  await expect(sheet.getByRole('link', { name: 'Dr. Rahil' })).toHaveAttribute('href', '/#doctor')
  await sheet.getByRole('link', { name: 'Treatments and prices' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page).toHaveURL(/\/treatments$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Every treatment, with the price.' })).toBeVisible()
})

test('AI assistants and agents get the site in Markdown: llms.txt, each page with .md, and a page asked for it', async ({ page, request }) => {
  const llms = await request.get('/llms.txt')
  expect(llms.headers()['content-type']).toContain('text/plain')
  expect(await llms.text()).toContain('# Smile Dental Clinic, Katapadi')

  // The homepage asked for in Markdown, as agents ask: the same address, its Markdown copy
  const home = await request.get('/', { headers: { Accept: 'text/markdown' } })
  expect(home.headers()['content-type']).toContain('text/markdown')
  expect(home.headers()['vary']).toContain('Accept')
  expect(await home.text()).toContain('## How booking works')
  const crown = await request.get('/treatments/crowns-bridges-zirconia.md')
  expect(await crown.text()).toContain('₹9,999 per crown')
  expect((await request.get('/treatments/whitening.md')).status()).toBe(404)

  // People still get the page, which points to its copy and gives its one address
  const html = await request.get('/treatments')
  expect(html.headers()['content-type']).toContain('text/html')
  expect(html.headers()['link']).toContain('</treatments.md>; rel="alternate"; type="text/markdown"')
  await page.goto('/book?reason=cleaning')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.smiledentalkatapadi.com/book')
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', 'https://www.smiledentalkatapadi.com/book.md')

  expect(await (await request.get('/robots.txt')).text()).toContain('User-agent: ClaudeBot')
  expect(await (await request.get('/.well-known/security.txt')).text()).toContain('Contact: mailto:')
})

test('the old About, Contact and FAQ pages open their homepage sections, and /preview the live pages', async ({ page }) => {
  for (const [from, to] of [['/about', '/#doctor'], ['/contact', '/#visit'], ['/faq', '/#questions'], ['/preview/treatments', '/treatments']]) {
    await page.goto(from)
    expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(to)
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Every treatment, with the price.' })).toBeVisible()
})
