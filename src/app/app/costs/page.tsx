import { Suspense } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronLeft, ChevronRight, Paperclip, Plus, Repeat } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getCosts } from '@/lib/data/costs'
import { formatDate, todayInIndia } from '@/lib/dates'
import { monthPeriods, nextMonth, previousMonth } from '@/lib/insights'
import { formatRupees } from '@/lib/pricing'
import { billsFor, byCategory, categoryLabel, total } from '@/lib/costs'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { MarkPaidButton } from '@/components/clinic/CostButtons'

const card = 'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200'
const label = 'hud-mono text-[11px] font-bold tracking-[0.14em] text-gray-500 uppercase'
const short = (date: string) => formatDate(date, { day: 'numeric', month: 'short' })

// A month's costs: what was spent and on what, the regular bills due (marked paid with one tap), and every cost
async function CostsContent({ searchParams }: PageProps<'/app/costs'>) {
  await getDoctor()
  const { m } = await searchParams
  const today = todayInIndia()
  const periods = monthPeriods(typeof m === 'string' ? m : null, today)
  const { ready, costs, before, bills } = await getCosts(periods)
  const monthName = formatDate(`${periods.month}-01`, { month: 'long', year: 'numeric' })
  const spent = total(costs)
  const due = billsFor(bills, costs, periods.month)
  const kinds = byCategory(costs)
  const top = Math.max(1, ...kinds.map((k) => k.amount))
  const sinceWhen = periods.running ? 'same days last month' : 'the month before'
  const versus = spent === 0 && before === 0 ? null
    : spent === before ? `Same as the ${sinceWhen}` : `${spent > before ? '↑' : '↓'} from ${formatRupees(before)} (${sinceWhen})`

  return (
    <div className="space-y-4 pb-4">
      <BackLink href={periods.running ? '/app/insights' : `/app/insights?m=${periods.month}`} label="Money" />
      <div className="flex items-center justify-between">
        <Link href={`/app/costs?m=${previousMonth(periods.month)}`} aria-label="Previous month"
          className="-ml-3 flex h-12 w-12 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Costs</h1>
          <p className="text-sm font-medium text-gray-500">{monthName}</p>
        </div>
        {periods.running ? <span className="h-12 w-12" aria-hidden="true" /> : (
          <Link href={`/app/costs?m=${nextMonth(periods.month)}`} aria-label="Next month"
            className="-mr-3 flex h-12 w-12 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50">
            <ChevronRight className="h-6 w-6" />
          </Link>
        )}
      </div>

      {!ready ? (
        <p className={`${card} text-center text-base text-gray-600`}>Costs aren&apos;t switched on yet.</p>
      ) : (
        <>
          <section className={card} aria-label="Spent">
            <p className={label}>Spent</p>
            <p className="hud-mono mt-1 text-3xl font-bold tracking-tight text-gray-900">{formatRupees(spent)}</p>
            {versus && <p className="mt-1 text-sm text-gray-500">{versus}</p>}
            {kinds.length > 0 && (
              <ul className="mt-3 space-y-2">
                {kinds.map((k) => (
                  <li key={k.category} className="text-sm">
                    <div className="flex justify-between gap-3"><span className="text-gray-800">{k.label}</span><span className="hud-mono font-semibold text-gray-900">{formatRupees(k.amount)}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-[var(--hud-amber)]" style={{ width: `${(k.amount / top) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3">
            <Link href="/app/costs/new" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700">
              <Plus className="h-5 w-5" aria-hidden="true" /> Add a cost
            </Link>
            <Link href="/app/costs/regular" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-base font-semibold text-blue-700 ring-1 ring-gray-300 hover:bg-blue-50">
              <Repeat className="h-5 w-5" aria-hidden="true" /> Regular bills
            </Link>
          </div>

          {due.length > 0 ? (
            <section className={card} aria-label="Regular bills this month">
              <p className={label}>Regular bills</p>
              <ul className="mt-2 divide-y divide-gray-100">
                {due.map((b) => (
                  <li key={b.id} className="flex min-h-14 items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-gray-900">{b.name}</p>
                      <p className="text-sm text-gray-500">
                        {b.paid ? `Paid ${short(b.paid.spent_on)} · ${formatRupees(b.paid.amount)}` : `Due ${short(b.due)} · ${formatRupees(b.amount)}`}
                      </p>
                    </div>
                    {b.paid ? (
                      <Link href={`/app/costs/${b.paid.id}`} className="flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-green-700">
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Paid
                      </Link>
                    ) : (
                      <MarkPaidButton bill={{ id: b.id, name: b.name, amount: b.amount }} today={today} paidOn={b.due < today ? b.due : today} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : bills.length === 0 && (
            <Link href="/app/costs/regular/new" className={`${card} block hover:ring-blue-300`}>
              <p className="text-base font-semibold text-gray-900">Add your regular bills</p>
              <p className="mt-1 text-sm text-gray-600">Rent, electricity, internet, software. Add each one once; every month you mark it paid with one tap.</p>
            </Link>
          )}

          <section aria-label="Costs this month" className="space-y-2">
            <h2 className="hud-heading">Every cost</h2>
            {costs.length === 0 ? (
              <p className="text-base text-gray-500">Nothing recorded for {monthName}.</p>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                {costs.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/costs/${c.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-gray-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-gray-900">{c.payee || categoryLabel(c.category)}</span>
                        <span className="block truncate text-sm text-gray-500">
                          {short(c.spent_on)} · {categoryLabel(c.category)}{c.note ? ` · ${c.note}` : ''}
                        </span>
                      </span>
                      {c.bill_path && <Paperclip className="h-4 w-4 shrink-0 text-gray-400" aria-label="Has a bill photo" />}
                      <span className="hud-mono shrink-0 text-base font-semibold text-gray-900">{formatRupees(c.amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default function CostsPage(props: PageProps<'/app/costs'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <CostsContent {...props} />
    </Suspense>
  )
}
