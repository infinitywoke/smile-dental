'use client'

import { useState } from 'react'
import { MessageCircle, Timer } from 'lucide-react'
import { formatTimeOf } from '@/lib/schedule'
import { runningLateMessage, whatsappLink } from '@/lib/whatsapp'
import { FullScreen, useBackToClose } from './FullScreen'

const LATE_BY = [10, 15, 20, 30]

// Running late: a WhatsApp message to each patient still to come today, written for them; he taps Send.
// The button turns amber once the next patient's time has passed (he is running behind).
export function RunningLate({ patients, behind }: { patients: { id: string; name: string; startsAt: string; phone: string }[]; behind: boolean }) {
  const sheet = useBackToClose()
  const [minutes, setMinutes] = useState(15)
  const [sent, setSent] = useState<string[]>([])

  return (
    <>
      <button type="button" onClick={() => { navigator.vibrate?.(8); sheet.show() }}
        className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-transform active:scale-[0.97] ${
          behind ? 'bg-amber-100 text-amber-900' : 'bg-white text-gray-900 ring-1 ring-gray-300'
        }`}>
        <Timer className="h-4 w-4" aria-hidden="true" />Running late
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
                      <span className="hud-mono block text-sm text-gray-500">{formatTimeOf(p.startsAt)}</span>
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
