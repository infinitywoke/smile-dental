import { Suspense } from 'react'
import { getClinicId } from '@/lib/auth'
import { todayInIndia } from '@/lib/dates'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { CostForm } from '@/components/clinic/CostForm'

async function NewCost() {
  const clinicId = await getClinicId()
  return (
    <div className="space-y-4">
      <BackLink href="/app/costs" label="Costs" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add a cost</h1>
      <CostForm folder={clinicId} today={todayInIndia()} />
    </div>
  )
}

export default function NewCostPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <NewCost />
    </Suspense>
  )
}
