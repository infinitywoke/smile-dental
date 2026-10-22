import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { getFixedCosts } from '@/lib/data/costs'
import { todayInIndia } from '@/lib/dates'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { FixedCostForm } from '@/components/clinic/FixedCostForm'

async function EditRegularBill({ params }: PageProps<'/app/costs/regular/[id]'>) {
  await getDoctor()
  const { id } = await params
  const { bills } = await getFixedCosts()
  const bill = bills.find((b) => b.id === id)
  if (!bill) notFound()
  return (
    <div className="space-y-4">
      <BackLink href="/app/costs/regular" label="Regular bills" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{bill.name}</h1>
      <FixedCostForm bill={bill} today={todayInIndia()} />
    </div>
  )
}

export default function EditRegularBillPage(props: PageProps<'/app/costs/regular/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <EditRegularBill {...props} />
    </Suspense>
  )
}
