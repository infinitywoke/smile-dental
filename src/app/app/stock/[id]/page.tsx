import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getStockItem } from '@/lib/data/stock'
import { formatDate, todayInIndia } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { inIndia } from '@/lib/schedule'
import { STOCK_KINDS, expiresSoon, isLow, moveLine, qtyWithUnit } from '@/lib/stock'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { RemoveMoveButton, StockActions } from '@/components/clinic/StockActions'

const kindLabel = Object.fromEntries(STOCK_KINDS.map((k) => [k.value, k.label]))

// One item: how much is left, the three things he does with it, and what came in and went out
async function StockItemContent({ params }: PageProps<'/app/stock/[id]'>) {
  await getDoctor()
  const { id } = await params
  const found = await getStockItem(id)
  if (!found) notFound()
  const { level: s, archived, moves } = found
  const today = todayInIndia()
  const low = isLow(s)
  const soon = expiresSoon(s.next_expiry, today)

  return (
    <div className="space-y-5">
      <BackLink href="/app/stock" label="Stock" />

      <section aria-label="On hand" className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{s.name}</h1>
            <p className="text-sm text-gray-500">{kindLabel[s.category]}{s.supplier ? ` · ${s.supplier}` : ''}</p>
          </div>
          {!archived && (
            <Link href={`/app/stock/${s.item_id}/edit`} aria-label="Edit item"
              className="-mt-1 -mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50">
              <Pencil className="h-5 w-5" />
            </Link>
          )}
        </div>
        <p className={`hud-mono text-4xl font-bold tabular-nums tracking-tight ${low ? 'text-red-700' : 'text-gray-900'}`}>{qtyWithUnit(s.on_hand, s.unit)}</p>
        <ul className="space-y-1 text-sm text-gray-700">
          {low && <li className="font-semibold text-red-700">Low: at or below {qtyWithUnit(s.low_level, s.unit)}</li>}
          {!low && s.low_level > 0 && <li>Warns you at {qtyWithUnit(s.low_level, s.unit)}</li>}
          {s.next_expiry && <li className={soon ? 'font-semibold text-amber-800' : ''}>Next expiry {formatDate(s.next_expiry)}</li>}
          {s.last_unit_cost !== null && <li>Last price {formatRupees(s.last_unit_cost)} each</li>}
          {s.on_hand < 0 && <li>Below zero: count it to put this right.</li>}
        </ul>
        {archived && <p className="rounded-xl bg-gray-100 p-3 text-sm text-gray-700">Removed from the stock list.</p>}
      </section>

      {!archived && <StockActions itemId={s.item_id} unit={s.unit} onHand={s.on_hand} lastPrice={s.last_unit_cost} />}

      <section aria-label="History" className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900">History</h2>
        {moves.length === 0 ? (
          <p className="text-base text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base text-gray-900">{moveLine(m, s.unit)}</p>
                  <p className="text-sm text-gray-500">
                    {formatDate(inIndia(m.moved_at).date, { day: 'numeric', month: 'short' })}
                    {m.note && !m.charge_id ? ` · ${m.note}` : ''}
                    {m.charge_id ? ' · from a visit' : ''}
                  </p>
                </div>
                {!m.charge_id && !archived && <RemoveMoveButton moveId={m.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function StockItemPage(props: PageProps<'/app/stock/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <StockItemContent {...props} />
    </Suspense>
  )
}
