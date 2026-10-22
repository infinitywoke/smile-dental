'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { STOCK_KINDS, expiresSoon, isLow, qtyWithUnit, type StockLevel } from '@/lib/stock'

const SEARCH_FROM = 8
const kindLabel = Object.fromEntries(STOCK_KINDS.map((k) => [k.value, k.label]))

// The stock list: low first, then what expires soon. A search box once the list is long.
export function StockList({ levels, today }: { levels: StockLevel[]; today: string }) {
  const [query, setQuery] = useState('')
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = words.length === 0 ? levels : levels.filter((s) => words.every((w) => `${s.name} ${s.supplier} ${kindLabel[s.category]}`.toLowerCase().includes(w)))

  return (
    <div className="space-y-3">
      {levels.length >= SEARCH_FROM && (
        <label className="relative block">
          <span className="sr-only">Find an item</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item"
            className="block min-h-12 w-full rounded-xl border-0 py-3 pr-4 pl-11 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
        </label>
      )}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-base text-gray-500">Nothing on the list matches “{query.trim()}”.</p>
      ) : (
        <ul aria-label="Stock" className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {shown.map((s) => {
            const low = isLow(s)
            const soon = expiresSoon(s.next_expiry, today)
            return (
              <li key={s.item_id}>
                <Link href={`/app/stock/${s.item_id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-gray-900">{s.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
                      {low && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-red-200">Low</span>}
                      {soon && s.next_expiry && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                          Expires {formatDate(s.next_expiry, { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      <span className="truncate">{kindLabel[s.category]}{s.supplier ? ` · ${s.supplier}` : ''}</span>
                    </span>
                  </span>
                  <span className={`hud-mono shrink-0 text-right text-sm font-bold tabular-nums ${low ? 'text-red-700' : 'text-gray-900'}`}>
                    {qtyWithUnit(s.on_hand, s.unit)}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
