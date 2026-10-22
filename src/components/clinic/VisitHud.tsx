'use client'

import { inIndia, formatBlock } from '@/lib/schedule'
import { chairTime, type VisitStep, type VisitStepKey } from '@/lib/visit-progress'
import { useNow } from './useNow'

const label = 'text-xs font-bold'

// Beside the patient's name: how long they have been in the chair (today, until sent), or when it was sent
export function ChairReadout({ startedAt, visitDate, sentAt, resend }: { startedAt: string; visitDate: string; sentAt: string | null; resend: boolean }) {
  const now = useNow(1000)
  if (sentAt) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`${label} ${resend ? 'text-[var(--hud-amber-text)]' : 'text-gray-500'}`}>{resend ? 'Send again' : 'Sent'}</span>
        <span className={`hud-mono text-2xl leading-none font-bold ${resend ? 'text-[var(--hud-amber-text)]' : 'text-[var(--hud-green-text)]'}`}>
          {formatBlock(inIndia(sentAt).time)}
        </span>
      </div>
    )
  }
  if (!now || inIndia(now).date !== visitDate) return null
  const time = chairTime(startedAt, now)
  if (!time) return null
  return (
    <div className="flex shrink-0 flex-col items-end gap-1" role="timer" aria-label={`In the chair for ${time}`}>
      <span className={`${label} text-gray-500`}>In chair</span>
      <span className="hud-mono text-2xl leading-none font-bold text-[var(--hud-green-text)]" aria-hidden="true">{time}</span>
    </div>
  )
}

// Notes · Bill · Paid · Next · Sent: each fills as the visit goes; a tap scrolls to that part
export function VisitProgress({ steps, onJump }: { steps: VisitStep[]; onJump: (key: VisitStepKey) => void }) {
  return (
    <nav aria-label="Visit progress">
      <ol className="grid grid-cols-5 gap-1.5">
        {steps.map((s) => (
          <li key={s.key}>
            <button type="button" onClick={() => onJump(s.key)} aria-label={`${s.label}: ${s.state}`}
              className="flex min-h-11 w-full flex-col justify-center gap-1.5 rounded-lg text-left">
              <span className="block h-[5px] w-full overflow-hidden rounded-full bg-gray-200">
                <span className="block h-full rounded-full bg-gray-900 transition-[width] duration-500" style={{ width: `${s.filled * 100}%` }} />
              </span>
              <span className={`${label} ${s.filled > 0 ? 'text-gray-900' : 'text-gray-500'}`}>{s.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
