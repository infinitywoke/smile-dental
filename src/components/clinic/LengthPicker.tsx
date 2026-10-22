'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { LENGTH_STEP, MAX_LENGTH, MIN_LENGTH, QUICK_LENGTHS, lengthLabel } from '@/lib/schedule'

// "45 min", "1 h", "1 h 30"
const short = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60}`

// How long the appointment is: the quick picks in one row, and − / + for any length in 5-minute steps.
// On a page that reloads with ?len= (linkTo), or told to the screen it is on (onChange). Taps on − and +
// add up at once; such a page follows a moment after the last one. Give it a key per length, so it starts
// from the page's length again once the page has it.
export function LengthPicker({
  value,
  onChange,
  linkTo,
}: {
  value: number
  onChange?: (minutes: number) => void
  // The page's address without ?len=, and the length that needs none
  linkTo?: { path: string; defaultLength: number }
}) {
  const router = useRouter()
  const [shown, setShown] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  // The page's address as it is when the change goes (he may have moved to another day meanwhile)
  const latest = useRef(linkTo)
  useEffect(() => {
    latest.current = linkTo
  }, [linkTo])

  const hrefFor = (minutes: number, link = linkTo) =>
    !link || minutes === link.defaultLength ? (link?.path ?? '') : `${link.path}${link.path.includes('?') ? '&' : '?'}len=${minutes}`
  const stepTo = (minutes: number) => {
    setShown(minutes)
    if (!linkTo) {
      onChange?.(minutes)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => router.replace(hrefFor(minutes, latest.current), { scroll: false }), 400)
  }

  const chip = (active: boolean) =>
    `flex min-h-12 items-center justify-center whitespace-nowrap rounded-full px-1 text-sm font-semibold ring-1 ring-inset ${
      active ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
    }`
  const step = (minutes: number, label: string, icon: ReactNode) => (
    <button type="button" onClick={() => stepTo(minutes)} disabled={minutes < MIN_LENGTH || minutes > MAX_LENGTH} aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-900 ring-1 ring-inset ring-gray-300 disabled:opacity-40">
      {icon}
    </button>
  )
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">How long?</p>
        <div className="flex items-center gap-1.5">
          {step(shown - LENGTH_STEP, '5 minutes shorter', <Minus className="h-5 w-5" aria-hidden="true" />)}
          <output aria-label="Length" className="hud-mono min-w-[4.75rem] text-center text-base font-bold text-gray-900">{short(shown)}</output>
          {step(shown + LENGTH_STEP, '5 minutes longer', <Plus className="h-5 w-5" aria-hidden="true" />)}
        </div>
      </div>
      {/* Equal columns, so the row never wraps, also inside a card on a narrow phone */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${QUICK_LENGTHS.length}, minmax(0, 1fr))` }} role="group" aria-label="Appointment length">
        {QUICK_LENGTHS.map((minutes) =>
          linkTo ? (
            <Link key={minutes} href={hrefFor(minutes)} replace scroll={false} aria-label={lengthLabel(minutes)}
              aria-current={minutes === shown ? 'true' : undefined} className={chip(minutes === shown)}>
              {short(minutes)}
            </Link>
          ) : (
            <button key={minutes} type="button" onClick={() => stepTo(minutes)} aria-label={lengthLabel(minutes)}
              aria-pressed={minutes === shown} className={chip(minutes === shown)}>
              {short(minutes)}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
