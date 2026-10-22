'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Timer } from 'lucide-react'
import { dayPosition } from '@/lib/cockpit'
import { inIndia, formatBlock } from '@/lib/schedule'
import { runningLateMessage, whatsappLink } from '@/lib/whatsapp'
import { FullScreen, useBackToClose } from './FullScreen'

// The Cockpit's live parts: worked out on the phone, again and again, and blank until then, so the page
// as sent and the page in the browser agree

export function useNow(everyMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = setInterval(tick, everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

// "10:42" with a small "AM"
export function LiveClock() {
  const now = useNow(15_000)
  const [h, m] = now ? inIndia(now).time.split(':').map(Number) : [0, 0]
  return (
    <span className="hud-mono inline-flex min-w-[6.5rem] items-baseline justify-end gap-1 text-4xl leading-none font-bold" aria-label="Time now">
      {now && <>{h % 12 || 12}:{String(m).padStart(2, '0')}<span className="text-sm font-bold text-gray-500">{h < 12 ? 'AM' : 'PM'}</span></>}
    </span>
  )
}

// "in 28 min", "now", "12 min late"
export function Countdown({ startsAt }: { startsAt: string }) {
  const now = useNow(30_000)
  if (!now) return null
  const minutes = Math.round((new Date(startsAt).getTime() - now.getTime()) / 60_000)
  const text = minutes > 59 ? `in ${Math.floor(minutes / 60)} h ${minutes % 60} min` : minutes > 0 ? `in ${minutes} min` : minutes === 0 ? 'now' : `${-minutes} min late`
  return <> · {text.toUpperCase()}</>
}

// The green line on the day strip where the time is now
export function NowMarker() {
  const now = useNow(60_000)
  if (!now) return null
  const left = dayPosition(now)
  if (left <= 0 || left >= 100) return null
  return <span className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-[var(--hud-green)]" style={{ left: `${left}%` }} aria-hidden="true" />
}

const LATE_BY = [10, 15, 20, 30]

// Running late: a WhatsApp message to each patient still to come today, written for them; he taps Send
export function RunningLate({ patients }: { patients: { id: string; name: string; startsAt: string; phone: string }[] }) {
  const sheet = useBackToClose()
  const [minutes, setMinutes] = useState(15)
  const [sent, setSent] = useState<string[]>([])

  return (
    <>
      <button type="button" onClick={() => { navigator.vibrate?.(8); sheet.show() }}
        className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-[11px] font-bold text-gray-900 ring-1 ring-gray-200 transition-transform active:scale-[0.97]">
        <Timer className="h-5 w-5 text-[var(--hud-amber-text)]" aria-hidden="true" />Running late
      </button>
      {sheet.open && (
        <FullScreen title="Running late" onClose={sheet.close}>
          <div className="space-y-4 px-4 py-4">
            <div>
              <p className="pb-2 text-sm font-semibold text-gray-700">About how late?</p>
              <div role="group" aria-label="About how late?" className="grid grid-cols-4 gap-2">
                {LATE_BY.map((m) => (
                  <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)}
                    className={`min-h-12 rounded-xl text-base font-bold ring-1 ${minutes === m ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-800 ring-gray-300'}`}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            {patients.length === 0 ? (
              <p className="rounded-xl bg-gray-100 p-4 text-center text-sm font-medium text-gray-600">No one else is booked today.</p>
            ) : (
              <ul className="space-y-2">
                {patients.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white py-2 pr-2 pl-4 ring-1 ring-gray-200">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-gray-900">{p.name}</span>
                      <span className="hud-mono block text-sm text-gray-500">{formatBlock(inIndia(p.startsAt).time)}</span>
                    </span>
                    <a href={whatsappLink(p.phone, runningLateMessage({ name: p.name, startsAt: p.startsAt, minutes }))}
                      target="_blank" rel="noopener noreferrer" onClick={() => setSent((s) => [...s, p.id])}
                      className={`flex min-h-12 items-center gap-2 rounded-xl px-4 font-semibold ${sent.includes(p.id) ? 'bg-gray-100 text-gray-600' : 'bg-blue-600 text-white'}`}>
                      <MessageCircle className="h-5 w-5" aria-hidden="true" />{sent.includes(p.id) ? 'Sent' : 'Send'}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FullScreen>
      )}
    </>
  )
}
