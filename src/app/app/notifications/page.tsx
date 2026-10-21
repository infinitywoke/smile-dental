import { Suspense } from 'react'
import { getNotifications } from '@/lib/data/notifications'
import { pushKeysReady } from '@/lib/push'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { NotificationSettings } from '@/components/clinic/NotificationSettings'

async function NotificationsContent() {
  const { ready, settings, phones } = await getNotifications()
  return (
    <div className="space-y-4">
      <BackLink href="/app/patients" label="Patients" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notifications</h1>
      <NotificationSettings
        ready={ready && pushKeysReady()}
        vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
        initial={settings}
        phones={phones.map(({ endpoint, device }) => ({ endpoint, device }))}
      />
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function NotificationsPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <NotificationsContent />
    </Suspense>
  )
}
