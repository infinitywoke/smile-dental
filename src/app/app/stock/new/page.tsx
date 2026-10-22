import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { StockItemForm } from '@/components/clinic/StockItemForm'

async function NewStockItem() {
  await getDoctor()
  return (
    <div className="space-y-4">
      <BackLink href="/app/stock" label="Stock" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add an item</h1>
      <StockItemForm />
    </div>
  )
}

export default function NewStockItemPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <NewStockItem />
    </Suspense>
  )
}
