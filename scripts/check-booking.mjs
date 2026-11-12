// Drives a copy of the website in a phone-sized browser (node scripts/check-booking.mjs <address>): the booking card appears, a request goes to Clinic OS's
// Booking API (caught here, so nothing is saved), and WhatsApp would open with the link into Clinic OS.
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:8787'
const CLINIC_OS = 'https://smile-dental-hin3.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 412, height: 905 } })
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
page.on('pageerror', (e) => problems.push(String(e)))

let sent = null
await page.route(`${CLINIC_OS}/api/v1/clinics/*/requests`, (route) => {
  sent = { url: route.request().url(), body: route.request().postDataJSON() }
  return route.fulfill({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ id: '00000000-0000-4000-8000-0000000000c1' }) })
})
let whatsapp = ''
await page.route('https://wa.me/**', (route) => { whatsapp = route.request().url(); return route.fulfill({ status: 200, contentType: 'text/html', body: 'WhatsApp' }) })

const started = Date.now()
await page.goto(`${BASE}/book`)
const card = page.locator('#book')
await card.getByText('Step 1 of 4').waitFor({ timeout: 20_000 })
console.log(`booking card shown after ${Date.now() - started} ms`)
await page.locator('.h-status').first().filter({ hasText: /\S/ }).waitFor()
await card.getByRole('group', { name: 'What do you need?' }).getByRole('button', { name: 'Check-up' }).click()
await card.getByRole('group', { name: 'Pick a day' }).getByRole('button').first().click()
await card.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)$/ }).first().click()
await card.getByLabel('WhatsApp number').fill('9845021763')
await card.getByLabel('Name').fill('Asha Rao')
await page.waitForTimeout(3_200)
await card.getByRole('button', { name: 'Request this appointment' }).click()
for (let i = 0; i < 40 && !whatsapp; i++) await page.waitForTimeout(250)

const text = whatsapp ? new URL(whatsapp).searchParams.get('text') ?? '' : ''
console.log('request sent to:', sent?.url ?? 'NOTHING SENT')
console.log('request body:', JSON.stringify(sent?.body ?? null))
console.log('WhatsApp opened:', whatsapp ? whatsapp.slice(0, 40) : 'NO')
console.log('link in the message:', text.match(/https?:\/\/\S+\/received/)?.[0] ?? 'none')
console.log('browser errors:', problems.length ? problems : 'none')
await browser.close()
