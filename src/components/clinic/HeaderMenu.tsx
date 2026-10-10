'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, LogOut, MoreHorizontal, Trash2 } from 'lucide-react'
import { setPracticeMode } from '@/lib/actions/practice'
import { deleteTestPatients } from '@/lib/actions/patients'

// The rare things live here so the screens stay clean
export function HeaderMenu({ practice }: { practice: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  // A short confirmation that fades by itself, so the menu can close right away
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(timer)
  }, [message])

  function togglePractice() {
    setOpen(false)
    startTransition(async () => {
      await setPracticeMode(!practice)
      router.refresh()
    })
  }

  function removeTestData() {
    setOpen(false)
    if (!window.confirm('Delete all test patients and test bookings, with their visits, bills and photos? Real patients are not touched.')) return
    startTransition(async () => {
      const result = await deleteTestPatients()
      setMessage(result.error ?? `Deleted ${result.deleted ?? 0} test record${result.deleted === 1 ? '' : 's'}.`)
      router.refresh()
    })
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="rounded-full p-2.5 text-gray-600 hover:bg-gray-100">
        <MoreHorizontal className="h-6 w-6" />
      </button>

      {message && (
        <p role="status" className="fixed inset-x-4 top-16 z-50 mx-auto max-w-sm rounded-xl bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {message}
        </p>
      )}

      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200">
          <button type="button" role="menuitemcheckbox" aria-checked={practice} onClick={togglePractice} disabled={pending}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50">
            <FlaskConical className="h-5 w-5 text-amber-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900">Practice mode</span>
              <span className="block text-xs text-gray-500">New patients are marked TEST</span>
            </span>
            <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${practice ? 'bg-amber-500' : 'bg-gray-300'}`}>
              <span className={`h-5 w-5 rounded-full bg-white shadow transition ${practice ? 'translate-x-5' : ''}`} />
            </span>
          </button>

          <button type="button" role="menuitem" onClick={removeTestData} disabled={pending}
            className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3.5 text-left hover:bg-gray-50">
            <Trash2 className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Delete test data</span>
          </button>

          <form action="/auth/signout" method="post" className="border-t border-gray-100">
            <button type="submit" role="menuitem" className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50">
              <LogOut className="h-5 w-5 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
