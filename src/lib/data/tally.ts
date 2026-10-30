import 'server-only'
import { getDoctor } from '@/lib/auth'
import type { ClinicTally } from '@/lib/clinic'
import { createClient } from '@/lib/supabase/server'
import { inIndia } from '@/lib/schedule'
import { tallyTotals, type TallyEntries, type TallyPayment } from '@/lib/tally'
import { newLedgerName, type LedgerPatient } from '@/lib/tally-ledgers'
import { indiaDayBounds } from './visits'

export type TallySettings = {
  cash_ledger: string
  bank_ledger: string
  income_ledger: string | null
  entries: TallyEntries
  sent_from: string | null
  sent_until: string | null
}

// The clinic's ledgers, known from its Tally (the clinic's details in the database), until it saves others:
// nothing to type first. A clinic whose Tally names aren't known has none, and types them on the screen.
export function defaultTallySettings(tally: ClinicTally): TallySettings | null {
  if (!tally.cashLedger || !tally.bankLedger) return null
  return {
    cash_ledger: tally.cashLedger,
    bank_ledger: tally.bankLedger,
    income_ledger: tally.incomeLedger || null,
    entries: 'payment',
    sent_from: null,
    sent_until: null,
  }
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

type Line = { description: string; kind: string; created_at: string }
type TallyPatient = LedgerPatient & { tally_ledger: string | null; tally_ledger_listed: boolean }
const PATIENT = 'patient:patients!inner (id, name, birth_year, birth_date, address, tally_ledger, tally_ledger_listed)'
// What was done, in the order it was billed (a discount isn't a treatment)
const treatmentsOf = (lines: Line[] | null) =>
  [...(lines ?? [])].filter((c) => c.kind !== 'discount' && c.description).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((c) => c.description)

export type TallyItem = TallyPayment & { patient: TallyPatient }

// Payments for a file, and the visits in it with nothing paid (receipts with no amount, as he keeps them):
// recorded in a window (new since the last file), or in a month
export async function getTallyItems(window: TallyWindow): Promise<TallyItem[]> {
  await getDoctor()
  const supabase = await createClient()
  let payments = supabase
    .from('payments')
    .select(`id, amount, method, received_at, ${PATIENT}, visit:visits!inner (id, visit_date, notes, visit_charges (description, kind, created_at))`)
  payments = window.by === 'recorded'
    ? payments.gt('created_at', window.after).lte('created_at', window.upTo)
    : payments.gte('received_at', window.from).lt('received_at', window.before)
  let visits = supabase
    .from('visits')
    .select(`id, visit_date, notes, ${PATIENT}, visit_charges (description, kind, created_at), payments (id)`)
  visits = window.by === 'recorded'
    ? visits.gt('created_at', window.after).lte('created_at', window.upTo)
    : visits.gte('visit_date', inIndia(window.from).date).lt('visit_date', inIndia(window.before).date)
  const [paid, seen] = await Promise.all([payments.order('received_at').limit(5000), visits.order('visit_date').limit(5000)])
  if (paid.error) throw paid.error
  if (seen.error) throw seen.error
  const paymentRows = paid.data as unknown as { id: string; amount: number; method: 'cash' | 'upi'; received_at: string; patient: TallyPatient; visit: { id: string; visit_date: string; notes: string; visit_charges: Line[] } }[]
  const visitRows = seen.data as unknown as { id: string; visit_date: string; notes: string; patient: TallyPatient; visit_charges: Line[]; payments: { id: string }[] }[]
  return [
    ...paymentRows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      method: r.method,
      receivedAt: r.received_at,
      patientName: r.patient.name,
      visitDate: r.visit.visit_date,
      treatments: treatmentsOf(r.visit.visit_charges),
      visitId: r.visit.id,
      notes: r.visit.notes,
      patient: r.patient,
    })),
    // Nothing paid, and something happened (an opened visit left empty isn't a visit); dated midday in India
    ...visitRows
      .filter((v) => (v.payments ?? []).length === 0 && (treatmentsOf(v.visit_charges).length > 0 || v.notes.trim() !== ''))
      .map((v) => ({
        id: v.id,
        amount: 0,
        method: 'cash' as const,
        receivedAt: `${v.visit_date}T06:30:00Z`,
        patientName: v.patient.name,
        visitDate: v.visit_date,
        treatments: treatmentsOf(v.visit_charges),
        visitId: v.id,
        notes: v.notes,
        patient: v.patient,
      })),
  ]
}

// Each item's patient ledger: the one saved for the patient, or (the first time a file needs it) a new one
// named as he names them, saved so every later file uses the same name. One Clinic OS doesn't know is in
// Tally yet is created in each file that uses it.
export async function withLedgers(items: TallyItem[]): Promise<TallyPayment[]> {
  await getDoctor()
  const supabase = await createClient()
  const missing = [...new Map(items.filter((i) => !i.patient.tally_ledger).map((i) => [i.patient.id, i.patient])).values()]
  const named = new Map<string, string>()
  if (missing.length > 0) {
    const { data, error } = await supabase.from('patients').select('tally_ledger').not('tally_ledger', 'is', null).limit(10000)
    if (error) throw error
    const taken = new Set(data.map((p) => String(p.tally_ledger).toLowerCase()))
    for (const patient of missing) {
      const name = newLedgerName(patient, taken)
      taken.add(name.toLowerCase())
      const { error: saveError } = await supabase.from('patients').update({ tally_ledger: name, tally_ledger_listed: false }).eq('id', patient.id).is('tally_ledger', null)
      if (saveError) throw saveError
      named.set(patient.id, name)
    }
  }
  return items.map(({ patient, ...item }) => {
    const name = patient.tally_ledger ?? named.get(patient.id)!
    return { ...item, ledger: { name, create: !patient.tally_ledger_listed } }
  })
}

// The patients still to match to a ledger in his List of Accounts, and how many already are
export async function getLedgerPatients(): Promise<{ unmatched: LedgerPatient[]; matched: number }> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .select('id, name, birth_year, birth_date, address, tally_ledger_listed')
    .not('name', 'like', 'Deleted patient (%')
    .order('name')
    .limit(10000)
  if (error) throw error
  return {
    unmatched: data
      .filter((p) => !p.tally_ledger_listed)
      .map((p) => ({ id: p.id, name: p.name, birth_year: p.birth_year, birth_date: p.birth_date, address: p.address })),
    matched: data.filter((p) => p.tally_ledger_listed).length,
  }
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
  fresh: { count: number; cash: number; upi: number; unpaid: number; since: string | null }
  // The first day with a payment (the first file can start later, to leave out what is already in Tally)
  firstDay: string | null
  // Months with payments or visits, newest first (YYYY-MM)
  months: string[]
}

export async function getTallyOverview(settings: TallySettings | null): Promise<TallyOverview> {
  await getDoctor()
  const supabase = await createClient()
  const [paid, seen] = await Promise.all([
    supabase.from('payments').select('received_at').order('received_at').limit(5000),
    supabase.from('visits').select('visit_date').order('visit_date').limit(5000),
  ])
  if (paid.error) throw paid.error
  if (seen.error) throw seen.error
  const data = paid.data
  const firstDay = data.length > 0 ? inIndia(data[0].received_at).date : null
  const months = [...new Set([...data.map((p) => inIndia(p.received_at).date.slice(0, 7)), ...seen.data.map((v) => String(v.visit_date).slice(0, 7))])].sort().reverse()
  const fresh = await getTallyItems({ by: 'recorded', after: settings?.sent_until ?? '1970-01-01T00:00:00Z', upTo: new Date().toISOString() })
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
