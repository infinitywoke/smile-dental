import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { getFixedCosts } from '@/lib/data/costs'
import { getTreatments } from '@/lib/data/price-list'
import { getStock, getTreatmentMaterials } from '@/lib/data/stock'
import { todayInIndia } from '@/lib/dates'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { StockImport } from '@/components/clinic/StockImport'

// Loading the filled-in "Stock and costs" spreadsheet once, after seeing what it adds
async function ImportContent() {
  await getDoctor()
  const [stock, costs, materials, priceList] = await Promise.all([getStock(), getFixedCosts(), getTreatmentMaterials(), getTreatments()])
  const nameOf = new Map(stock.levels.map((l) => [l.item_id, l.name]))
  return (
    <div className="space-y-4">
      <BackLink href="/app/stock" label="Stock" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Load the spreadsheet</h1>
        <p className="mt-1 text-base text-gray-600">
          Pick the filled-in “Stock and costs” spreadsheet. You’ll see everything it adds before anything is saved.
        </p>
      </div>
      {stock.ready && costs.ready ? (
        <StockImport
          today={todayInIndia()}
          existing={{
            items: stock.levels.map((l) => ({ name: l.name, unit: l.unit })),
            bills: costs.bills.filter((b) => !b.ends_on).map((b) => b.name),
            materials: materials.filter((m) => nameOf.has(m.item_id))
              .map((m) => ({ description: m.charge_description, item: nameOf.get(m.item_id)!, qty: m.qty })),
            priceList,
          }}
        />
      ) : (
        <p className="rounded-2xl bg-white p-6 text-center text-base text-gray-600 shadow-sm ring-1 ring-gray-200">Stock isn&apos;t switched on yet.</p>
      )}
    </div>
  )
}

export default function StockImportPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <ImportContent />
    </Suspense>
  )
}
