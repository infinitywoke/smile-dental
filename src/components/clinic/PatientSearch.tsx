'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { findPatients } from '@/lib/actions/patients'

export type PatientRow = { id: string; name: string; detail: string; alert: boolean }

// One search box: results appear while typing a name or phone number, no Search button.
// Tapping a row opens the patient. Empty, it lists the newest patients.
// The list on screen always belongs to what is in the box: while a search is on its way it says
// "Searching…", and a search that fails clears the list rather than leave old rows looking like results.
export function PatientSearch({ initial }: { initial: PatientRow[] }) {
  const [query, setQuery] = useState('')
  // The rows, and the search they came back for (the newest patients came with the page, for "")
  const [result, setResult] = useState<{ query: string; rows: PatientRow[]; failed: boolean }>({ query: '', rows: initial, failed: false })
  const latest = useRef(0)

  useEffect(() => {
    const ticket = ++latest.current
    // The newest patients came with the page; look again only after typing (or on coming back)
    if (ticket === 1 && !query) return
    const timer = setTimeout(
      () => {
        findPatients(query).then(
          (found) => {
            if (ticket === latest.current) setResult({ query, rows: found, failed: false })
          },
          () => {
            if (ticket === latest.current) setResult({ query, rows: [], failed: true })
          },
        )
      },
      query ? 150 : 0,
    )
    return () => clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  const searching = result.query !== query
  const rows = result.rows
  const failed = !searching && result.failed

  return (
    <div className="space-y-4">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search patients"
        placeholder="Search name or phone" autoComplete="off" enterKeyHint="search"
        className="block min-h-12 w-full rounded-full border-0 px-5 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />

      <p className={`text-sm font-medium ${failed ? 'text-red-700' : 'text-gray-500'}`} aria-live="polite">
        {searching
          ? 'Searching…'
          : failed
            ? 'Couldn’t search. Check the internet.'
            : typed
              ? `${rows.length} result${rows.length === 1 ? '' : 's'} for “${typed}”`
              : 'Newest patients'}
      </p>

      {rows.length === 0 && !searching && !failed && (
        <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-gray-200">
          <p className="text-gray-600">{typed ? 'No patients found.' : 'No patients yet.'}</p>
          <Link href="/app/patients/new" className="mt-2 inline-flex min-h-12 items-center font-semibold text-blue-600">Add a new patient</Link>
        </div>
      )}

      {/* Older rows stay faded while a search is on its way, and can't be tapped */}
      <ul className={`space-y-2 ${searching ? 'pointer-events-none opacity-40' : ''}`} aria-busy={searching}>
        {rows.map((patient) => (
          <li key={patient.id}>
            <Link href={`/app/patients/${patient.id}`}
              className="flex min-h-14 items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold text-gray-900">
                  <span className="truncate">{patient.name}</span>
                  {patient.alert && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
                </p>
                <p className="text-sm text-gray-500">{patient.detail}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
