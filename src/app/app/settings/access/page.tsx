import { Suspense } from 'react'
import Link from 'next/link'
import { getAccessLog, type AccessEntry } from '@/lib/data/access-log'
import { todayInIndia } from '@/lib/dates'
import { formatDay, formatTimeOf, formatWhen, inIndia } from '@/lib/schedule'
import { BackLink, Card, ScreenLoading } from '@/components/clinic/ui'

function Opened({ entry }: { entry: AccessEntry }) {
  const what = entry.action === 'opened visit' ? 'Visit' : 'Patient'
  const href = entry.action === 'opened visit' && entry.visit_id ? `/app/visits/${entry.visit_id}` : entry.patient ? `/app/patients/${entry.patient.id}` : null
  const name = entry.patient?.name ?? 'A patient no longer here'
  return (
    <li className="flex items-baseline gap-3 px-4 py-3">
      <span className="w-16 shrink-0 text-sm text-gray-500 tabular-nums">{formatTimeOf(entry.at)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-gray-900">
          {what}: {href ? <Link href={href} className="text-blue-600">{name}</Link> : name}
        </span>
        <span className="block text-sm text-gray-500">{entry.device ?? 'Unknown device'}</span>
      </span>
    </li>
  )
}

async function AccessContent() {
  const { signIns, opened } = await getAccessLog()
  const today = todayInIndia()
  // The records opened, a list per day, newest first
  const days = new Map<string, AccessEntry[]>()
  for (const entry of opened) {
    const day = inIndia(entry.at).date
    days.set(day, [...(days.get(day) ?? []), entry])
  }
  return (
    <div className="space-y-5">
      <BackLink href="/app/settings" label="Settings" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Access log</h1>
        <p className="mt-1 text-sm text-gray-600">
          Each sign-in and each patient record opened, with the phone or computer, kept for a year. A phone or computer
          that isn&apos;t yours? Sign out in Settings: that signs out every phone and computer at once.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Sign-ins</h2>
        {signIns.length === 0 ? (
          <Card><p className="text-sm text-gray-600">None yet.</p></Card>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            {signIns.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <span className="block font-medium text-gray-900">{entry.device ?? 'Unknown device'}</span>
                <span className="block text-sm text-gray-500">{formatWhen(entry.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">Records opened</h2>
        {days.size === 0 ? (
          <Card><p className="text-sm text-gray-600">None yet.</p></Card>
        ) : (
          [...days].map(([day, entries]) => (
            <div key={day} className="space-y-1">
              <p className="px-1 text-sm font-medium text-gray-700">{day === today ? 'Today' : formatDay(day)}</p>
              <ul className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                {entries.map((entry) => <Opened key={entry.id} entry={entry} />)}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function AccessLogPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <AccessContent />
    </Suspense>
  )
}
