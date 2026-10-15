import { expect, test, type Page } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, createPatient, createVisit, newPhone, newRunId, openDay, signIn, testDb, visible } from './helpers'

// Delete patient: rare and serious, so it lists what goes and asks for the password.
const runId = newRunId()

test.describe.configure({ mode: 'serial' })
test.skip(!testLogin, NO_TEST_LOGIN)

let page: Page
// The kept record is renamed "Deleted patient (…)", so it is removed by id at the end
let keptId = ''

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  await signIn(page)
})

test.afterAll(async () => {
  const { supabase } = await testDb()
  if (keptId) {
    await supabase.from('payments').delete().eq('patient_id', keptId)
    await supabase.from('patients').delete().eq('id', keptId)
  }
  await cleanRun(runId)
  await page.close()
})

test('a wrong password deletes nothing; "keep in the books" erases the details but keeps the money', async () => {
  const name = `${runId} Keep`
  keptId = await createPatient(name, newPhone('6'))
  await createVisit(keptId, openDay(0), 800, 500)

  await page.goto(`/app/patients/${keptId}`)
  await visible(page.getByRole('link', { name: 'Delete patient' })).click()
  await expect(visible(page.getByRole('heading', { name: `Delete ${name}?` }))).toBeVisible()
  await expect(visible(page.getByText('1 visit with their notes'))).toBeVisible()

  // Nothing can be pressed without the password; a wrong one is refused
  const keep = visible(page.getByRole('button', { name: /Delete patient, keep ₹500 in the books/ }))
  await expect(keep).toBeDisabled()
  await visible(page.getByLabel('Type your password to delete')).fill('not-the-password')
  await keep.click()
  await expect(visible(page.getByText('Wrong password. Nothing was deleted.'))).toBeVisible()

  await visible(page.getByLabel('Type your password to delete')).fill(testLogin!.password)
  await keep.click()
  await expect(page).toHaveURL(/\/app\/patients$/, { timeout: 30_000 })

  const { supabase } = await testDb()
  const { data: patient } = await supabase.from('patients').select('name, phone, medical_alerts').eq('id', keptId).single()
  expect(patient!.name).toMatch(/^Deleted patient \(/)
  expect(patient!.phone).toBeNull()
  const { data: payments } = await supabase.from('payments').select('amount').eq('patient_id', keptId)
  expect(payments!.map((p) => Number(p.amount))).toEqual([500])
})

test('"delete everything" removes the patient with their visits and payments', async () => {
  const name = `${runId} Gone`
  const id = await createPatient(name, newPhone('6'))
  await createVisit(id, openDay(0), 300, 300)

  await page.goto(`/app/patients/${id}/delete`)
  await visible(page.getByLabel('Type your password to delete')).fill(testLogin!.password)
  await visible(page.getByRole('button', { name: /Delete everything, including ₹300 of payments/ })).click()
  await expect(page).toHaveURL(/\/app\/patients$/, { timeout: 30_000 })

  const { supabase } = await testDb()
  expect((await supabase.from('patients').select('id').eq('id', id)).data).toHaveLength(0)
  expect((await supabase.from('payments').select('id').eq('patient_id', id)).data).toHaveLength(0)
  expect((await supabase.from('visits').select('id').eq('patient_id', id)).data).toHaveLength(0)
})
