import Link from 'next/link'
import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { LENGTH_STEP, MAX_LENGTH, MIN_LENGTH, QUICK_LENGTHS, lengthLabel } from '@/lib/schedule'

// "45 min", "1 h", "1 h 30"
const short = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60}`

// How long the appointment is: the quick picks in one row, and − / + for any length in 5-minute steps.
// As links (a page that reloads with ?len=) or as buttons.
export function LengthPicker({
  value,
  onChange,
  href,
}: {
  value: number
  onChange?: (minutes: number) => void
  href?: (minutes: number) => string
}) {
  const chip = (active: boolean) =>
    `flex min-h-12 items-center justify-center whitespace-nowrap rounded-full px-1 text-sm font-semibold ring-1 ring-inset ${
      active ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
    }`
  const step = (minutes: number, label: string, icon: ReactNode) => {
    const className = 'flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-900 ring-1 ring-inset ring-gray-300 aria-disabled:opacity-40'
    if (minutes < MIN_LENGTH || minutes > MAX_LENGTH) {
      return <span role="button" aria-label={label} aria-disabled="true" className={className}>{icon}</span>
    }
    return href ? (
      <Link href={href(minutes)} replace scroll={false} aria-label={label} className={className}>{icon}</Link>
    ) : (
      <button type="button" onClick={() => onChange?.(minutes)} aria-label={label} className={className}>{icon}</button>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">How long?</p>
        <div className="flex items-center gap-1.5">
          {step(value - LENGTH_STEP, '5 minutes shorter', <Minus className="h-5 w-5" aria-hidden="true" />)}
          <output aria-label="Length" className="hud-mono min-w-[4.75rem] text-center text-base font-bold text-gray-900">{short(value)}</output>
          {step(value + LENGTH_STEP, '5 minutes longer', <Plus className="h-5 w-5" aria-hidden="true" />)}
        </div>
      </div>
      {/* Equal columns, so the row never wraps, also inside a card on a narrow phone */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${QUICK_LENGTHS.length}, minmax(0, 1fr))` }} role="group" aria-label="Appointment length">
        {QUICK_LENGTHS.map((minutes) =>
          href ? (
            <Link key={minutes} href={href(minutes)} replace scroll={false} aria-label={lengthLabel(minutes)}
              aria-current={minutes === value ? 'true' : undefined} className={chip(minutes === value)}>
              {short(minutes)}
            </Link>
          ) : (
            <button key={minutes} type="button" onClick={() => onChange?.(minutes)} aria-label={lengthLabel(minutes)}
              aria-pressed={minutes === value} className={chip(minutes === value)}>
              {short(minutes)}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
