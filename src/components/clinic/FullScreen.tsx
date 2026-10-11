'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'

// Anything that covers the visit (price list, UPI QR, time picker, photo viewer) adds a history
// entry when it opens, so Android's Back gesture closes it instead of leaving the visit.
// Close from the screen with `close()`, which goes back through that same entry.
export function useBackToClose() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onBack = () => setOpen(false)
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [open])

  const show = useCallback(() => {
    window.history.pushState(window.history.state, '')
    setOpen(true)
  }, [])
  const close = useCallback(() => window.history.back(), [])

  return { open, show, close }
}

// A full-screen layer with a title and a big close button
export function FullScreen({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  // The page underneath doesn't scroll while the layer is open
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 py-1 pl-4 pr-1">
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <div className="shrink-0 border-t border-gray-100 bg-white p-4">{footer}</div>}
    </div>
  )
}
