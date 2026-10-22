'use client'

import { useState, useTransition } from 'react'
import { ChevronRight, Globe } from 'lucide-react'
import { setBookingPause } from '@/lib/actions/booking-pause'
import type { PauseMode } from '@/lib/booking-pause'
import { FullScreen, useBackToClose } from './FullScreen'

const label = 'hud-mono text-[10px] tracking-[0.14em] text-gray-500'
const option = 'min-h-14 w-full rounded-2xl px-4 text-left text-base font-semibold ring-1 disabled:opacity-60'

// The Cockpit's line for the website: whether it takes bookings, and a sheet to pause it (for the rest of
// today, or until he turns it back on) or open it again
export function BookingPause({ paused, text }: { paused: boolean; text: string }) {
  const { open, show, close } = useBackToClose()
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function choose(mode: PauseMode) {
    setError('')
    startTransition(async () => {
      const result = await setBookingPause(mode)
      if (!result.ok) return setError(result.error)
      navigator.vibrate?.(10)
      close()
    })
  }

  return (
    <>
      <button type="button" onClick={() => { setError(''); show() }}
        className={`flex min-h-12 w-full items-center gap-2.5 rounded-[14px] px-3 text-left ring-1 transition-transform active:scale-[0.98] ${paused ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-gray-200'}`}>
        <Globe className={`h-5 w-5 shrink-0 ${paused ? 'text-amber-700' : 'text-[var(--hud-amber-text)]'}`} aria-hidden="true" />
        <span className={label}>WEBSITE</span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{text}</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
      </button>

      {open && (
        <FullScreen title="Online booking" onClose={close}>
          <div className="space-y-4 p-4">
            <p className="text-lg font-bold text-gray-900">{text}</p>
            <p className="text-base text-gray-600">
              While paused, the website shows no free times and takes no requests; patients are asked to call or WhatsApp.
              Booking here in Clinic OS works as usual.
            </p>
            {paused ? (
              <button type="button" disabled={pending} onClick={() => choose('open')} className={`${option} bg-blue-600 text-white ring-blue-600`}>
                {pending ? 'Turning it on…' : 'Turn online booking back on'}
              </button>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={() => choose('today')} className={`${option} bg-white text-gray-900 ring-gray-300`}>
                  Pause for the rest of today
                  <span className="block text-sm font-normal text-gray-500">Comes back on by itself at midnight</span>
                </button>
                <button type="button" disabled={pending} onClick={() => choose('indefinite')} className={`${option} bg-white text-gray-900 ring-gray-300`}>
                  Pause until I turn it back on
                </button>
              </>
            )}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}
          </div>
        </FullScreen>
      )}
    </>
  )
}
