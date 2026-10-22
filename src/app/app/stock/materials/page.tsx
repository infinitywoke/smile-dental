import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { getStock, getTreatmentMaterials } from '@/lib/data/stock'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { TreatmentMaterials } from '@/components/clinic/TreatmentMaterials'

// What each treatment on the price list uses from stock, and what those materials cost
async function MaterialsContent() {
  await getDoctor()
  const [{ ready, levels }, materials] = await Promise.all([getStock(), getTreatmentMaterials()])
  return (
    <div className="space-y-4">
      <BackLink href="/app/stock" label="Stock" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">What each treatment uses</h1>
        <p className="mt-1 text-base text-gray-600">Set it once. Adding the treatment to a visit then takes these off stock by itself.</p>
      </div>
      {ready ? <TreatmentMaterials levels={levels} materials={materials} />
        : <p className="rounded-2xl bg-white p-6 text-center text-base text-gray-600 shadow-sm ring-1 ring-gray-200">Stock isn&apos;t switched on yet.</p>}
    </div>
  )
}

export default function MaterialsPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <MaterialsContent />
    </Suspense>
  )
}
