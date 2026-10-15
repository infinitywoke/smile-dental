import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayInIndia } from '@/lib/dates'
import { addDays, blocksFor } from '@/lib/schedule'
import { indiaDayBounds } from './visits'

// The lists on Today that empty themselves as he taps: tomorrow's reminders, patients who didn't
// come, and 6-month check-ups. Each item leaves its list once it is sent (or set aside).

type Person = { id: string; name: string; phone: string | null }

export type Reminder = { id: string; starts_at: string; reminded: boolean; patient: Person }

// The next open day (Fridays closed) and its booked appointments, with who has been reminded
export async function getReminders(today: string = todayInIndia()): Promise<{ date: string; tomorrow: boolean; items: Reminder[] }> {
  await getDoctor()
  let date = addDays(today, 1)
  for (let i = 0; i < 7 && blocksFor(date).length === 0; i++) date = addDays(date, 1)
  const supabase = await createClient()
  const { start, end } = indiaDayBounds(date)
  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, reminded_at, patient:patients!inner (id, name, phone)')
    .eq('status', 'booked')
    .is('visit_id', null)
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')
  if (error) throw error
  const rows = data as unknown as { id: string; starts_at: string; reminded_at: string | null; patient: Person }[]
  return {
    date,
    tomorrow: date === addDays(today, 1),
    items: rows.map((r) => ({ id: r.id, starts_at: r.starts_at, reminded: !!r.reminded_at, patient: r.patient })),
  }
}

export type Missed = { id: string; starts_at: string; patient: Person }

// "Didn't come" in the last 30 days, not yet followed up, and not back on the books since (a new
// booking ahead, or a visit after the missed time)
export const MISSED_DAYS = 30
export async function getMissed(): Promise<Missed[]> {
  await getDoctor()
  const supabase = await createClient()
  const since = new Date(Date.now() - MISSED_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, patient:patients!inner (id, name, phone)')
    .eq('status', 'no_show')
    .is('followed_up_at', null)
    .gte('starts_at', since)
    .order('starts_at', { ascending: false })
  if (error) throw error
  const missed = data as unknown as Missed[]
  if (missed.length === 0) return []
  const ids = [...new Set(missed.map((m) => m.patient.id))]
  const [ahead, seen] = await Promise.all([
    supabase.from('appointments').select('patient_id').eq('status', 'booked').in('patient_id', ids).gt('starts_at', new Date().toISOString()),
    supabase.from('visits').select('patient_id, created_at').in('patient_id', ids).gte('created_at', since),
  ])
  if (ahead.error) throw ahead.error
  if (seen.error) throw seen.error
  const booked = new Set(ahead.data.map((a) => a.patient_id))
  // One line per patient: their latest missed time
  const shown = new Set<string>()
  return missed.filter((m) => {
    if (shown.has(m.patient.id) || booked.has(m.patient.id)) return false
    if (seen.data.some((v) => v.patient_id === m.patient.id && v.created_at > m.starts_at)) return false
    shown.add(m.patient.id)
    return true
  })
}

export type Recall = Person & { lastVisit: string; recalledAt: string | null }

// Patients whose last visit was six months ago or more, with a WhatsApp number, nothing booked ahead,
// and no check-up reminder since that visit
export const RECALL_MONTHS = 6
export async function getRecalls(today: string = todayInIndia()): Promise<Recall[]> {
  await getDoctor()
  const supabase = await createClient()
  const [y, m, d] = today.split('-').map(Number)
  const cutoff = new Date(Date.UTC(y, m - 1 - RECALL_MONTHS, d)).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('patients')
    .select('id, name, phone, recalled_at, visits (visit_date)')
    .not('phone', 'is', null)
    .order('visit_date', { referencedTable: 'visits', ascending: false })
    .limit(1, { referencedTable: 'visits' })
  if (error) throw error
  const rows = (data as unknown as (Person & { recalled_at: string | null; visits: { visit_date: string }[] })[])
    .map((p) => ({ id: p.id, name: p.name, phone: p.phone, recalledAt: p.recalled_at, lastVisit: p.visits[0]?.visit_date ?? '' }))
    .filter((p) => p.lastVisit && p.lastVisit <= cutoff && (!p.recalledAt || p.recalledAt.slice(0, 10) < p.lastVisit))
  if (rows.length === 0) return []
  const { data: ahead, error: aheadError } = await supabase
    .from('appointments')
    .select('patient_id')
    .eq('status', 'booked')
    .in('patient_id', rows.map((r) => r.id))
    .gt('starts_at', new Date().toISOString())
  if (aheadError) throw aheadError
  const booked = new Set(ahead.map((a) => a.patient_id))
  // Longest since their visit first
  return rows.filter((r) => !booked.has(r.id)).sort((a, b) => a.lastVisit.localeCompare(b.lastVisit))
}
