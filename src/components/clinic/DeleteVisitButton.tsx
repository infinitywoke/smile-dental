'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteVisit } from '@/lib/actions/visits'

export function DeleteVisitButton({ visitId }: { visitId: string }) {
  const [pending, startTransition] = useTransition()

  const remove = () => {
    if (!confirm('Delete this whole visit, including its notes and photos? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deleteVisit(visitId)
      if (result?.error) alert(result.error)
    })
  }

  return (
    <button type="button" onClick={remove} disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
      <Trash2 className="h-4 w-4" /> {pending ? 'Deleting…' : 'Delete visit'}
    </button>
  )
}
