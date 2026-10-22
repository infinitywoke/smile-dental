'use client'

import { AlertTriangle } from 'lucide-react'
import { LATE_MINUTES, NO_SHOW_MINUTES, nextTiming } from '@/lib/next-patient'
import { formatTimeOf } from '@/lib/schedule'
import { DidntComeButton } from './FollowUps'
import { RunningLate } from './RunningLate'
import { StartVisitButton } from './StartVisitButton'
import { useNow } from './useNow'

type Next = { appointmentId: string; patientId: string; name: string; startsAt: string; detail: string; alert: boolean }
type Later = { id: string; name: string; startsAt: string; phone: string }

// Today's next patient, docked low where the thumb is: Start visit, and Running late. Once they are a few
// minutes late, the time and Running late turn amber; ten minutes late, Didn't come is offered too.
export function NextPatient({ next, later }: { next: Next; later: Later[] }) {
  const now = useNow(30_000)
  const timing = now ? nextTiming(next.startsAt, now) : null
  const behind = (timing?.lateBy ?? 0) >= LATE_MINUTES
  return (
    <section aria-label="Next patient" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-lg px-3 pb-2">
        <div className="space-y-2.5 rounded-[20px] bg-white p-3.5 shadow-[0_8px_24px_rgba(11,35,87,0.14)] ring-1 ring-gray-200">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-gray-500">
              Next · <span className="hud-mono">{formatTimeOf(next.startsAt)}</span>
              {timing && <> · <span className={behind ? 'text-amber-800' : undefined}>{timing.text}</span></>}
            </p>
            <p className="flex items-center gap-1.5 text-xl font-extrabold text-gray-900">
              <span className="truncate">{next.name}</span>
              {next.alert && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
            </p>
            {next.detail && <p className="truncate text-sm text-gray-500">{next.detail}</p>}
          </div>
          <StartVisitButton patientId={next.patientId} appointmentId={next.appointmentId} label="Start visit"
            className="flex min-h-14 w-full items-center justify-center rounded-[14px] bg-blue-600 px-5 text-[17px] font-extrabold text-white transition-transform active:scale-[0.98] disabled:opacity-70" />
          <div className="flex items-center justify-end gap-2">
            {(timing?.lateBy ?? 0) >= NO_SHOW_MINUTES && <DidntComeButton appointmentId={next.appointmentId} name={next.name} />}
            <RunningLate patients={later} behind={behind} />
          </div>
        </div>
      </div>
    </section>
  )
}
