'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, CalendarCheck, MessageCircle } from 'lucide-react'
import { bookAppointment, bookNewPatient } from '@/lib/actions/appointments'
import { TestBadge } from './ui'

type PatientOption = { id: string; name: string; phone: string | null; isTest: boolean; age: number | null }

type Props = {
  startsAt: string
  when: string
  patients: PatientOption[]
  backTo: string
}

const inputClass =
  'block w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'

// Phone booking from the calendar: pick a patient already in the app, or add a new one with just a name and number
export function BookAppointment({ startsAt, when, patients, backTo }: Props) {
  const [mode, setMode] = useState<'existing' | 'new'>(patients.length > 0 ? 'existing' : 'new')
  const [patientId, setPatientId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [isTest, setIsTest] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ whatsappUrl?: string; patientId?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result =
        mode === 'existing'
          ? await bookAppointment(patientId ?? '', startsAt, reason)
          : await bookNewPatient({ name, phone, reason, isTest }, startsAt)
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
          {done.patientId && <Link href={`/app/patients/${done.patientId}`}>Open patient</Link>}
          <Link href={backTo}>Back to calendar</Link>
        </div>
      </div>
    )
  }

  const ready = mode === 'existing' ? !!patientId : name.trim().length > 0

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-full bg-gray-100 p-1 text-sm font-semibold">
        <button type="button" onClick={() => setMode('existing')}
          className={`flex-1 rounded-full px-3 py-2 ${mode === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          Existing patient
        </button>
        <button type="button" onClick={() => setMode('new')}
          className={`flex-1 rounded-full px-3 py-2 ${mode === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          New patient
        </button>
      </div>

      {mode === 'existing' ? (
        <div className="space-y-2">
          {patients.length === 0 && <p className="text-sm text-gray-500">No patients found. Search above, or add a new patient.</p>}
          {patients.map((p) => (
            <label key={p.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-inset ${patientId === p.id ? 'ring-2 ring-blue-600' : 'ring-gray-300'}`}>
              <input type="radio" name="patient" checked={patientId === p.id} onChange={() => setPatientId(p.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="truncate">{p.name}</span>
                  {p.isTest && <TestBadge />}
                </span>
                <span className="block text-xs text-gray-500">
                  {[p.age !== null && `${p.age} yrs`, p.phone].filter(Boolean).join(' · ')}
                </span>
              </span>
            </label>
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
          <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} className="mt-1 h-5 w-5 rounded border-gray-300 text-amber-600" />
            <span className="text-sm text-amber-900"><span className="font-semibold">Test patient</span> — can be deleted in one go later.</span>
          </label>
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
        className="w-full rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
        {pending ? 'Booking…' : 'Book appointment'}
      </button>
    </div>
  )
}
