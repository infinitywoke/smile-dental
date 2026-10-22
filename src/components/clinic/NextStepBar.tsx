'use client'

import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { formatRupees } from '@/lib/pricing'

export type NextStep = { kind: 'collect'; due: number } | { kind: 'send' }

// The visit's next step, in reach just above the bottom bar wherever he is on the page: collect what is
// due, then send (VisitFlow decides which). It steps aside while that step's own buttons are on screen,
// so they never show twice.
// Give it a key per step, so each step starts hidden until it knows where those buttons are.
export function NextStepBar({ step, watch, onCash, onUpi, onSend }: {
  step: NextStep
  // Changes when the step's buttons may have been redrawn (a new payment, a send), to look for them again
  watch: string
  onCash: () => void
  onUpi: () => void
  onSend: () => void
}) {
  const targetId = step.kind === 'collect' ? 'payment-actions' : 'send-action'
  // Hidden until the buttons it stands in for are known to be off screen
  const [targetShown, setTargetShown] = useState(true)
  useEffect(() => {
    const target = document.getElementById(targetId)
    // Nothing to stand in for on the page: show the bar (after this render)
    if (!target) {
      const timer = setTimeout(() => setTargetShown(false), 0)
      return () => clearTimeout(timer)
    }
    // The bottom bar covers the lowest 4rem of the screen
    const observer = new IntersectionObserver(([entry]) => setTargetShown(entry.isIntersecting), { rootMargin: '0px 0px -64px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [targetId, watch])

  if (targetShown) return null
  return (
    // The Undo bar lifts above it (UndoBar.tsx looks for #next-step)
    <section id="next-step" aria-label="Next step" className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-gray-200 bg-white px-4 py-2.5">
      {step.kind === 'collect' ? (
        <div className="flex items-center gap-2">
          <div className="min-w-[5.5rem]">
            <p className="text-xs font-bold text-gray-500">Still due</p>
            <p className="hud-mono text-xl font-bold text-[var(--hud-amber-text)]">{formatRupees(step.due)}</p>
          </div>
          <button type="button" onClick={onCash}
            className="min-h-12 flex-1 rounded-xl bg-blue-600 px-3 text-[15px] font-bold text-white transition-transform active:scale-[0.98]">
            Cash received
          </button>
          <button type="button" onClick={onUpi}
            className="min-h-12 rounded-xl bg-white px-4 text-[15px] font-bold text-gray-900 ring-1 ring-gray-300">
            UPI QR
          </button>
        </div>
      ) : (
        <button type="button" onClick={onSend}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-extrabold text-white transition-transform active:scale-[0.98]">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />Send on WhatsApp
        </button>
      )}
    </section>
  )
}
