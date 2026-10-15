import { expect, type Locator, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ALL_BLOCKS, addDays, blockInstant, inIndia, isClosedDay } from '../src/lib/schedule'
import { appEnv, testLogin } from './env'

// Shared by every spec file. Each spec signs in, makes its own data and cleans up after itself,
// so the files can be run alone and edited by different people at the same time.

// Next keeps recently visited screens mounted but hidden, so the same text or
// field can exist twice on the page. Only ever match what's visible.
export const visible = <T extends Locator>(locator: T) => locator.filter({ visible: true }) as T

// Unique per run, so runs never collide
export const newRunId = (prefix = 'E2E') => `${prefix}-${Date.now()}`
export const newPhone = (first = '9') => `${first}${String(Date.now()).slice(-9)}`

export async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(testLogin!.email)
  await page.getByLabel('Password').fill(testLogin!.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app$/)
}

let db: { supabase: SupabaseClient; userId: string } | null = null

// The test account, straight to the database. It only ever sees its own rows: every table is
// limited to its owner, so nothing here can touch Dr. Rahil's patients.
export async function testDb() {
  if (db) return db
  const supabase = createClient(appEnv.NEXT_PUBLIC_SUPABASE_URL!, appEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email: testLogin!.email, password: testLogin!.password })
  if (error || !data.user) throw new Error(`test login failed: ${error?.message}`)
  db = { supabase, userId: data.user.id }
  return db
}

const PHOTO_BUCKET = 'visit-photos'

// Removes what one run made: its patients (with their visits, bills, payments, photo records and
// appointments), its website requests, and the photo files. Every name a run creates starts with
// its runId, so two people can run the tests at the same time without deleting each other's data.
export async function cleanRun(runId: string) {
  const { supabase } = await testDb()
  const { data: patients } = await supabase.from('patients').select('id').like('name', `${runId}%`)
  const ids = (patients ?? []).map((p) => p.id as string)
  if (ids.length > 0) {
    const { data: photos } = await supabase.from('visit_photos').select('storage_path, visits!inner (patient_id)').in('visits.patient_id', ids)
    const { error } = await supabase.from('patients').delete().in('id', ids)
    if (error) throw new Error(`cleaning patients: ${error.message}`)
    const paths = (photos ?? []).map((p) => p.storage_path as string)
    if (paths.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(paths)
  }
  const { error } = await supabase.from('booking_requests').delete().like('name', `${runId}%`)
  if (error) throw new Error(`cleaning requests: ${error.message}`)
}

// Removes EVERYTHING the test account owns, including leftovers from runs that crashed.
// Only for a sweep when nobody else is running tests (the evidence tour uses it).
export async function cleanTestAccount() {
  const { supabase, userId } = await testDb()
  const { data: photos } = await supabase.from('visit_photos').select('storage_path')
  for (const table of ['booking_requests', 'appointments', 'time_off', 'patients']) {
    const { error } = await supabase.from(table).delete().not('id', 'is', null)
    if (error) throw new Error(`cleaning ${table}: ${error.message}`)
  }
  const paths = new Set((photos ?? []).map((p) => p.storage_path as string))
  // Files left behind without a row (an upload that never finished)
  const { data: folders } = await supabase.storage.from(PHOTO_BUCKET).list(userId)
  for (const folder of folders ?? []) {
    const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(`${userId}/${folder.name}`)
    for (const file of files ?? []) paths.add(`${userId}/${folder.name}/${file.name}`)
  }
  if (paths.size > 0) await supabase.storage.from(PHOTO_BUCKET).remove([...paths])
}

// An open clinic day at least `daysAhead` days from now
export function openDay(daysAhead: number): string {
  let day = addDays(inIndia(new Date()).date, daysAhead)
  while (isClosedDay(day)) day = addDays(day, 1)
  return day
}

export async function createPatient(name: string, phone: string): Promise<string> {
  const { supabase } = await testDb()
  const { data, error } = await supabase.from('patients').insert({ name, phone, gender: 'male' }).select('id').single()
  if (error) throw new Error(`creating patient: ${error.message}`)
  return data.id as string
}

export async function createAppointment(patientId: string, day: string, hhmm: string): Promise<string> {
  const { supabase } = await testDb()
  const { data, error } = await supabase
    .from('appointments')
    .insert({ patient_id: patientId, starts_at: blockInstant(day, hhmm), duration_min: 40, reason: 'Check-up', status: 'booked' })
    .select('id')
    .single()
  if (error) throw new Error(`creating appointment: ${error.message}`)
  return data.id as string
}

// Today's clinic blocks that start at least `leadMinutes` from now (HH:MM, India time); none on a Friday
export function blocksLeftToday(leadMinutes = 5): string[] {
  const today = inIndia(new Date()).date
  if (isClosedDay(today)) return []
  return ALL_BLOCKS.filter((hhmm) => new Date(blockInstant(today, hhmm)).getTime() > Date.now() + leadMinutes * 60_000)
}

// Books the first of `times` on `day` that is still free (other runs may hold some), or null
export async function createAppointmentAtFirstFree(patientId: string, day: string, times: string[]): Promise<{ id: string; time: string } | null> {
  for (const time of times) {
    try {
      return { id: await createAppointment(patientId, day, time), time }
    } catch {
      // Taken, or already over: try the next one
    }
  }
  return null
}

// The files in a visit's photo folder (`<doctor>/<visit>/`)
export async function photoFolderFiles(visitId: string): Promise<string[]> {
  const { supabase, userId } = await testDb()
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list(`${userId}/${visitId}`)
  if (error) throw new Error(`listing photos: ${error.message}`)
  return (data ?? []).map((f) => f.name).filter((name) => name !== '.emptyFolderPlaceholder')
}

// A visit on `day` with one charge and, if `paid` is given, one cash payment
export async function createVisit(patientId: string, day: string, charge: number, paid = 0): Promise<string> {
  const { supabase } = await testDb()
  const { data, error } = await supabase.from('visits').insert({ patient_id: patientId, visit_date: day }).select('id').single()
  if (error) throw new Error(`creating visit: ${error.message}`)
  const visitId = data.id as string
  const { error: chargeError } = await supabase
    .from('visit_charges')
    .insert({ visit_id: visitId, patient_id: patientId, description: 'Check-up', amount: charge, kind: 'extra' })
  if (chargeError) throw new Error(`creating charge: ${chargeError.message}`)
  if (paid > 0) {
    const { error: payError } = await supabase
      .from('payments')
      .insert({ visit_id: visitId, patient_id: patientId, amount: paid, method: 'cash' })
    if (payError) throw new Error(`creating payment: ${payError.message}`)
  }
  return visitId
}

// A website booking request, filed under the test account (the public form files requests
// under the clinic's own account, so tests insert them directly)
export async function makeRequest(runId: string, label: string, hhmm: string, daysAhead: number) {
  const { supabase } = await testDb()
  const day = openDay(daysAhead)
  const requestPhone = newPhone('8')
  const requestName = `${runId} ${label}`
  const { data, error } = await supabase.from('booking_requests').insert({
    name: requestName, phone: requestPhone, gender: 'female', birth_year: 1985, address: 'Katapadi',
    medical_alerts: 'Diabetes', heard_from: 'Google', reason: 'Tooth pain', requested_start: blockInstant(day, hhmm),
    status: 'new',
  }).select('id').single()
  if (error) throw new Error(`creating request: ${error.message}`)
  return { id: data.id as string, day, requestName, requestPhone }
}

// The same, from a given phone (a patient already in the app) and/or sent `hoursAgo` hours ago
export async function makeRequestFrom(
  runId: string, label: string, hhmm: string, daysAhead: number,
  options: { phone?: string; hoursAgo?: number } = {},
) {
  const { supabase } = await testDb()
  const day = openDay(daysAhead)
  const requestPhone = options.phone ?? newPhone('8')
  const requestName = `${runId} ${label}`
  const { data, error } = await supabase.from('booking_requests').insert({
    name: requestName, phone: requestPhone, gender: 'male', reason: 'Check-up', requested_start: blockInstant(day, hhmm),
    status: 'new', created_at: new Date(Date.now() - (options.hoursAgo ?? 0) * 60 * 60_000).toISOString(),
  }).select('id').single()
  if (error) throw new Error(`creating request: ${error.message}`)
  return { id: data.id as string, day, requestName, requestPhone }
}

// Patients of the test account with this phone (to check no duplicate was made)
export async function patientsWithPhone(phone: string): Promise<{ id: string; name: string }[]> {
  const { supabase } = await testDb()
  const { data, error } = await supabase.from('patients').select('id, name').eq('phone', phone)
  if (error) throw new Error(`reading patients: ${error.message}`)
  return data as { id: string; name: string }[]
}

// Removes time off a spec made on `day` (closing a day or blocking a time), whatever state it ended in
export async function clearTimeOff(day: string) {
  const { supabase } = await testDb()
  const start = blockInstant(day, '00:00')
  const end = new Date(new Date(start).getTime() + 24 * 60 * 60_000).toISOString()
  const { error } = await supabase.from('time_off').delete().gte('starts_at', start).lte('ends_at', end)
  if (error) throw new Error(`clearing time off: ${error.message}`)
}

// Stops WhatsApp opening for real: the test reads the link the app would open
export async function captureWhatsapp(page: Page) {
  const captured = { url: '' }
  await page.unroute('https://wa.me/**').catch(() => {})
  await page.route('https://wa.me/**', (route) => {
    captured.url = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>WhatsApp</body></html>' })
  })
  return captured
}

export const whatsappText = (url: string) => new URL(url).searchParams.get('text') ?? ''

export type Shared = { text: string; files: { name: string; type: string; size: number }[] }

// Playwright can't open Android's share sheet: this makes the page believe it can share files
// (like Chrome on Android) and records what it shares. Applies from the next page load. Setting
// sessionStorage "e2e-no-share" before a load turns it off again (a browser without file sharing).
export async function stubShareSheet(page: Page) {
  await page.addInitScript(() => {
    let off = false
    try {
      off = !!sessionStorage.getItem('e2e-no-share')
    } catch {
      // No storage on this page (an opaque origin): nothing to stub
      return
    }
    if (off) {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
      return
    }
    const shared: unknown[] = []
    ;(window as unknown as { __shared: unknown[] }).__shared = shared
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data?: ShareData) => !!data?.files?.length && data.files.every((f) => f.type.startsWith('image/')),
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        shared.push({ text: data.text ?? '', files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })) })
      },
    })
  })
  return {
    shared: () => page.evaluate(() => (window as unknown as { __shared?: Shared[] }).__shared ?? []),
    // The next page loads behave like a browser that can't share files
    turnOff: () => page.evaluate(() => sessionStorage.setItem('e2e-no-share', '1')),
  }
}
