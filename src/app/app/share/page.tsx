import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { todayInIndia } from '@/lib/dates'
import { getVisitsOn } from '@/lib/data/visits'
import { formatTimeOf } from '@/lib/schedule'
import { SharedPhotos } from '@/components/clinic/SharedPhotos'
import { ScreenLoading } from '@/components/clinic/ui'

// Photos shared to Clinic OS from the gallery or WhatsApp (public/sw.js keeps them on the phone): which
// of today's visits are they for?
async function ShareContent() {
  await getDoctor()
  const visits = await getVisitsOn(todayInIndia())
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Add photos to a visit</h1>
      <SharedPhotos visits={visits.map((v) => ({ id: v.id, name: v.patient.name, at: formatTimeOf(v.created_at) }))} />
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <ShareContent />
    </Suspense>
  )
}
