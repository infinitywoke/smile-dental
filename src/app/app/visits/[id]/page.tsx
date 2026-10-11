import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { getVisit } from '@/lib/data/visits'
import { getVisitBill } from '@/lib/data/billing'
import { getNextVisitSuggestion } from '@/lib/data/next-visit'
import { VisitFlow } from '@/components/clinic/VisitFlow'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'

// Tidying a note calls the AI from this page's server action, which can take longer than the default
export const maxDuration = 60

async function VisitPageContent({ params, searchParams }: PageProps<'/app/visits/[id]'>) {
  const { id } = await params
  const { step } = await searchParams
  const [doctor, visit, bill] = await Promise.all([getDoctor(), getVisit(id), getVisitBill(id)])

  const initialStep = step === 'bill' || step === 'send' ? step : 'notes'
  const suggestion = await getNextVisitSuggestion(visit)

  return (
    <div className="space-y-4">
      <BackLink href={`/app/patients/${visit.patient.id}`} label={visit.patient.name} />
      <VisitFlow doctor={doctor} visit={visit} bill={bill} suggestion={suggestion} initialStep={initialStep} />
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function VisitPage(props: PageProps<'/app/visits/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <VisitPageContent {...props} />
    </Suspense>
  )
}
