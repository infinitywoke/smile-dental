'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { deleteVisit } from '@/lib/actions/visits'

// Rare actions on a visit, out of the way of the three steps
export function VisitMenu({ visitId }: { visitId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function remove() {
    setOpen(false)
    if (!window.confirm('Delete this whole visit, including its notes, photos, bill and payments? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deleteVisit(visitId)
      if (result?.error) window.alert(result.error)
    })
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label="Visit menu" aria-expanded={open} disabled={pending} onClick={() => setOpen((o) => !o)}
        className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
        <MoreHorizontal className="h-6 w-6" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-48 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-gray-200">
          <button type="button" role="menuitem" onClick={remove}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> Delete visit
          </button>
        </div>
      )}
    </div>
  )
}
