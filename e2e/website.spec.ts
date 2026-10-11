import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { newRunId } from './helpers'

// The public booking page. Nothing is sent: the test stops before WhatsApp would open.
const runId = newRunId()

test.skip(!testLogin, NO_TEST_LOGIN)

const timeButton = /^\d{1,2}:\d{2} (AM|PM)$/

test('the public booking page offers real times, no SOS, and needs only four answers, with Send on the details page', async ({ page }) => {
  await page.goto('/book')
  await expect(page.getByRole('heading', { name: 'When suits you?' })).toBeVisible()
  await expect(page.getByText(/SOS|Emergency/i)).toHaveCount(0)
  await expect(page.getByText(/after 7 PM/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Call the clinic' })).toBeVisible()

  // Tapping a time moves on by itself, with the first field ready
  await page.getByRole('button', { name: timeButton }).first().click()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  await expect(page.getByLabel('WhatsApp number')).toBeFocused()

  // Required answers come first, then the Optional group
  const reasonY = (await page.getByText('Reason for visit').boundingBox())!.y
  const optionalY = (await page.getByText('Optional', { exact: true }).boundingBox())!.y
  const ageY = (await page.getByLabel(/^Age/).boundingBox())!.y
  expect(reasonY).toBeLessThan(optionalY)
  expect(optionalY).toBeLessThan(ageY)

  await page.getByLabel('WhatsApp number').fill('9845021763')
  await page.getByLabel('Full name').fill(`${runId} Public`)
  await page.getByRole('radio', { name: 'Female', exact: true }).click()

  // Send is tappable with the reason missing: it names the reason and sends nothing
  const send = page.getByRole('button', { name: 'Send on WhatsApp' })
  await expect(send).toBeEnabled()
  await send.click()
  await expect(page.getByText('Please choose a reason')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  await expect(page.getByText('Request saved')).toHaveCount(0)

  await page.getByRole('button', { name: 'Tooth pain' }).click()
  await expect(page.getByText('Please choose a reason')).toHaveCount(0)

  // Age is optional and opens the number keypad; the address is optional too
  await expect(page.getByLabel(/^Age/)).toHaveAttribute('inputmode', 'numeric')
  await expect(page.getByText(/in under 15 minutes|after 6 AM/)).toBeVisible()

  // No review page: Send is on this page, ready once the four required answers are in. Nothing is sent.
  await expect(page.getByRole('heading', { name: 'Looks good?' })).toHaveCount(0)
  await expect(send).toBeEnabled()
})

test('Back on the details step returns to the times and keeps what was typed', async ({ page }) => {
  await page.goto('/book')
  await page.getByRole('button', { name: timeButton }).first().click()
  await page.getByLabel('Full name').fill(`${runId} Back`)

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'When suits you?' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/book')

  await page.getByRole('button', { name: timeButton }).first().click()
  await expect(page.getByLabel('Full name')).toHaveValue(`${runId} Back`)

  // The on-screen Back does the same
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'When suits you?' })).toBeVisible()
})
