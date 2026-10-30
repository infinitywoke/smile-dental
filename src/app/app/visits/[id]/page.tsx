import { Suspense } from 'react'
import { getClinicId } from '@/lib/auth'
import { getQuickMedicines, getVisit } from '@/lib/data/visits'
import { getUsualCharges, getVisitBill } from '@/lib/data/billing'
import { getTreatments } from '@/lib/data/price-list'
import { priceListOptions } from '@/lib/pricing'
import { logAccess } from '@/lib/data/access-log'
import { VisitFlow } from '@/components/clinic/VisitFlow'
import { ScreenLoading } from '@/components/clinic/ui'

async function VisitPageContent({ params, searchParams }: PageProps<'/app/visits/[id]'>) {
  const { id } = await params
  const { step } = await searchParams
  const [clinicId, visit, bill, medicines, usual, priceList] = await Promise.all([getClinicId(), getVisit(id), getVisitBill(id), getQuickMedicines(), getUsualCharges(), getTreatments()])

  await logAccess({ action: 'opened visit', patientId: visit.patient.id, visitId: visit.id })

  // "Collect" links end in ?step=bill: they land on the payment card
  return <VisitFlow key={visit.id} folder={clinicId} visit={visit} bill={bill} medicines={medicines} usual={usual} priceList={priceListOptions(priceList)} focus={step === 'bill' ? 'payment' : null} />
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function VisitPage(props: PageProps<'/app/visits/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <VisitPageContent {...props} />
    </Suspense>
  )
}
