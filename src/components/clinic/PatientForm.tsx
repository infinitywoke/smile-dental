'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, UserCheck } from 'lucide-react'
import { lookupPhone, type PatientFormState } from '@/lib/actions/patients'
import { formatPhone, normalizePhone } from '@/lib/phone'
import type { Patient } from '@/lib/data/types'
import { parseGender, type Gender } from '@/lib/gender'
import { GenderChoice } from '@/components/GenderChoice'

type Props = {
  action: (prev: PatientFormState, formData: FormData) => Promise<PatientFormState>
  // Given when editing
  patient?: Patient
  // The patient's age in years (worked out on the server from the birth year or date of birth)
  age?: number | null
  submitLabel: string
}

// A half-typed form is kept while the screen is hidden (Android Back, another tab), so the doctor
// never loses typing. Once the patient is saved the form is emptied, ready for the next one.
export function PatientForm(props: Props) {
  const saving = useRef(false)
  const [resetKey, setResetKey] = useState(0)

  // The cleanup runs when Next hides this screen (or removes it): start fresh only if it was saved
  useEffect(
    () => () => {
      if (saving.current) {
        saving.current = false
        setResetKey((k) => k + 1)
      }
    },
    [],
  )

  const setSaving = useCallback((value: boolean) => { saving.current = value }, [])

  return <PatientFields key={resetKey} {...props} setSaving={setSaving} />
}

const HEARD_FROM = ['Friend / family', 'Google', 'Website', 'Walked past', 'Instagram', 'Doctor referral']

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'text-sm font-semibold text-gray-700'

function PatientFields({ action, patient, age, submitLabel, setSaving }: Props & { setSaving: (value: boolean) => void }) {
  const [state, formAction, pending] = useActionState(action, {})
  const [phone, setPhone] = useState(patient?.phone ? formatPhone(patient.phone) : '')
  const [name, setName] = useState(patient?.name ?? '')
  const [ageText, setAgeText] = useState(age != null ? String(age) : '')
  const [gender, setGender] = useState<Gender | ''>(parseGender(patient?.gender) ?? '')
  const [address, setAddress] = useState(patient?.address ?? '')
  const [alerts, setAlerts] = useState(patient?.medical_alerts ?? '')
  const [heardFrom, setHeardFrom] = useState(patient?.heard_from ?? '')
  const [lookup, setLookup] = useState<{ phone: string; matches: { id: string; name: string; age: number | null }[] }>({ phone: '', matches: [] })

  // A failed save means the form stays, so it must not be emptied when hidden
  useEffect(() => {
    if (state.error) setSaving(false)
  }, [state, setSaving])

  // Only the name and gender are needed; the button looks grey until they are filled
  const ready = name.trim().length > 0 && (!!patient || gender !== '')

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

  // Chips only; a value from elsewhere (the website form) is shown as one more chip
  const options = heardFrom && !HEARD_FROM.includes(heardFrom) ? [...HEARD_FROM, heardFrom] : HEARD_FROM

  return (
    <form action={formAction} onSubmit={() => setSaving(true)} className="space-y-5">
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
                  <Link href={`/app/patients/${m.id}`} className="flex min-h-12 items-center gap-2 rounded-lg bg-white px-3 py-2 text-base font-medium text-gray-900 ring-1 ring-amber-200">
                    <UserCheck className="h-5 w-5 shrink-0 text-amber-700" />
                    <span className="truncate">{m.name}</span>
                    {m.age !== null && <span className="shrink-0 text-gray-500">· {m.age} yrs</span>}
                    <span className="ml-auto shrink-0 text-amber-800">Open</span>
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
        <input id="name" name="name" autoComplete="off" autoCapitalize="words" placeholder="Prakash Shetty"
          value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <p className={labelClass}>Gender</p>
        <GenderChoice value={gender} onChange={setGender} name="gender" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="age" className={labelClass}>Age (years)</label>
        <input id="age" name="age" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} autoComplete="off" placeholder="35"
          value={ageText} onChange={(e) => setAgeText(e.target.value.replace(/\D/g, ''))} className={inputClass} />
        <input type="hidden" name="age_was" value={age != null ? String(age) : ''} />
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
        <p className={labelClass}>How did they hear about us?</p>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button key={option} type="button" aria-pressed={heardFrom === option} onClick={() => setHeardFrom(heardFrom === option ? '' : option)}
              className={`min-h-12 rounded-full px-4 text-base font-medium ring-1 ring-inset transition-colors ${
                heardFrom === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
              }`}>
              {option}
            </button>
          ))}
        </div>
        <input type="hidden" name="heard_from" value={heardFrom} />
      </div>

      <div className="space-y-3">
        {state.error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}
        <button type="submit" disabled={pending}
          className={`min-h-14 w-full rounded-full px-5 py-3.5 text-base font-semibold shadow-sm disabled:opacity-60 ${
            ready ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-500'
          }`}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
