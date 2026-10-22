import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getCost } from '@/lib/data/costs'
import { formatDate } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { PAID_BY, categoryLabel } from '@/lib/costs'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { DeleteCostButton } from '@/components/clinic/CostButtons'

const paidByLabel = Object.fromEntries(PAID_BY.map((p) => [p.value, p.label]))

// One cost: what, to whom, how and when, and the bill photo
async function CostContent({ params }: PageProps<'/app/costs/[id]'>) {
  await getDoctor()
  const { id } = await params
  const found = await getCost(id)
  if (!found) notFound()
  const { cost: c, billUrl, billName } = found
  const month = c.spent_on.slice(0, 7)

  return (
    <div className="space-y-5">
      <BackLink href={`/app/costs?m=${month}`} label="Costs" />
      <section aria-label="Cost" className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{c.payee || categoryLabel(c.category)}</h1>
          <p className="text-sm text-gray-500">{categoryLabel(c.category)}{billName ? ` · regular bill: ${billName}` : ''}</p>
        </div>
        <p className="text-4xl font-bold tabular-nums tracking-tight text-gray-900">{formatRupees(c.amount)}</p>
        <p className="text-base text-gray-700">Paid by {paidByLabel[c.paid_by] ?? c.paid_by} on {formatDate(c.spent_on, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
        {c.note && <p className="text-base text-gray-700">{c.note}</p>}
      </section>

      {c.bill_path && (
        billUrl ? (
          c.bill_path.endsWith('.pdf') ? (
            <a href={billUrl} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 text-base font-semibold text-blue-700 ring-1 ring-gray-200">
              <FileText className="h-6 w-6" aria-hidden="true" /> Open the bill
            </a>
          ) : (
            <a href={billUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl ring-1 ring-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed link from private storage */}
              <img src={billUrl} alt="The bill" className="max-h-[70vh] w-full bg-white object-contain" />
            </a>
          )
        ) : (
          <p className="rounded-2xl bg-white p-4 text-sm text-gray-600 ring-1 ring-gray-200">The bill photo can&apos;t be shown right now.</p>
        )
      )}

      <DeleteCostButton costId={c.id} month={month} />
    </div>
  )
}

export default function CostPage(props: PageProps<'/app/costs/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <CostContent {...props} />
    </Suspense>
  )
}
