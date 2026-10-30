import { Suspense } from 'react'
import Link from 'next/link'
import { BellRing, CalendarClock, ChevronRight, HandCoins, PackageOpen, PauseCircle, ReceiptText, Settings, Stethoscope, UserX } from 'lucide-react'
import { getAlerts } from '@/lib/data/alerts'
import type { Alert, AlertKind } from '@/lib/alerts'
import { ScreenLoading } from '@/components/clinic/ui'

const ICONS: Record<AlertKind, typeof BellRing> = {
  request: CalendarClock,
  resend: ReceiptText,
  missed: UserX,
  reminders: BellRing,
  stock: PackageOpen,
  due: HandCoins,
  recalls: Stethoscope,
  paused: PauseCircle,
}

// One alert: what happened in a line, and a tap goes where it is done (its button names what to do)
function AlertRow({ alert }: { alert: Alert }) {
  const Icon = ICONS[alert.kind]
  return (
    <li>
      <Link href={alert.href} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200 hover:ring-gray-300">
        <Icon className={`h-6 w-6 shrink-0 ${alert.now ? 'text-amber-600' : 'text-gray-400'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold break-words text-gray-900">{alert.title}</span>
          <span className="block text-sm break-words text-gray-600">{alert.detail}</span>
        </span>
        <span className={`flex min-h-10 shrink-0 items-center gap-0.5 rounded-xl pr-2 pl-3 text-sm font-bold ${alert.now ? 'bg-blue-600 text-white' : 'text-gray-900 ring-1 ring-gray-300'}`}>
          {alert.action}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
    </li>
  )
}

function AlertList({ label, alerts }: { label: string; alerts: Alert[] }) {
  if (alerts.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="hud-heading">{label}</h2>
      <ul aria-label={label} className="space-y-2">
        {alerts.map((alert) => <AlertRow key={alert.key} alert={alert} />)}
      </ul>
    </section>
  )
}

// Everything that needs him in one place: what needs a decision now, then what can wait a little
async function AlertsContent() {
  const alerts = await getAlerts()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Alerts</h1>
        <p className="text-sm text-gray-500">What needs you. Tap one to deal with it.</p>
      </div>
      {alerts.length === 0 && (
        <p className="rounded-2xl bg-white p-6 text-center text-base font-semibold text-gray-600 ring-1 ring-gray-200">Nothing needs you right now.</p>
      )}
      <AlertList label="Needs you now" alerts={alerts.filter((a) => a.now)} />
      <AlertList label="When you have a moment" alerts={alerts.filter((a) => !a.now)} />
      <Link href="/app/notifications" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 font-semibold text-gray-900 ring-1 ring-gray-200">
        <Settings className="h-5 w-5 text-gray-500" aria-hidden="true" />
        <span className="flex-1">Notifications on this phone</span>
        <ChevronRight className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </Link>
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function AlertsPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <AlertsContent />
    </Suspense>
  )
}
