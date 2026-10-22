import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { todayInIndia } from '@/lib/dates'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { FixedCostForm } from '@/components/clinic/FixedCostForm'

async function NewRegularBill() {
  await getDoctor()
  return (
    <div className="space-y-4">
      <BackLink href="/app/costs/regular" label="Regular bills" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add a regular bill</h1>
      <FixedCostForm today={todayInIndia()} />
    </div>
  )
}

export default function NewRegularBillPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <NewRegularBill />
    </Suspense>
  )
}
