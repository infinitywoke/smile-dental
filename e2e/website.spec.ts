import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { newRunId } from './helpers'

// The public booking page. Nothing is sent: the test stops before WhatsApp would open.
const runId = newRunId()

test.skip(!testLogin, NO_TEST_LOGIN)

test('the public booking page offers real times, no SOS, and needs only four answers, with Send on the details page', async ({ page }) => {
  await page.goto('/book')
  await expect(page.getByRole('heading', { name: 'When suits you?' })).toBeVisible()
  await expect(page.getByText(/SOS|Emergency/i)).toHaveCount(0)
  await expect(page.getByText(/after 7 PM/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0)

  // Tapping a time moves on by itself, with the first field ready
  await page.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)$/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  await expect(page.getByLabel('WhatsApp number')).toBeFocused()

  await page.getByLabel('WhatsApp number').fill('9845021763')
  await page.getByLabel('Full name').fill(`${runId} Public`)
  await page.getByRole('radio', { name: 'Female', exact: true }).click()
  await page.getByRole('button', { name: 'Tooth pain' }).click()

  // Age is optional and opens the number keypad; the address is optional too
  await expect(page.getByLabel(/^Age/)).toHaveAttribute('inputmode', 'numeric')
  await expect(page.getByText(/in under 15 minutes|after 6 AM/)).toBeVisible()

  // No review page: Send is on this page, ready once the four required answers are in. Nothing is sent.
  await expect(page.getByRole('heading', { name: 'Looks good?' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send on WhatsApp' })).toBeEnabled()
})
