import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getFixedCosts } from '@/lib/data/costs'
import { formatDate } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { categoryLabel, whenDue } from '@/lib/costs'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'

// The bills that come every month or every year
async function RegularBills() {
  await getDoctor()
  const { ready, bills } = await getFixedCosts()
  return (
    <div className="space-y-4">
      <BackLink href="/app/costs" label="Costs" />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Regular bills</h1>
        {ready && (
          <Link href="/app/costs/regular/new" className="flex min-h-12 items-center gap-1.5 rounded-full bg-blue-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700">
            <Plus className="h-5 w-5" aria-hidden="true" /> Add
          </Link>
        )}
      </div>
      {!ready ? (
        <p className="rounded-2xl bg-white p-6 text-center text-base text-gray-600 shadow-sm ring-1 ring-gray-200">Costs aren&apos;t switched on yet.</p>
      ) : bills.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-base text-gray-600 shadow-sm ring-1 ring-gray-200">
          No regular bills yet. Add rent, electricity, internet and software once; then mark them paid each month.
        </p>
      ) : (
        <ul aria-label="Regular bills" className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {bills.map((b) => (
            <li key={b.id}>
              <Link href={`/app/costs/regular/${b.id}`} className={`flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-gray-50 ${b.ends_on ? 'opacity-60' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-gray-900">{b.name}</span>
                  <span className="block text-sm text-gray-500">
                    {b.ends_on ? `Stopped ${formatDate(b.ends_on)}` : `${formatRupees(b.amount)} ${whenDue(b)}`} · {categoryLabel(b.category)}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RegularBillsPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <RegularBills />
    </Suspense>
  )
}
