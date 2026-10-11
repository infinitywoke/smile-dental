'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, UserCheck } from 'lucide-react'
import { useResetOnHide } from './useResetOnHide'
import { lookupPhone, type PatientFormState } from '@/lib/actions/patients'
import { formatPhone, normalizePhone } from '@/lib/phone'
import { ageOn, todayInIndia } from '@/lib/dates'
import type { Patient } from '@/lib/data/types'
import { parseGender, type Gender } from '@/lib/gender'
import { GenderChoice } from '@/components/GenderChoice'

type Props = {
  action: (prev: PatientFormState, formData: FormData) => Promise<PatientFormState>
  patient?: Patient
  submitLabel: string
}

export function PatientForm(props: Props) {
  const resetKey = useResetOnHide()
  return <PatientFields key={resetKey} {...props} />
}

const HEARD_FROM = ['Friend / family', 'Google', 'Website', 'Walked past', 'Instagram', 'Doctor referral']

const inputClass =
  'block w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'text-sm font-semibold text-gray-700'

function PatientFields({ action, patient, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const [phone, setPhone] = useState(patient?.phone ? formatPhone(patient.phone) : '')
  const [name, setName] = useState(patient?.name ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(patient?.date_of_birth ?? '')
  const [gender, setGender] = useState<Gender | ''>(parseGender(patient?.gender) ?? '')
  const [address, setAddress] = useState(patient?.address ?? '')
  const [alerts, setAlerts] = useState(patient?.medical_alerts ?? '')
  const [heardFrom, setHeardFrom] = useState(patient?.heard_from ?? '')
  const [lookup, setLookup] = useState<{ phone: string; matches: { id: string; name: string; date_of_birth: string | null }[] }>({ phone: '', matches: [] })

  // Spot returning patients as soon as a full number is typed
  const normalizedPhone = normalizePhone(phone)
  const fullPhone = normalizedPhone && normalizedPhone.length === 10 ? normalizedPhone : null
  const matches = fullPhone && lookup.phone === fullPhone ? lookup.matches : []

  useEffect(() => {
    if (!fullPhone) return
    let cancelled = false
    lookupPhone(fullPhone).then((found) => {
      if (!cancelled) setLookup({ phone: fullPhone, matches: found.filter((m) => m.id !== patient?.id) })
    })
    return () => {
      cancelled = true
    }
  }, [fullPhone, patient?.id])

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="phone" className={labelClass}>WhatsApp number</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="98450 21763"
          value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        {matches.length > 0 && (
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-sm font-semibold text-amber-900">Already a patient with this number:</p>
            <ul className="mt-2 space-y-1.5">
              {matches.map((m) => (
                <li key={m.id}>
                  <Link href={`/app/patients/${m.id}`} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-900 ring-1 ring-amber-200">
                    <UserCheck className="h-4 w-4 text-amber-700" />
                    {m.name}
                    {m.date_of_birth && <span className="text-gray-500">· {ageOn(m.date_of_birth)} yrs</span>}
                    <span className="ml-auto text-amber-800">Open</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800">Family members can share a number. Carry on below to add someone new.</p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="name" className={labelClass}>Name</label>
        <input id="name" name="name" required autoComplete="off" placeholder="Prakash Shetty"
          value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <p className={labelClass}>Gender</p>
        <GenderChoice value={gender} onChange={setGender} name="gender" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="date_of_birth" className={labelClass}>Date of birth</label>
        <input id="date_of_birth" name="date_of_birth" type="date" max={todayInIndia()}
          value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="address" className={labelClass}>Address</label>
        <textarea id="address" name="address" rows={2} placeholder="Pangala, Udupi"
          value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="medical_alerts" className={labelClass}>Medical alerts</label>
        <textarea id="medical_alerts" name="medical_alerts" rows={2} placeholder="Allergies, diabetes, BP, blood thinners…"
          value={alerts} onChange={(e) => setAlerts(e.target.value)} className={inputClass} />
        <p className="text-xs text-gray-500">Shown at the top of every visit. Leave empty if none.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="heard_from" className={labelClass}>How did they hear about us?</label>
        <div className="flex flex-wrap gap-2">
          {HEARD_FROM.map((option) => (
            <button key={option} type="button" onClick={() => setHeardFrom(heardFrom === option ? '' : option)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${
                heardFrom === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
              }`}>
              {option}
            </button>
          ))}
        </div>
        <input id="heard_from" name="heard_from" autoComplete="off" placeholder="Or type…"
          value={heardFrom} onChange={(e) => setHeardFrom(e.target.value)} className={inputClass} />
      </div>

      <button type="submit" disabled={pending}
        className="w-full rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
