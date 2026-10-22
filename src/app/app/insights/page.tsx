import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getCosts } from '@/lib/data/costs'
import { getInsights } from '@/lib/data/insights'
import { total } from '@/lib/costs'
import { formatDate, todayInIndia } from '@/lib/dates'
import { monthPeriods, nextMonth, previousMonth } from '@/lib/insights'
import { formatRupees } from '@/lib/pricing'
import { ScreenLoading } from '@/components/clinic/ui'
import { PracticeTabs } from '@/components/clinic/PracticeTabs'

const card = 'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200'
const label = 'text-sm font-bold text-gray-500'
const big = 'hud-mono mt-1 text-3xl font-bold tracking-tight text-gray-900'

// The line under a number: how it compares with the same days of last month
function Versus({ text }: { text: string | null }) {
  return text ? <p className="mt-1 text-sm text-gray-500">{text}</p> : null
}

// This month's numbers: only what the dentist records, each beside the same days of last month.
// A part with nothing recorded (now or the month before) doesn't show.
async function InsightsContent({ searchParams }: PageProps<'/app/insights'>) {
  await getDoctor()
  const { m } = await searchParams
  const periods = monthPeriods(typeof m === 'string' ? m : null, todayInIndia())
  const [{ insights: s, owed }, costs] = await Promise.all([getInsights(periods), getCosts(periods)])
  const spent = total(costs.costs)
  // What is left of the money collected once the month's costs are paid
  const left = Math.round((s.money.total - spent) * 100) / 100
  const monthName = formatDate(`${periods.month}-01`, { month: 'long', year: 'numeric' })
  const sinceWhen = periods.running ? 'same days last month' : 'the month before'

  const versus = (now: number, before: number, money = false) => {
    if (now === 0 && before === 0) return null
    const show = (n: number) => (money ? formatRupees(n) : String(n))
    if (now === before) return `Same as the ${sinceWhen}`
    return `${now > before ? '↑' : '↓'} from ${show(before)} (${sinceWhen})`
  }

  const parts = {
    money: s.money.total > 0 || s.money.before > 0,
    visits: s.visits.count > 0 || s.visits.before > 0,
    patients: s.newPatients.count > 0 || s.newPatients.before > 0,
    website: s.website.requests > 0 || s.website.before > 0,
    missed: s.missed.didntCome > 0 || s.missed.before > 0,
    treatments: s.treatments.length > 0,
    owed: !!owed && owed.amount > 0,
  }
  const anything = Object.values(parts).some(Boolean)
  const topSource = Math.max(1, ...s.newPatients.sources.map((x) => x.count))

  return (
    <div className="space-y-4 pb-4">
      <PracticeTabs />
      <div className="flex items-center justify-between">
        <Link href={`/app/insights?m=${previousMonth(periods.month)}`} aria-label="Previous month"
          className="-ml-3 flex h-12 w-12 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{periods.running ? 'This month' : monthName}</h1>
          <p className="text-sm font-medium text-gray-500">
            {periods.running ? `${monthName}, up to today` : `1 to ${formatDate(periods.current.to, { day: 'numeric', month: 'long' })}`}
          </p>
        </div>
        {periods.running ? <span className="h-12 w-12" aria-hidden="true" /> : (
          <Link href={`/app/insights?m=${nextMonth(periods.month)}`} aria-label="Next month"
            className="-mr-3 flex h-12 w-12 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50">
            <ChevronRight className="h-6 w-6" />
          </Link>
        )}
      </div>

      {!anything && (
        <p className="rounded-2xl bg-white p-6 text-center text-base text-gray-600 shadow-sm ring-1 ring-gray-200">
          Nothing recorded yet. Your numbers appear here as you record visits and payments.
        </p>
      )}

      {parts.money && (
        <section className={card} aria-label="Money collected">
          <p className={label}>Money collected</p>
          <p className={big}>{formatRupees(s.money.total)}</p>
          <p className="mt-1 text-sm text-gray-700">
            {formatRupees(s.money.cash)} cash · {formatRupees(s.money.upi)} UPI · {s.money.count} payment{s.money.count === 1 ? '' : 's'}
          </p>
          <Versus text={versus(s.money.total, s.money.before, true)} />
        </section>
      )}

      {costs.ready && (
        <Link href={periods.running ? '/app/costs' : `/app/costs?m=${periods.month}`} className={`${card} block hover:ring-blue-300`} aria-label="Costs and what is left">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={label}>Spent</p>
              <p className="hud-mono mt-1 text-2xl font-bold tracking-tight text-gray-900">{formatRupees(spent)}</p>
            </div>
            <div>
              <p className={label}>Left after costs</p>
              <p className={`hud-mono mt-1 text-2xl font-bold tracking-tight ${left < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatRupees(left)}</p>
            </div>
          </div>
          <p className="mt-2 flex items-center justify-between gap-2 text-sm font-semibold text-blue-700">
            {spent === 0 ? 'Record what you spend to see what is left' : 'Costs and regular bills'}
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </p>
        </Link>
      )}

      {parts.owed && owed && (
        <Link href="/app" className={`${card} block ring-amber-200 hover:ring-[var(--hud-amber)]`} aria-label="Owed to you">
          <p className={label}>Owed to you right now</p>
          <p className="hud-mono mt-1 text-3xl font-bold tracking-tight text-[var(--hud-amber-text)]">{formatRupees(owed.amount)}</p>
          <p className="mt-1 text-sm text-gray-700">by {owed.patients} patient{owed.patients === 1 ? '' : 's'} · see who on Today</p>
        </Link>
      )}

      {(parts.visits || parts.patients) && (
        <div className="grid grid-cols-2 gap-3">
          {parts.visits && (
            <section className={card} aria-label="Visits">
              <p className={label}>Visits</p>
              <p className={big}>{s.visits.count}</p>
              <p className="mt-1 text-sm text-gray-700">{s.visits.patients} patient{s.visits.patients === 1 ? '' : 's'}</p>
              <Versus text={versus(s.visits.count, s.visits.before)} />
            </section>
          )}
          {parts.patients && (
            <section className={card} aria-label="New patients">
              <p className={label}>New patients</p>
              <p className={big}>{s.newPatients.count}</p>
              <Versus text={versus(s.newPatients.count, s.newPatients.before)} />
            </section>
          )}
        </div>
      )}

      {s.newPatients.sources.length > 0 && (
        <section className={card} aria-label="How new patients heard of you">
          <p className={label}>How new patients heard of you</p>
          <ul className="mt-3 space-y-2">
            {s.newPatients.sources.map((source) => (
              <li key={source.label} className="text-sm">
                <div className="flex justify-between gap-3"><span className="text-gray-800">{source.label}</span><span className="hud-mono font-semibold text-gray-900">{source.count}</span></div>
                <div className="mt-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${(source.count / topSource) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {parts.website && (
        <section className={card} aria-label="Website bookings">
          <p className={label}>Website bookings</p>
          <p className={big}>{s.website.requests}</p>
          <p className="mt-1 text-sm text-gray-700">{s.website.booked} confirmed</p>
          <Versus text={versus(s.website.requests, s.website.before)} />
        </section>
      )}

      {parts.missed && (
        <section className={card} aria-label="Didn't come">
          <p className={label}>Didn&apos;t come</p>
          <p className={big}>{s.missed.didntCome}</p>
          {s.missed.outOf > 0 && <p className="mt-1 text-sm text-gray-700">of {s.missed.outOf} booked patient{s.missed.outOf === 1 ? '' : 's'} (seen or missed)</p>}
          <Versus text={versus(s.missed.didntCome, s.missed.before)} />
        </section>
      )}

      {parts.treatments && (
        <section className={card} aria-label="Most billed treatments">
          <p className={label}>Most billed treatments</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {s.treatments.map((t) => (
              <li key={t.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 text-gray-800">{t.name} <span className="text-gray-500">× {t.count}</span></span>
                <span className="hud-mono shrink-0 font-semibold text-gray-900">{formatRupees(t.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/app/tally" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-blue-700 ring-1 ring-gray-300 hover:bg-blue-50">
        <Download className="h-5 w-5" /> Send to Tally
      </Link>
    </div>
  )
}

export default function InsightsPage(props: PageProps<'/app/insights'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <InsightsContent {...props} />
    </Suspense>
  )
}
