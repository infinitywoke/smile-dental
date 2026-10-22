'use client'

import { formatTimeOf, inIndia } from '@/lib/schedule'
import { chairTime } from '@/lib/chair-time'
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
          {formatTimeOf(sentAt)}
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
