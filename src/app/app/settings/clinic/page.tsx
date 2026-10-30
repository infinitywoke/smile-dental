import { Suspense } from 'react'
import { getClinic } from '@/lib/data/clinic'
import { getTeam } from '@/lib/data/team'
import { TeamSettings } from '@/components/clinic/TeamSettings'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'

async function ClinicContent() {
  const [{ clinic }, team] = await Promise.all([getClinic(), getTeam()])
  return (
    <div className="space-y-5">
      <BackLink href="/app/settings" label="Settings" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{clinic.name}</h1>
        <p className="mt-1 text-sm text-gray-600">{clinic.address}</p>
        <p className="text-sm text-gray-600">{clinic.phone}</p>
      </div>
      <TeamSettings team={team} />
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function ClinicSettingsPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <ClinicContent />
    </Suspense>
  )
}
