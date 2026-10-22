import { Suspense } from 'react'
import { getPatient, getPatientFootprint } from '@/lib/data/patients'
import { formatRupees } from '@/lib/pricing'
import { formatWhen } from '@/lib/schedule'
import { cancelledMessage, firstName, whatsappLink } from '@/lib/whatsapp'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { DeletePatientForm } from '@/components/clinic/DeletePatientForm'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Deleting a patient: everything that goes is listed, and the doctor's password confirms it
async function DeletePatientContent({ params }: PageProps<'/app/patients/[id]/delete'>) {
  const { id } = await params
  const [patient, footprint] = await Promise.all([getPatient(id), getPatientFootprint(id)])
  const next = footprint.coming[0]
  const tellUrl = next && patient.phone ? whatsappLink(patient.phone, cancelledMessage({ name: patient.name, startsAt: next.starts_at })) : null

  return (
    <div className="space-y-5">
      <BackLink href={`/app/patients/${id}`} label={patient.name} />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Delete {patient.name}?</h1>

      <div className="space-y-2 rounded-2xl bg-red-50 p-4 text-base text-red-900 ring-1 ring-red-200">
        <p className="font-semibold">This can&apos;t be undone. It removes:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>their details (phone, address, medical alerts)</li>
          <li>{plural(footprint.visits, 'visit')} with their notes</li>
          <li>{plural(footprint.photos, 'photo')}</li>
          {footprint.coming.length > 0 && (
            <li>
              {plural(footprint.coming.length, 'coming appointment')}: {footprint.coming.map((a) => formatWhen(a.starts_at)).join('; ')}
            </li>
          )}
          {footprint.payments.count > 0 && <li>{formatRupees(footprint.payments.total)} of payments, unless you keep them below</li>}
        </ul>
      </div>

      {tellUrl && (
        <a href={tellUrl}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-white px-4 text-center text-base font-semibold text-gray-900 ring-1 ring-gray-300">
          First, tell {firstName(patient.name)} the appointment is cancelled
        </a>
      )}

      <DeletePatientForm patientId={id} paymentsTotal={footprint.payments.count > 0 ? footprint.payments.total : 0} />
    </div>
  )
}

export default function DeletePatientPage(props: PageProps<'/app/patients/[id]/delete'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <DeletePatientContent {...props} />
    </Suspense>
  )
}
