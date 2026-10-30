'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { addChair, addDentist, removeFromTeam } from '@/lib/actions/team'
import type { Team } from '@/lib/data/team'

const input = 'block min-h-12 w-full rounded-xl border-0 px-4 text-base text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600'
const add = 'min-h-12 rounded-full bg-blue-600 px-5 text-base font-semibold text-white disabled:opacity-60'
const row = 'flex min-h-14 items-center gap-3 px-4 py-2'

// Clinic settings: the chairs that can be in use at once, and who sees patients. Dentists are here for booking only.
export function TeamSettings({ team }: { team: Team }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [chair, setChair] = useState('')
  const [dentist, setDentist] = useState({ name: '', shortName: '', visiting: false })

  function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) {
    setError(null)
    start(async () => {
      const result = await work()
      if (result.ok) then?.()
      else setError(result.error)
    })
  }

  const submitChair = (e: FormEvent) => {
    e.preventDefault()
    run(() => addChair(chair), () => setChair(''))
  }
  const submitDentist = (e: FormEvent) => {
    e.preventDefault()
    run(() => addDentist(dentist), () => setDentist({ name: '', shortName: '', visiting: false }))
  }
  const remove = (kind: 'chair' | 'dentist', id: string, name: string) => (
    team.isOwner && (
      <button type="button" disabled={pending} onClick={() => run(() => removeFromTeam(kind, id))} aria-label={`Remove ${name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-60">
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    )
  )

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      <section aria-label="Chairs" className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900">Chairs</h2>
        <p className="text-sm text-gray-600">Each chair takes one patient at a time. The website offers a time while a chair is free.</p>
        <ul className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {team.chairs.map((c) => (
            <li key={c.id} className={row}>
              <span className="flex-1 font-semibold text-gray-900">{c.name}</span>
              {team.chairs.length > 1 && remove('chair', c.id, c.name)}
            </li>
          ))}
        </ul>
        {team.isOwner && (
          <form onSubmit={submitChair} className="flex gap-2">
            <input value={chair} onChange={(e) => setChair(e.target.value)} aria-label="New chair's name" placeholder="Chair 2" className={input} />
            <button type="submit" disabled={pending || !chair.trim()} className={add}>Add</button>
          </form>
        )}
      </section>

      <section aria-label="Dentists" className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900">Dentists</h2>
        <p className="text-sm text-gray-600">
          Who a patient can be booked with. Visiting specialists are booked by the clinic: they open no free times on the website.
        </p>
        <ul className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {team.dentists.map((d) => (
            <li key={d.id} className={row}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-gray-900">{d.name}</span>
                {d.visiting && <span className="block text-sm text-gray-500">Visiting</span>}
              </span>
              {team.dentists.length > 1 && !d.hasLogin && remove('dentist', d.id, d.name)}
            </li>
          ))}
        </ul>
        {team.isOwner && (
          <form onSubmit={submitDentist} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <input value={dentist.name} onChange={(e) => setDentist({ ...dentist, name: e.target.value })} aria-label="Dentist's full name" placeholder="Full name" className={input} />
            <input value={dentist.shortName} onChange={(e) => setDentist({ ...dentist, shortName: e.target.value })} aria-label="Short name (optional)" placeholder="Short name, like Dr. Arun (optional)" className={input} />
            <label className="flex min-h-12 items-center gap-3 text-base text-gray-900">
              <input type="checkbox" checked={dentist.visiting} onChange={(e) => setDentist({ ...dentist, visiting: e.target.checked })} className="h-5 w-5 rounded" />
              Visiting specialist
            </label>
            <button type="submit" disabled={pending || dentist.name.trim().length < 2} className={`${add} w-full`}>Add dentist</button>
          </form>
        )}
      </section>
    </div>
  )
}
