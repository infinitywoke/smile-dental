import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LengthPicker } from './LengthPicker'

// A way to the day before or after: a link (pages that reload with ?d=) or a tap; null when there is none
export type DayStep = { href: string } | { onClick: () => void } | null

// Choosing when, the same on every booking screen (phone booking, a website request, moving an
// appointment, the next visit): how long, which day, then that day's times
export function WhenPicker({
  length,
  onLength,
  lengthLink,
  day = '',
  note,
  prev = null,
  next = null,
  dayPicker,
  children,
}: {
  length: number
  onLength?: (minutes: number) => void
  // On a page that reloads with ?len=: its address without it, and the length that needs none
  lengthLink?: { path: string; defaultLength: number }
  // The day as shown ("Today, Thu, 22 Oct")
  day?: string
  // A word under it ("Day requested")
  note?: string | null
  prev?: DayStep
  next?: DayStep
  // A month calendar instead of the day arrows (the next visit, which may be months away)
  dayPicker?: ReactNode
  // The day's times, or why there are none
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <LengthPicker key={length} value={length} onChange={onLength} linkTo={lengthLink} />
      {dayPicker ?? (
        <div className="flex items-center justify-between">
          <DayButton step={prev} label="Previous day" icon={<ChevronLeft className="h-6 w-6" />} />
          <div className="text-center">
            <p className="text-base font-bold text-gray-900">{day}</p>
            {note && <p className="text-xs font-semibold text-amber-700">{note}</p>}
          </div>
          <DayButton step={next} label="Next day" icon={<ChevronRight className="h-6 w-6" />} />
        </div>
      )}
      {children}
    </div>
  )
}

function DayButton({ step, label, icon }: { step: DayStep; label: string; icon: ReactNode }) {
  const className = 'flex h-12 w-12 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50'
  if (!step) return <span className="w-12" />
  return 'href' in step ? (
    <Link href={step.href} className={className} aria-label={label}>{icon}</Link>
  ) : (
    <button type="button" onClick={step.onClick} className={className} aria-label={label}>{icon}</button>
  )
}
