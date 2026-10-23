import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { signIn, visible } from './helpers'

// The Kannada messages wait for Dr. Rahil's check: Settings shows each one; no patient can be set to
// Kannada yet, so every message still goes in English
test.skip(!testLogin, NO_TEST_LOGIN)

test('Settings shows every patient message in Kannada; the patient form does not offer Kannada yet', async ({ page }) => {
  await signIn(page)
  await page.goto('/app/settings')
  await visible(page.getByRole('link', { name: 'Messages in Kannada' })).click()
  await expect(page).toHaveURL(/\/app\/settings\/messages$/)
  await expect(visible(page.getByText(/^Not sent to any patient yet/))).toBeVisible()
  await expect(visible(page.getByRole('heading', { level: 2 }))).toHaveCount(10)
  await expect(visible(page.getByText('ಖಚಿತವಾಗಿದೆ')).first()).toBeVisible()
  await expect(visible(page.getByText(/ನಮಸ್ಕಾರ Prakash ಅವರೇ,/)).first()).toBeVisible()

  // The English one beside it, for comparing
  await visible(page.getByText('The English one')).first().click()
  await expect(visible(page.getByText(/Your appointment at Smile Dental Clinic is/)).first()).toBeVisible()

  await page.goto('/app/patients/new')
  await expect(visible(page.getByLabel('Name'))).toBeVisible()
  await expect(page.getByText('WhatsApp messages in')).toHaveCount(0)
})
