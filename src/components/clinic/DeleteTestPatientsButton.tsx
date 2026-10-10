'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteTestPatients } from '@/lib/actions/patients'

export function DeleteTestPatientsButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition()

  const remove = () => {
    if (!confirm(`Delete all ${count} test patient${count === 1 ? '' : 's'}, with their visits and photos? Real patients are not touched.`)) return
    startTransition(async () => {
      const result = await deleteTestPatients()
      if (result.error) alert(result.error)
    })
  }

  return (
    <button type="button" onClick={remove} disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-amber-50 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 disabled:opacity-60">
      <Trash2 className="h-4 w-4" /> {pending ? 'Deleting…' : `Delete test patients (${count})`}
    </button>
  )
}
