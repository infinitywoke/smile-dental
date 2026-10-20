import { addDays } from '@/lib/schedule'

// This month's numbers, from what the dentist already records: payments, visits, new patients (and how
// they heard of the clinic), website bookings, missed appointments and what was billed. Each number
// is set beside the same days of the month before, so a month half gone compares fairly.

export type Period = { from: string; to: string } // India dates, both days included

export type MonthPeriods = {
  month: string // YYYY-MM
  current: Period
  previous: Period
  // The month still running: compared with the same days of last month
  running: boolean
}

const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const previousMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
export const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
const lastDay = (month: string) => `${month}-${String(daysIn(month)).padStart(2, '0')}`

// The month asked for (never one still to come), and what it is compared with
export function monthPeriods(asked: string | null | undefined, today: string): MonthPeriods {
  const thisMonth = today.slice(0, 7)
  const month = asked && /^\d{4}-\d{2}$/.test(asked) && asked <= thisMonth ? asked : thisMonth
  const before = previousMonth(month)
  if (month === thisMonth) {
    const day = Math.min(Number(today.slice(8)), daysIn(before))
    return { month, running: true, current: { from: `${month}-01`, to: today }, previous: { from: `${before}-01`, to: `${before}-${String(day).padStart(2, '0')}` } }
  }
  return { month, running: false, current: { from: `${month}-01`, to: lastDay(month) }, previous: { from: `${before}-01`, to: lastDay(before) } }
}

export type InsightRows = {
  payments: { date: string; amount: number; method: 'cash' | 'upi' }[]
  visits: { date: string; patientId: string }[]
  newPatients: { date: string; heardFrom: string | null }[]
  requests: { date: string; status: string }[]
  appointments: { date: string; status: string; seen: boolean }[]
  charges: { date: string; amount: number; slug: string | null }[]
}

export type Insights = {
  money: { total: number; cash: number; upi: number; count: number; before: number }
  visits: { count: number; patients: number; before: number }
  newPatients: { count: number; before: number; sources: { label: string; count: number }[] }
  website: { requests: number; booked: number; before: number }
  missed: { didntCome: number; outOf: number; before: number }
  treatments: { name: string; amount: number; count: number }[]
}

const within = (p: Period) => (row: { date: string }) => row.date >= p.from && row.date <= p.to
const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((t, r) => t + r.amount, 0) * 100) / 100

export function summarise(rows: InsightRows, periods: MonthPeriods, treatmentNames: Record<string, string>): Insights {
  const now = within(periods.current)
  const then = within(periods.previous)

  const pay = rows.payments.filter(now)
  const visits = rows.visits.filter(now)
  const fresh = rows.newPatients.filter(now)
  const requests = rows.requests.filter(now)
  // An appointment counts once its outcome is known: the patient was seen, or "Didn't come" was tapped
  const outcome = (a: InsightRows['appointments'][number]) => a.seen || a.status === 'no_show'
  const appts = rows.appointments.filter(now).filter(outcome)

  const sources = new Map<string, number>()
  for (const p of fresh) {
    const label = p.heardFrom?.trim() || 'Not asked'
    sources.set(label, (sources.get(label) ?? 0) + 1)
  }
  const treatments = new Map<string, { name: string; amount: number; count: number }>()
  for (const c of rows.charges.filter(now)) {
    const name = (c.slug && treatmentNames[c.slug]) || 'Other charges'
    const t = treatments.get(name) ?? { name, amount: 0, count: 0 }
    t.amount += c.amount
    t.count += 1
    treatments.set(name, t)
  }

  return {
    money: {
      total: sum(pay),
      cash: sum(pay.filter((p) => p.method === 'cash')),
      upi: sum(pay.filter((p) => p.method === 'upi')),
      count: pay.length,
      before: sum(rows.payments.filter(then)),
    },
    visits: { count: visits.length, patients: new Set(visits.map((v) => v.patientId)).size, before: rows.visits.filter(then).length },
    newPatients: {
      count: fresh.length,
      before: rows.newPatients.filter(then).length,
      sources: [...sources.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    },
    website: { requests: requests.length, booked: requests.filter((r) => r.status === 'booked').length, before: rows.requests.filter(then).length },
    missed: {
      didntCome: appts.filter((a) => a.status === 'no_show').length,
      outOf: appts.length,
      before: rows.appointments.filter(then).filter((a) => a.status === 'no_show').length,
    },
    treatments: [...treatments.values()].sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => ({ ...t, amount: Math.round(t.amount * 100) / 100 })),
  }
}

// The first and last instant of an India date range, for timestamp columns
export const periodBounds = (from: string, to: string) => ({ start: `${from}T00:00:00+05:30`, end: `${addDays(to, 1)}T00:00:00+05:30` })
