import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, newPhone, newRunId, signIn, visible } from './helpers'

// Today, finding patients, the New patient form's returning-patient check, and the header menu.
const runId = newRunId()
const patientName = `${runId} Known`
const phone = newPhone()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

test.beforeAll(async ({ browser }) => {
  await createPatient(patientName, phone)
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  await page?.close()
  await cleanRun(runId)
})

test('Today opens after sign-in', async () => {
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
})

test('finds the patient by phone on the Patients tab', async () => {
  await page.getByRole('link', { name: 'Patients', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients$/)
  await visible(page.getByPlaceholder('Search name or phone')).fill(phone)
  await visible(page.getByRole('button', { name: 'Search' })).click()

  await expect(page).toHaveURL(new RegExp(`/app/patients\\?q=${phone}$`))
  await expect(visible(page.getByText(`1 result for “${phone}”`))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toHaveCount(1)
})

test('spots the returning patient when the same phone is typed', async () => {
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('link', { name: /New patient/ }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)
  await visible(page.getByLabel('WhatsApp number')).fill(phone)

  await expect(visible(page.getByText('Already a patient with this number'))).toBeVisible()
  await expect(visible(page.getByRole('link').filter({ hasText: patientName }))).toBeVisible()
})

test('switches practice mode on and off, and signs out from the menu', async () => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Practice mode/ }).click()
  await expect(page.getByText('Practice mode: new patients are marked TEST')).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Practice mode/ }).click()
  await expect(page.getByText('Practice mode: new patients are marked TEST')).toHaveCount(0)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login/)
})
