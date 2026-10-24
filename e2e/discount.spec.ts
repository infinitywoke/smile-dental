import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { inIndia } from '../src/lib/schedule'
import { captureWhatsapp, cleanRun, createPatient, createVisit, newPhone, newRunId, signIn, testDb, visible, whatsappText } from './helpers'

// A discount off a visit's bill: a share or an amount, with a reason; a line of its own below zero that
// the total, the message and the money all take off; never more than the bill; removed like a charge
const runId = newRunId()

test.skip(!testLogin, NO_TEST_LOGIN)
test.afterAll(async () => {
  await cleanRun(runId)
})

test('a discount comes off the bill, the total and the message, and never more than the bill', async ({ page }) => {
  const patientId = await createPatient(`${runId} Discount`, newPhone('6'))
  const visitId = await createVisit(patientId, inIndia(new Date()).date, 1000)
  await signIn(page)
  await page.goto(`/app/visits/${visitId}`)
  const total = visible(page.getByText('Total', { exact: true })).locator('xpath=following-sibling::p[1]')
  await expect(total).toHaveText('₹1,000')

  // 10% with a reason
  await visible(page.getByRole('button', { name: 'Discount', exact: true })).click()
  const form = visible(page.getByRole('group', { name: 'Discount' }))
  await form.getByRole('button', { name: '10%' }).click()
  await expect(form.getByLabel('Amount off (₹)')).toHaveValue('100')
  await form.getByLabel('Reason (optional)').fill('Senior citizen')
  await form.getByRole('button', { name: 'Take off ₹100' }).click()
  await expect(form).toHaveCount(0)
  // The bill's line, and the Undo bar once it has saved ("Discount (Senior citizen): −₹100")
  await expect(visible(page.getByText('Discount (Senior citizen)', { exact: true }))).toBeVisible()
  await expect(visible(page.getByText('−₹100', { exact: true }))).toBeVisible()
  await expect(visible(page.getByRole('status').filter({ hasText: 'Discount (Senior citizen): −₹100' })).getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(total).toHaveText('₹900')

  const { supabase } = await testDb()
  const lines = async () => (await supabase.from('visit_charges').select('kind, amount, description').eq('visit_id', visitId).order('created_at')).data
  await expect.poll(lines).toEqual([
    { kind: 'extra', amount: 1000, description: 'Check-up' },
    { kind: 'discount', amount: -100, description: 'Discount (Senior citizen)' },
  ])
  const money = (await supabase.from('visit_money').select('charged').eq('visit_id', visitId).single()).data
  expect(Number(money!.charged)).toBe(900)

  // Never more than the bill as it stands
  await visible(page.getByRole('button', { name: 'Discount', exact: true })).click()
  await visible(page.getByRole('group', { name: 'Discount' })).getByLabel('Amount off (₹)').fill('5000')
  await expect(visible(page.getByText('Up to ₹900, the bill as it stands.'))).toBeVisible()
  await expect(visible(page.getByRole('group', { name: 'Discount' })).getByRole('button', { name: 'Add discount' })).toBeDisabled()
  await visible(page.getByRole('group', { name: 'Discount' })).getByRole('button', { name: 'Cancel' }).click()

  // The message lists it and totals after it
  const whatsapp = await captureWhatsapp(page)
  await visible(page.getByRole('link', { name: 'Send on WhatsApp' })).click()
  const openButton = visible(page.getByRole('link', { name: 'Open WhatsApp' }))
  await Promise.race([page.waitForURL(/wa\.me\//, { timeout: 30_000 }), openButton.waitFor({ timeout: 30_000 }).then(() => openButton.click())])
  await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  const text = whatsappText(whatsapp.url)
  expect(text).toContain('- Check-up: ₹1,000\n- Discount (Senior citizen): −₹100\n*Total: ₹900*')
  expect(text).toContain('*Balance due: ₹900*')

  // Removed like a charge: the bill is whole again
  await page.goto(`/app/visits/${visitId}`)
  page.once('dialog', (dialog) => void dialog.accept())
  await visible(page.getByRole('button', { name: 'Remove Discount (Senior citizen)' })).click()
  await expect(total).toHaveText('₹1,000')
  await expect.poll(async () => (await lines())?.length).toBe(1)
})
