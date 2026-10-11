'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertCircle, CalendarCheck, MessageCircle, Search } from 'lucide-react'
import { bookAppointment, bookNewPatient, findPatientsToBook } from '@/lib/actions/appointments'
import { TestBadge } from './ui'
import { GenderChoice } from '@/components/GenderChoice'
import type { Gender } from '@/lib/gender'

type PatientOption = { id: string; name: string; phone: string | null; isTest: boolean; age: number | null }

type Props = {
  startsAt: string
  when: string
  patients: PatientOption[]
  backTo: string
  // Name of the place the link goes back to ("Today" or the patient's name)
  backLabel?: string
  // Booking for a patient already chosen (from their page): nothing to pick
  only?: { id: string; name: string }
  // Shown instead of the form while the time is not free (but never over a booking just made)
  notice?: ReactNode
}

const inputClass =
  'block w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'

// Phone booking from the calendar: pick a patient already in the app, or add a new one with just a name and number
export function BookAppointment({ startsAt, when, patients: initialPatients, backTo, backLabel = 'Today', only, notice }: Props) {
  const [mode, setMode] = useState<'existing' | 'new'>(only || initialPatients.length > 0 ? 'existing' : 'new')
  const [patientId, setPatientId] = useState<string | null>(only?.id ?? null)
  const [reason, setReason] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState(initialPatients)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ whatsappUrl?: string; patientId?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // Results appear while typing (name or phone): no Search button
  useEffect(() => {
    if (only || notice) return
    let stale = false
    const timer = setTimeout(async () => {
      const found = await findPatientsToBook(query)
      if (!stale) setPatients(found)
    }, 200)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, only, notice])

  function submit() {
    setError(null)
    startTransition(async () => {
      const result =
        mode === 'existing'
          ? await bookAppointment(patientId ?? '', startsAt, reason)
          : await bookNewPatient({ name, phone, gender, reason }, startsAt)
      if (result.error) setError(result.error)
      else setDone({ whatsappUrl: result.whatsappUrl, patientId: result.patientId })
    })
  }

  if (done) {
    return (
      <div className="space-y-4 rounded-2xl bg-green-50 p-5 text-center ring-1 ring-green-200">
        <CalendarCheck className="mx-auto h-10 w-10 text-green-600" />
        <h2 className="text-xl font-bold text-gray-900">Booked</h2>
        <p className="text-gray-700">{when}</p>
        {done.whatsappUrl && (
          <a href={done.whatsappUrl}
            className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white">
            <MessageCircle className="h-6 w-6" /> Send confirmation on WhatsApp
          </a>
        )}
        <div className="flex justify-center gap-4 text-sm font-semibold text-blue-700">
          {done.patientId && <Link href={`/app/patients/${done.patientId}`} className="flex min-h-12 items-center px-2">Open patient</Link>}
          <Link href={backTo} className="flex min-h-12 items-center px-2">Back to {backLabel}</Link>
        </div>
      </div>
    )
  }

  if (notice) return <div className="space-y-5">{notice}</div>

  const ready = mode === 'existing' ? !!patientId : name.trim().length > 0 && !!gender

  return (
    <div className="space-y-4">
      {!only && <div className="flex gap-2 rounded-full bg-gray-100 p-1 text-sm font-semibold">
        <button type="button" onClick={() => setMode('existing')}
          className={`min-h-12 flex-1 rounded-full px-3 py-2 ${mode === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Existing patient
        </button>
        <button type="button" onClick={() => setMode('new')}
          className={`min-h-12 flex-1 rounded-full px-3 py-2 ${mode === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          New patient
        </button>
      </div>}

      {only ? (
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-base font-semibold text-blue-900 ring-1 ring-blue-100">{only.name}</p>
      ) : mode === 'existing' ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
              aria-label="Search name or phone" placeholder="Search name or phone"
              className="block min-h-12 w-full rounded-full border-0 py-3 pl-11 pr-4 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
          </div>
          {patients.length === 0 && <p className="text-sm text-gray-500">No patients found. Try another name or number, or add a new patient.</p>}
          {patients.map((p) => (
            <button key={p.id} type="button" onClick={() => setPatientId(p.id)} aria-pressed={patientId === p.id}
              className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 text-left ring-inset ${patientId === p.id ? 'bg-blue-50 ring-2 ring-blue-600' : 'bg-white ring-1 ring-gray-300'}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold text-gray-900">
                  <span className="truncate">{p.name}</span>
                  {p.isTest && <TestBadge />}
                </span>
                <span className="block text-sm text-gray-500">
                  {[p.age !== null && `${p.age} yrs`, p.phone].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="new-name" className="text-sm font-semibold text-gray-700">Name</label>
            <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-phone" className="text-sm font-semibold text-gray-700">WhatsApp number</label>
            <input id="new-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className={inputClass} placeholder="98450 21763" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-gray-700">Gender</p>
            <GenderChoice value={gender} onChange={setGender} id="new-gender" />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="reason" className="text-sm font-semibold text-gray-700">Reason (optional)</label>
        <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" className={inputClass} placeholder="Check-up, tooth pain…" />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button type="button" onClick={submit} disabled={!ready || pending}
        className="min-h-12 w-full rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
        {pending ? 'Booking…' : 'Book appointment'}
      </button>
    </div>
  )
}
