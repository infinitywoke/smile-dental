import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { getStockItem } from '@/lib/data/stock'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { StockItemForm } from '@/components/clinic/StockItemForm'

async function EditStockItem({ params }: PageProps<'/app/stock/[id]/edit'>) {
  await getDoctor()
  const { id } = await params
  const found = await getStockItem(id)
  if (!found || found.archived) notFound()
  return (
    <div className="space-y-4">
      <BackLink href={`/app/stock/${id}`} label={found.level.name} />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit item</h1>
      <StockItemForm item={found.level} />
    </div>
  )
}

export default function EditStockItemPage(props: PageProps<'/app/stock/[id]/edit'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <EditStockItem {...props} />
    </Suspense>
  )
}
