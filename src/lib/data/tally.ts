import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { inIndia } from '@/lib/schedule'
import { tallyTotals, type TallyEntries, type TallyPayment } from '@/lib/tally'
import { indiaDayBounds } from './visits'

export type TallySettings = {
  cash_ledger: string
  bank_ledger: string
  income_ledger: string
  entries: TallyEntries
  sent_from: string | null
  sent_until: string | null
}

export async function getTallySettings(): Promise<TallySettings | null> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tally_settings')
    .select('cash_ledger, bank_ledger, income_ledger, entries, sent_from, sent_until')
    .maybeSingle()
  if (error) throw error
  return data as TallySettings | null
}

// Payments for a file: recorded in a window (new since the last file), or received in a month
export type TallyWindow =
  | { by: 'recorded'; after: string; upTo: string }
  | { by: 'received'; from: string; before: string }

export async function getTallyPayments(window: TallyWindow): Promise<TallyPayment[]> {
  await getDoctor()
  const supabase = await createClient()
  let query = supabase
    .from('payments')
    .select('id, amount, method, received_at, patient:patients!inner (name), visit:visits!inner (visit_date, visit_charges (description, kind, created_at))')
  query = window.by === 'recorded'
    ? query.gt('created_at', window.after).lte('created_at', window.upTo)
    : query.gte('received_at', window.from).lt('received_at', window.before)
  const { data, error } = await query.order('received_at').limit(5000)
  if (error) throw error
  type Line = { description: string; kind: string; created_at: string }
  const rows = data as unknown as { id: string; amount: number; method: 'cash' | 'upi'; received_at: string; patient: { name: string }; visit: { visit_date: string; visit_charges: Line[] } }[]
  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    method: r.method,
    receivedAt: r.received_at,
    patientName: r.patient.name,
    visitDate: r.visit.visit_date,
    // What was done, in the order it was billed (a discount isn't a treatment)
    treatments: [...(r.visit.visit_charges ?? [])]
      .filter((c) => c.kind !== 'discount' && c.description)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((c) => c.description),
  }))
}

// The start of a day or a month in India, as a timestamp
export const indiaStart = (date: string) => indiaDayBounds(date).start
export function monthWindow(month: string): TallyWindow {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { by: 'received', from: indiaStart(`${month}-01`), before: indiaStart(`${next}-01`) }
}

// What the Send to Tally screen shows
export type TallyOverview = {
  // Not yet in a file: since the last file, or (first time) every payment so far
  fresh: { count: number; cash: number; upi: number; since: string | null }
  // The first day with a payment (the first file can start later, to leave out what is already in Tally)
  firstDay: string | null
  // Months with payments, newest first (YYYY-MM)
  months: string[]
}

export async function getTallyOverview(settings: TallySettings | null): Promise<TallyOverview> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.from('payments').select('received_at').order('received_at').limit(5000)
  if (error) throw error
  const firstDay = data.length > 0 ? inIndia(data[0].received_at).date : null
  const months = [...new Set(data.map((p) => inIndia(p.received_at).date.slice(0, 7)))].reverse()
  const fresh = await getTallyPayments({ by: 'recorded', after: settings?.sent_until ?? '1970-01-01T00:00:00Z', upTo: new Date().toISOString() })
  return { fresh: { ...tallyTotals(fresh), since: settings?.sent_until ?? null }, firstDay, months }
}

// Today's money for the day-end card: cash, UPI and how many payments
export async function getMoneyOn(date: string): Promise<{ count: number; cash: number; upi: number }> {
  await getDoctor()
  const supabase = await createClient()
  const { start, end } = indiaDayBounds(date)
  const { data, error } = await supabase.from('payments').select('amount, method').gte('received_at', start).lte('received_at', end)
  if (error) throw error
  const sum = (m: string) => data.filter((p) => p.method === m).reduce((t, p) => t + Number(p.amount), 0)
  return { count: data.length, cash: sum('cash'), upi: sum('upi') }
}
