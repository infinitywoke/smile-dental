import { getDoctor } from '@/lib/auth'
import { getVisit } from '@/lib/data/visits'
import { formatDate } from '@/lib/dates'
import { VisitEditor } from '@/components/clinic/VisitEditor'
import { PhotoGallery } from '@/components/clinic/PhotoGallery'
import { DeleteVisitButton } from '@/components/clinic/DeleteVisitButton'
import { BackLink, MedicalAlert } from '@/components/clinic/ui'

export default async function VisitPage({ params }: PageProps<'/app/visits/[id]'>) {
  const { id } = await params
  const [doctor, visit] = await Promise.all([getDoctor(), getVisit(id)])

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

      <PhotoGallery photos={visit.photos} />

      <VisitEditor key={visit.updated_at} mode="edit" doctorId={doctor.id} visitId={visit.id} notes={visit.notes} />

      <DeleteVisitButton visitId={visit.id} />
    </div>
  )
}
