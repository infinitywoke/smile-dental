import Link from 'next/link'
import { LENGTHS, lengthLabel } from '@/lib/schedule'

// How long the appointment is: one row of chips. As links (a page that reloads with ?len=) or as buttons.
export function LengthChips({
  value,
  onChange,
  href,
}: {
  value: number
  onChange?: (minutes: number) => void
  href?: (minutes: number) => string
}) {
  const chip = (active: boolean) =>
    `flex min-h-12 items-center justify-center rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset ${
      active ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
    }`
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-gray-700">How long?</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Appointment length">
        {LENGTHS.map((minutes) => {
          const label = minutes === 120 ? '2 h' : minutes === 60 ? '1 h' : `${minutes} min`
          return href ? (
            <Link key={minutes} href={href(minutes)} replace scroll={false} aria-label={lengthLabel(minutes)}
              aria-current={minutes === value ? 'true' : undefined} className={chip(minutes === value)}>
              {label}
            </Link>
          ) : (
            <button key={minutes} type="button" onClick={() => onChange?.(minutes)} aria-label={lengthLabel(minutes)}
              aria-pressed={minutes === value} className={chip(minutes === value)}>
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
