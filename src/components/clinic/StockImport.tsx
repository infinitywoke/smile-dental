'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, FileSpreadsheet } from 'lucide-react'
import { loadStockSpreadsheet } from '@/lib/actions/stock-import'
import { categoryLabel, whenDue } from '@/lib/costs'
import { formatDate } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { STOCK_KINDS, formatQty, qtyWithUnit } from '@/lib/stock'
import { planStockImport, sheetsToSend, type ImportExisting, type ImportMaterial } from '@/lib/stock-import'
import { readXlsx, type Sheets } from '@/lib/xlsx'

const MAX_FILE = 5_000_000
const kindLabel = Object.fromEntries(STOCK_KINDS.map((k) => [k.value, k.label]))
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// "24 items, 4 regular bills, what 12 treatments use and the price list"
function adds(items: number, bills: number, treatments: number, prices = false): string {
  const parts = [
    items > 0 && count(items, 'item'),
    bills > 0 && count(bills, 'regular bill'),
    treatments > 0 && `what ${count(treatments, 'treatment')} ${treatments === 1 ? 'uses' : 'use'}`,
    prices && 'the price list',
  ].filter((p): p is string => Boolean(p))
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] ?? ''
}

const listClass = 'divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

// Picking the filled-in spreadsheet, seeing what it adds and what it can't take, then loading it once
export function StockImport({ existing, today }: { existing: ImportExisting; today: string }) {
  const router = useRouter()
  const picker = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; sheets: Sheets } | null>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState('')
  const [pending, startTransition] = useTransition()
  // Worked out again whenever the screen's data changes, so what was just loaded shows as already in
  const plan = useMemo(() => (file ? planStockImport(file.sheets, existing, today) : null), [file, existing, today])

  async function pick(chosen: File | undefined) {
    if (picker.current) picker.current.value = ''
    if (!chosen) return
    setError('')
    setLoaded('')
    setFile(null)
    if (chosen.size > MAX_FILE) return setError('This file is too big to be the Stock and costs spreadsheet. Please pick that file.')
    try {
      setFile({ name: chosen.name, sheets: sheetsToSend(readXlsx(new Uint8Array(await chosen.arrayBuffer()))) })
    } catch {
      setError('This file couldn’t be read. Save it as an Excel workbook (.xlsx) and pick it again.')
    }
  }

  function load() {
    if (!file) return
    setError('')
    startTransition(async () => {
      const result = await loadStockSpreadsheet(file.sheets)
      router.refresh()
      if (!result.ok) return setError(result.error)
      navigator.vibrate?.(10)
      setFile(null)
      setLoaded(adds(result.items, result.bills, result.treatments, result.prices !== null) || 'nothing new: it was all in Clinic OS already')
    })
  }

  const byTreatment = new Map<string, ImportMaterial[]>()
  for (const m of plan?.materials ?? []) byTreatment.set(m.description, [...(byTreatment.get(m.description) ?? []), m])
  const summary = plan ? adds(plan.items.length, plan.bills.length, byTreatment.size, !!plan.priceList) : ''

  return (
    <div className="space-y-5">
      <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-label="The spreadsheet"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" onClick={() => picker.current?.click()} disabled={pending}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60">
        <FileSpreadsheet className="h-5 w-5 text-gray-500" aria-hidden="true" />
        {file ? 'Pick another file' : 'Pick the spreadsheet'}
      </button>

      {loaded && (
        <div role="status" className="space-y-3 rounded-2xl bg-green-50 p-4 ring-1 ring-green-200">
          <p className="text-base font-semibold text-green-900">Loaded {loaded}.</p>
          <div className="space-y-2">
            {[{ href: '/app/stock', label: 'See the stock list' }, { href: '/app/costs/regular', label: 'Regular bills' }, { href: '/app/stock/materials', label: 'What each treatment uses' }, { href: '/treatments', label: 'The price list on the website' }].map((l) => (
              <Link key={l.href} href={l.href} className="flex min-h-12 items-center gap-3 rounded-xl bg-white px-4 text-base font-semibold text-gray-900 ring-1 ring-green-200 hover:bg-gray-50">
                <span className="min-w-0 flex-1">{l.label}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}

      {file && plan && !plan.found && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">
          “{file.name}” isn’t the Stock and costs spreadsheet: it has no Supplies, Regular bills, Materials per treatment or Treatments sheet.
        </p>
      )}

      {file && plan?.found && (
        <>
          {(plan.items.length > 0 || plan.existingItems.length > 0) && (
            <Section title={`Stock items (${plan.items.length})`}>
              {plan.items.length > 0 && (
                <ul aria-label="New stock items" className={listClass}>
                  {plan.items.map((i) => (
                    <li key={i.row} className="px-4 py-3">
                      <span className="block text-base font-semibold text-gray-900">{i.name}</span>
                      <span className="mt-0.5 block text-sm text-gray-500">
                        {[
                          qtyWithUnit(i.qty, i.unit),
                          i.lowLevel > 0 && `warn at ${formatQty(i.lowLevel)}`,
                          i.price !== null && `${formatRupees(i.price)} each`,
                          i.expiresOn && `expires ${formatDate(i.expiresOn)}`,
                          kindLabel[i.category],
                          i.supplier,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {plan.existingItems.length > 0 && (
                <p className="text-sm text-gray-600">Already on the stock list, left as they are: {plan.existingItems.join(', ')}.</p>
              )}
            </Section>
          )}

          {(plan.bills.length > 0 || plan.existingBills.length > 0) && (
            <Section title={`Regular bills (${plan.bills.length})`}>
              {plan.bills.length > 0 && (
                <ul aria-label="New regular bills" className={listClass}>
                  {plan.bills.map((b) => (
                    <li key={b.row} className="px-4 py-3">
                      <span className="block text-base font-semibold text-gray-900">{b.name}</span>
                      <span className="mt-0.5 block text-sm text-gray-500">
                        {formatRupees(b.amount)} {whenDue({ every: b.every, starts_on: b.startsOn })} · {categoryLabel(b.category)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {plan.existingBills.length > 0 && (
                <p className="text-sm text-gray-600">Already in Regular bills, left as they are: {plan.existingBills.join(', ')}.</p>
              )}
            </Section>
          )}

          {(byTreatment.size > 0 || plan.existingMaterials > 0) && (
            <Section title={`What each treatment uses (${byTreatment.size})`}>
              {byTreatment.size > 0 && <ul aria-label="What treatments use" className={listClass}>
                {[...byTreatment].map(([description, uses]) => (
                  <li key={description} className="px-4 py-3">
                    <span className="block text-base font-semibold text-gray-900">{description}</span>
                    <span className="mt-0.5 block text-sm text-gray-500">
                      {uses.map((m) => `${m.item}: ${qtyWithUnit(m.qty, m.unit)}`).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>}
              <p className="text-sm text-gray-600">
                {byTreatment.size > 0 && 'Adding one of these to a visit takes its items off stock by itself. '}
                {plan.existingMaterials > 0 && `${count(plan.existingMaterials, 'item')} already set for ${plan.existingMaterials === 1 ? 'its treatment is' : 'their treatments are'} left as they are.`}
              </p>
            </Section>
          )}

          {plan.priceList && (
            <Section title="Treatments and prices">
              <p className="text-sm text-gray-600">
                The sheet becomes the price list: for bills in Clinic OS, and the prices on the website. {count(plan.priceList.rows.length, 'option')} in all.
              </p>
              {[
                { label: 'New', names: plan.priceList.added.map((n) => [n, '']) },
                { label: 'Price changes', names: plan.priceList.changed.map((c) => [c.name, `${c.from} → ${c.to}`]) },
                { label: 'Coming off the list', names: plan.priceList.removed.map((n) => [n, '']) },
              ].filter((g) => g.names.length > 0).map((g) => (
                <ul key={g.label} aria-label={g.label} className={listClass}>
                  <li className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">{g.label} ({g.names.length})</li>
                  {g.names.map(([name, change]) => (
                    <li key={name} className="px-4 py-3">
                      <span className="block text-base font-semibold text-gray-900">{name}</span>
                      {change && <span className="mt-0.5 block text-sm text-gray-500">{change}</span>}
                    </li>
                  ))}
                </ul>
              ))}
              {plan.priceList.added.length + plan.priceList.changed.length + plan.priceList.removed.length === 0 && (
                <p className="text-sm text-gray-600">The same prices; only the order or the words change.</p>
              )}
            </Section>
          )}

          {plan.labFees > 0 && (
            <p className="rounded-2xl bg-white p-4 text-sm text-gray-700 shadow-sm ring-1 ring-gray-200">
              <span className="font-semibold text-gray-900">Lab fees ({plan.labFees}) aren’t loaded:</span> Clinic OS has no list of lab fees yet.
              When you pay the lab, add it under Costs as Lab.
            </p>
          )}

          {plan.notes.length > 0 && (
            <section aria-label="Check these" className="space-y-2 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <h2 className="text-base font-bold text-amber-900">Check these ({plan.notes.length})</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-amber-900">
                {plan.notes.map((n, index) => (
                  <li key={index}>{n.sheet}{n.row ? `, row ${n.row}` : ''}: {n.text}</li>
                ))}
              </ul>
              <p className="text-sm text-amber-900">To fix a row, change it in the spreadsheet and pick the file again, or add it in the app later.</p>
            </section>
          )}

          {summary ? (
            // Sits right on top of the bottom bar, as the booking screens' Save does
            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 space-y-1.5 border-t border-gray-200 bg-gray-50 px-4 pt-2 pb-2">
              <p className="text-center text-sm text-gray-600">Adds {summary}.</p>
              <button type="button" onClick={load} disabled={pending}
                className="min-h-14 w-full rounded-full bg-blue-600 px-5 py-4 text-lg font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50">
                {pending ? 'Loading…' : 'Load into Clinic OS'}
              </button>
            </div>
          ) : (
            <p role="status" className="rounded-2xl bg-white p-4 text-base text-gray-700 shadow-sm ring-1 ring-gray-200">
              {plan.existingItems.length + plan.existingBills.length + plan.existingMaterials > 0
                ? 'Nothing new to load: what is on it is already in Clinic OS.'
                : 'Nothing on it to load yet. Fill in the sheets, then pick it again.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
