'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { setBookingPause } from '@/lib/actions/booking-pause'
import type { PauseMode } from '@/lib/booking-pause'
import { formatRupees } from '@/lib/pricing'
import { FullScreen, useBackToClose } from './FullScreen'

const pill = 'flex min-h-10 items-center gap-2 rounded-full bg-white px-3 text-[13px] font-bold text-gray-900 ring-1 ring-gray-200'
const option = 'min-h-14 w-full rounded-2xl px-4 text-left text-base font-semibold ring-1 disabled:opacity-60'

// Whether the clinic is open, at the top of Today. A tap opens the day's two switches: online booking
// (pause it for the rest of today, or until turned back on) and time off (Block time).
export function ClinicStatus({ status, website }: { status: { open: boolean; text: string }; website: { paused: boolean; text: string } | null }) {
  const { open, show, close } = useBackToClose()
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const paused = website?.paused ?? false

  function choose(mode: PauseMode) {
    setError('')
    startTransition(async () => {
      const result = await setBookingPause(mode)
      if (!result.ok) return setError(result.error)
      navigator.vibrate?.(10)
      close()
    })
  }

  // The free times (with Close this day and blocking) are folded on Today: open them and go there
  function blockTime() {
    close()
    setTimeout(() => {
      const free = document.getElementById('free-times') as HTMLDetailsElement | null
      if (!free) return
      free.open = true
      free.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }

  return (
    <>
      <button type="button" onClick={() => { setError(''); show() }} className={pill}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${status.open ? 'bg-[var(--hud-green)]' : 'bg-gray-400'}`} aria-hidden="true" />
        <span>{status.text}</span>
        {paused && <span className="text-amber-800">· online booking paused</span>}
      </button>
      {open && (
        <FullScreen title="Today at the clinic" onClose={close}>
          <div className="space-y-6 p-4">
            <p className="text-lg font-bold text-gray-900">{status.text}</p>
            {website && (
              <section aria-label="Online booking" className="space-y-3">
                <h2 className="hud-heading">Online booking</h2>
                <p className="text-base font-semibold text-gray-900">{website.text}</p>
                <p className="text-sm text-gray-600">
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
              </section>
            )}
            <section aria-label="Time off" className="space-y-3">
              <h2 className="hud-heading">Time off</h2>
              <button type="button" onClick={blockTime} className={`${option} bg-white text-gray-900 ring-gray-300`}>
                Block time or close this day
                <span className="block text-sm font-normal text-gray-500">From today&apos;s free times</span>
              </button>
            </section>
          </div>
        </FullScreen>
      )}
    </>
  )
}

// Today's money, hidden until tapped: patients can see his screen
export function MoneyPill({ collected, owed }: { collected: number; owed: number }) {
  const [shown, setShown] = useState(false)
  return (
    <button type="button" aria-pressed={shown} aria-label={shown ? undefined : "Show today's money"} onClick={() => setShown((s) => !s)}
      className={`${pill} ml-auto`}>
      {shown ? (
        <span className="hud-mono">
          {formatRupees(collected)}
          {owed > 0 && <span className="text-amber-800"> · {formatRupees(owed)} owed</span>}
        </span>
      ) : (
        <span className="hud-mono">₹ ••••</span>
      )}
      {shown ? <EyeOff className="h-4 w-4 text-gray-500" aria-hidden="true" /> : <Eye className="h-4 w-4 text-gray-500" aria-hidden="true" />}
    </button>
  )
}
