import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronRight, FileSpreadsheet, ListChecks, Plus } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getStock } from '@/lib/data/stock'
import { todayInIndia } from '@/lib/dates'
import { EXPIRY_WARNING_DAYS, sortStock, stockAlerts } from '@/lib/stock'
import { ScreenLoading } from '@/components/clinic/ui'
import { StockList } from '@/components/clinic/StockList'
import { PracticeTabs } from '@/components/clinic/PracticeTabs'

// What the clinic keeps: how much is left of each thing, what is low and what expires soon
async function StockContent() {
  await getDoctor()
  const today = todayInIndia()
  const { ready, levels } = await getStock()
  const alerts = stockAlerts(levels, today)
  const summary = [
    alerts.low > 0 && `${alerts.low} low`,
    alerts.expiring > 0 && `${alerts.expiring} expire${alerts.expiring === 1 ? 's' : ''} within ${EXPIRY_WARNING_DAYS} days`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      <PracticeTabs />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Stock</h1>
        {ready && (
          <Link href="/app/stock/new" className="flex min-h-12 items-center gap-1.5 rounded-full bg-blue-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700">
            <Plus className="h-5 w-5" aria-hidden="true" /> Add item
          </Link>
        )}
      </div>

      {!ready ? (
        <p className="rounded-2xl bg-white p-6 text-center text-base text-gray-600 shadow-sm ring-1 ring-gray-200">Stock isn&apos;t switched on yet.</p>
      ) : levels.length === 0 ? (
        <div className="space-y-2 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-200">
          <p className="text-base font-semibold text-gray-900">Nothing on the list yet</p>
          <p className="text-base text-gray-600">Add what you buy and keep: materials, medicines, gloves. Then you&apos;ll see what is running low.</p>
          <Link href="/app/stock/import" className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-base font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
            <FileSpreadsheet className="h-5 w-5 text-gray-500" aria-hidden="true" /> Load the spreadsheet
          </Link>
        </div>
      ) : (
        <>
          {summary && <p className="text-base font-semibold text-gray-700" role="status">{summary}</p>}
          <Link href="/app/stock/materials" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">
            <ListChecks className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-base font-semibold text-gray-900">What each treatment uses</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
          </Link>
          <StockList levels={sortStock(levels, today)} today={today} />
          <Link href="/app/stock/import" className="flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-base font-semibold text-gray-700 hover:bg-gray-100">
            <FileSpreadsheet className="h-5 w-5 text-gray-500" aria-hidden="true" /> Load the spreadsheet
          </Link>
        </>
      )}
    </div>
  )
}

export default function StockPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <StockContent />
    </Suspense>
  )
}
