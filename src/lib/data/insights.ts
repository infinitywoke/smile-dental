import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { treatments } from '@/config/site'
import { inIndia } from '@/lib/schedule'
import { periodBounds, summarise, type Insights, type MonthPeriods } from '@/lib/insights'
import { getDues } from './dues'
import { getTreatments } from './price-list'

// A billed treatment's name: from the clinic's price list now, or (taken off it since) the list in the app,
// so old bills and treatments the stock spreadsheet added are both named
const treatmentNames = async () =>
  Object.fromEntries([...treatments, ...(await getTreatments())].map((t) => [t.slug, t.name]))

// The month's numbers and the month before's, from the dentist's own records. "Owed to you" is the
// money still due right now, by the same rule as Collect on Today; it shows only for the running month.
export async function getInsights(periods: MonthPeriods): Promise<{ insights: Insights; owed: { amount: number; patients: number } | null }> {
  await getDoctor()
  const supabase = await createClient()
  const { from } = periods.previous
  const { to } = periods.current
  const { start, end } = periodBounds(from, to)

  const [payments, visits, patients, requests, appointments, charges, dues, names] = await Promise.all([
    supabase.from('payments').select('amount, method, received_at').gte('received_at', start).lt('received_at', end),
    supabase.from('visits').select('patient_id, visit_date').gte('visit_date', from).lte('visit_date', to),
    supabase.from('patients').select('heard_from, created_at').gte('created_at', start).lt('created_at', end),
    supabase.from('booking_requests').select('status, created_at').gte('created_at', start).lt('created_at', end),
    supabase.from('appointments').select('status, visit_id, starts_at').gte('starts_at', start).lt('starts_at', end),
    supabase.from('visit_charges').select('amount, kind, treatment_slug, visit:visits!inner (visit_date)').gte('visit.visit_date', from).lte('visit.visit_date', to),
    periods.running ? getDues(100_000) : Promise.resolve(null),
    treatmentNames(),
  ])
  for (const r of [payments, visits, patients, requests, appointments, charges]) if (r.error) throw r.error

  const day = (ts: string) => inIndia(ts).date
  const insights = summarise({
    payments: payments.data!.map((p) => ({ date: day(p.received_at), amount: Number(p.amount), method: p.method as 'cash' | 'upi' })),
    visits: visits.data!.map((v) => ({ date: v.visit_date, patientId: v.patient_id })),
    newPatients: patients.data!.map((p) => ({ date: day(p.created_at), heardFrom: p.heard_from })),
    requests: requests.data!.map((r) => ({ date: day(r.created_at), status: r.status })),
    appointments: appointments.data!.map((a) => ({ date: day(a.starts_at), status: a.status, seen: a.status === 'done' || !!a.visit_id })),
    charges: (charges.data as unknown as { amount: number; kind: string; treatment_slug: string | null; visit: { visit_date: string } }[])
      .map((c) => ({ date: c.visit.visit_date, amount: Number(c.amount), slug: c.treatment_slug, discount: c.kind === 'discount' })),
  }, periods, names)

  const owed = dues ? { amount: Math.round(dues.reduce((t, d) => t + d.amount, 0) * 100) / 100, patients: dues.length } : null
  return { insights, owed }
}
