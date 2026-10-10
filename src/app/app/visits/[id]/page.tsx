import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronRight, Receipt } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getVisit } from '@/lib/data/visits'
import { getVisitBill } from '@/lib/data/billing'
import { formatRupees } from '@/lib/pricing'
import { formatDate } from '@/lib/dates'
import { VisitEditor } from '@/components/clinic/VisitEditor'
import { PhotoGallery } from '@/components/clinic/PhotoGallery'
import { DeleteVisitButton } from '@/components/clinic/DeleteVisitButton'
import { BackLink, MedicalAlert, ScreenLoading } from '@/components/clinic/ui'

async function VisitPageContent({ params }: PageProps<'/app/visits/[id]'>) {
  const { id } = await params
  const [doctor, visit, bill] = await Promise.all([getDoctor(), getVisit(id), getVisitBill(id)])
  const { summary } = bill

  return (
    <div className="space-y-5">
      <BackLink href={`/app/patients/${visit.patient.id}`} label={visit.patient.name} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{visit.patient.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visit on {formatDate(visit.visit_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <MedicalAlert alerts={visit.patient.medical_alerts} />

      <Link href={`/app/visits/${visit.id}/bill`}
        className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
        <Receipt className="h-6 w-6 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">Bill and payment</p>
          <p className="text-sm text-gray-500">
            {bill.charges.length === 0
              ? 'Nothing billed yet'
              : `${formatRupees(summary.total)} billed · ${formatRupees(summary.paid)} paid${summary.balance > 0 ? ` · ${formatRupees(summary.balance)} due` : ''}`}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </Link>

      <PhotoGallery photos={visit.photos} />

      <VisitEditor key={visit.updated_at} mode="edit" doctorId={doctor.id} visitId={visit.id} notes={visit.notes} />

      <DeleteVisitButton visitId={visit.id} />
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
