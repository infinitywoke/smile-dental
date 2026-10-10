import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'

// One patient's first visit, end to end, as the dedicated test account.
// Every run makes its own patient and phone number, so runs never collide.
const runId = `E2E-${Date.now()}`
const patientName = `${runId} Patient`
const phone = `9${String(Date.now()).slice(-9)}`
const notes = `${runId}: pain in lower right. Tooth 46 tender on percussion.`
const caption = `${runId} x-ray`
const fixturePhoto = path.join(__dirname, 'fixtures', 'tooth.png')

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
})

test.afterAll(async () => {
  await page?.close()
})

test('signs in with the test login', async () => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(testLogin!.email)
  await page.getByLabel('Password').fill(testLogin!.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: /^Today/ })).toBeVisible()
})

test('adds a new patient and starts a visit', async () => {
  await page.getByRole('link', { name: 'New patient' }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)

  await page.getByLabel('Name', { exact: true }).fill(patientName)
  await page.getByLabel('WhatsApp number').fill(phone)
  await page.getByLabel('Date of birth').fill('1990-05-15')
  await page.getByLabel('Medical alerts').fill('Penicillin allergy')
  await page.getByRole('button', { name: 'Save and start visit' }).click()

  await expect(page).toHaveURL(/\/app\/patients\/[^/]+\/visits\/new$/)
  await expect(page.getByRole('heading', { name: 'New visit' })).toBeVisible()
  await expect(page.getByText('Penicillin allergy')).toBeVisible()
})

test('saves a visit with notes and a captioned photo', async () => {
  await page.getByLabel('Notes', { exact: true }).fill(notes)
  await page.locator('input[type=file][multiple]').setInputFiles(fixturePhoto)
  await page.getByPlaceholder('What is this?').fill(caption)
  await page.getByRole('button', { name: 'Save visit' }).click()

  // A failed upload would add ?photos=failed
  await expect(page).toHaveURL(/\/app\/visits\/[^/?]+$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: patientName })).toBeVisible()
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(notes)
  await expect(page.getByRole('img', { name: caption })).toHaveCount(1)
  await expect(page.getByText(caption, { exact: true })).toBeVisible()
})

test('lists the visit on Today', async () => {
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
  const visit = page.getByRole('link').filter({ hasText: patientName })
  await expect(visit).toHaveCount(1)
  await expect(visit).toContainText(runId)
  await expect(visit).toContainText('1 photo')
})

test('finds the patient by phone on the Patients tab', async () => {
  await page.getByRole('link', { name: 'Patients', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients$/)
  await page.getByPlaceholder('Search name or phone').fill(phone)
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page).toHaveURL(new RegExp(`/app/patients\\?q=${phone}$`))
  await expect(page.getByText(`1 result for “${phone}”`)).toBeVisible()
  await expect(page.getByRole('link').filter({ hasText: patientName })).toHaveCount(1)
})

test('spots the returning patient when the same phone is typed', async () => {
  await page.getByRole('link', { name: 'New', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/patients\/new$/)
  await page.getByLabel('WhatsApp number').fill(phone)

  await expect(page.getByText('Already a patient with this number')).toBeVisible()
  await expect(page.getByRole('link').filter({ hasText: patientName })).toBeVisible()
})

test('signs out', async () => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/login$/)
})
