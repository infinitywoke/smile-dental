import { expect, test } from '@playwright/test'
import { NO_TEST_LOGIN, testLogin } from './env'
import { cleanRun, newPhone, newRunId, testDb } from './helpers'

// Booking API v1, against the test account's clinic: never a real clinic's bookings
test.skip(!testLogin, NO_TEST_LOGIN)

const runId = newRunId()
test.afterAll(async () => cleanRun(runId))

const clinicSlug = async () => {
  const { supabase, clinicId } = await testDb()
  const { data } = await supabase.from('clinics').select('slug').eq('id', clinicId).single()
  return data!.slug as string
}

test('a website reads free times and prices, and sends a request that lands in that clinic', async ({ request }) => {
  const slug = await clinicSlug()
  const base = `/api/v1/clinics/${slug}`

  const slots = await request.get(`${base}/slots?days=7`)
  expect(slots.ok()).toBe(true)
  expect(slots.headers()['access-control-allow-origin']).toBe('*')
  const { slots: times } = await slots.json() as { slots: string[] }
  expect(times.length).toBeGreaterThan(0)

  const prices = await (await request.get(`${base}/prices`)).json() as { treatments: { slug: string; options: unknown[] }[] }
  expect(prices.treatments.find((t) => t.slug === 'fillings')?.options.length).toBeGreaterThan(1)

  const name = `${runId} Api Patient`
  const sent = await request.post(`${base}/requests`, { data: { name, phone: newPhone('8'), requestedStart: times[times.length - 1], reason: 'Check-up' } })
  expect(sent.status()).toBe(201)
  const { id } = await sent.json() as { id: string }

  const { supabase, clinicId } = await testDb()
  const { data } = await supabase.from('booking_requests').select('clinic_id, status').eq('id', id).single()
  expect(data).toEqual({ clinic_id: clinicId, status: 'new' })
})

test('it refuses what it should, and says why', async ({ request }) => {
  const slug = await clinicSlug()
  expect((await request.get('/api/v1/clinics/Not%20A%20Slug/slots')).status()).toBe(400)
  expect((await request.get(`/api/v1/clinics/${slug}/slots?days=100`)).status()).toBe(400)
  expect((await request.post(`/api/v1/clinics/${slug}/requests`, { data: { name: 'X' } })).status()).toBe(400)
  const past = await request.post(`/api/v1/clinics/${slug}/requests`, { data: { name: `${runId} Late`, phone: newPhone('8'), requestedStart: '2020-01-01T04:30:00.000Z' } })
  expect(past.status()).toBe(422)
  expect((await past.json() as { error: string }).error).toContain('no longer available')
  const unknown = await (await request.get('/api/v1/clinics/no-such-clinic/slots')).json() as { slots: string[] }
  expect(unknown.slots).toEqual([])
  expect((await request.get('/api/v1/openapi.json')).ok()).toBe(true)
})
