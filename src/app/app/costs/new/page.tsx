import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { todayInIndia } from '@/lib/dates'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { CostForm } from '@/components/clinic/CostForm'

async function NewCost() {
  const doctor = await getDoctor()
  return (
    <div className="space-y-4">
      <BackLink href="/app/costs" label="Costs" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add a cost</h1>
      <CostForm doctorId={doctor.id} today={todayInIndia()} />
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
