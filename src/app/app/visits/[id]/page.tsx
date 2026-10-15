import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { getQuickMedicines, getVisit } from '@/lib/data/visits'
import { getVisitBill } from '@/lib/data/billing'
import { VisitFlow } from '@/components/clinic/VisitFlow'
import { ScreenLoading } from '@/components/clinic/ui'

async function VisitPageContent({ params, searchParams }: PageProps<'/app/visits/[id]'>) {
  const { id } = await params
  const { step } = await searchParams
  const [doctor, visit, bill, medicines] = await Promise.all([getDoctor(), getVisit(id), getVisitBill(id), getQuickMedicines()])

  // "Collect" links end in ?step=bill: they land on the payment card
  return <VisitFlow key={visit.id} doctorId={doctor.id} visit={visit} bill={bill} medicines={medicines} focus={step === 'bill' ? 'payment' : null} />
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function VisitPage(props: PageProps<'/app/visits/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <VisitPageContent {...props} />
    </Suspense>
  )
}
