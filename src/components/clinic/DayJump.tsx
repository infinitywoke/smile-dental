'use client'

import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { isClosedDay } from '@/lib/schedule'
import { Calendar } from './Calendar'
import { FullScreen, useBackToClose } from './FullScreen'

// A booking screen's day, between its arrows: a tap opens the calendar to go to any day. `href` is the
// day's address with {date} in place of the date.
export function DayJump({ label, date, today, href, minDate }: { label: string; date: string; today: string; href: string; minDate?: string }) {
  const router = useRouter()
  const { open, show, close } = useBackToClose()

  // The sheet has its own history entry: take it off first, then go, so Back from the new day isn't the sheet
  function go(day: string) {
    const to = href.replace('{date}', day)
    window.addEventListener('popstate', () => router.push(to), { once: true })
    close()
  }

  return (
    <>
      <button type="button" onClick={show} aria-label={`${label}: pick another day`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-base font-bold text-gray-900 hover:bg-gray-100">
        <CalendarDays className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />{label}
      </button>
      {open && (
        <FullScreen title="Pick a day" onClose={close}>
          <div className="p-4">
            <Calendar selected={date} today={today} minDate={minDate} isClosed={isClosedDay} onSelect={go} />
          </div>
        </FullScreen>
      )}
    </>
  )
}
