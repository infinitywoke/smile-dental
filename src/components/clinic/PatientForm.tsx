'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, RotateCcw, UserCheck } from 'lucide-react'
import { lookupPhone, type PatientFormState } from '@/lib/actions/patients'
import { ageOn, birthDateFrom } from '@/lib/patient-fields'
import { formatPhone, normalizePhone } from '@/lib/phone'
import type { Patient } from '@/lib/data/types'
import { parseGender, type Gender } from '@/lib/gender'
import { GenderChoice } from '@/components/GenderChoice'
import { KANNADA_READY } from '@/lib/whatsapp'

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
// On New patient, "Start fresh" empties it by hand, and a form that comes back with typing in it
// says whose it is, so one person's phone or medical alert never slips onto the next walk-in.
// A new patient gets its id here, on the phone, once per patient: a save repeated after a lost
// reply sends the same id, so the server knows it is saved already and never makes a second record.
export function PatientForm(props: Props) {
  const saving = useRef(false)
  const newId = useRef<string | null>(null)
  const [resetKey, setResetKey] = useState(0)

  // The cleanup runs when Next hides this screen (or removes it): start fresh only if it was saved
  useEffect(
    () => () => {
      if (saving.current) {
        saving.current = false
        newId.current = null
        setResetKey((k) => k + 1)
      }
    },
    [],
  )

  const setSaving = useCallback((value: boolean) => { saving.current = value }, [])
  const startFresh = useCallback(() => {
    saving.current = false
    newId.current = null
    setResetKey((k) => k + 1)
  }, [])
  const takeId = useCallback(() => (newId.current ??= crypto.randomUUID()), [])

  return <PatientFields key={resetKey} {...props} setSaving={setSaving} startFresh={startFresh} takeId={takeId} />
}

const HEARD_FROM = ['Friend / family', 'Google', 'Website', 'Walked past', 'Instagram', 'Doctor referral']
// The language of their WhatsApp messages ('' is English)
const LANGUAGES = [['', 'English'], ['kn', 'ಕನ್ನಡ']] as const

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const boxClass = inputClass.replace('px-4', 'px-2 text-center')
const labelClass = 'text-sm font-semibold text-gray-700'
const switchClass = 'min-h-11 text-sm font-semibold text-blue-700'
const digits = (event: React.ChangeEvent<HTMLInputElement>) => event.target.value.replace(/\D/g, '')

function PatientFields({
  action,
  patient,
  age,
  submitLabel,
  setSaving,
  startFresh,
  takeId,
}: Props & { setSaving: (value: boolean) => void; startFresh: () => void; takeId: () => string }) {
  const [state, formAction, pending] = useActionState(action, {})
  const [phone, setPhone] = useState(patient?.phone ? formatPhone(patient.phone) : '')
  const [name, setName] = useState(patient?.name ?? '')
  const [ageText, setAgeText] = useState(age != null ? String(age) : '')
  // The date of birth as day, month and year; or the age, when that is all the patient knows (one
  // saved with only an age opens that way)
  const birthDate = patient?.birth_date ?? null
  const [byAge, setByAge] = useState(!birthDate && age != null)
  const [birthDay, setBirthDay] = useState(birthDate ? String(Number(birthDate.slice(8))) : '')
  const [birthMonth, setBirthMonth] = useState(birthDate ? String(Number(birthDate.slice(5, 7))) : '')
  const [birthYear, setBirthYear] = useState(birthDate ? birthDate.slice(0, 4) : '')
  const typedBirthDate = birthDateFrom(birthDay, birthMonth, birthYear)
  const [gender, setGender] = useState<Gender | ''>(parseGender(patient?.gender) ?? '')
  const [address, setAddress] = useState(patient?.address ?? '')
  const [alerts, setAlerts] = useState(patient?.medical_alerts ?? '')
  const [heardFrom, setHeardFrom] = useState(patient?.heard_from ?? '')
  const [language, setLanguage] = useState<string>(patient?.language === 'kn' ? 'kn' : '')
  const consentWas = patient?.consent_at ?? null
  const [agreed, setAgreed] = useState(Boolean(consentWas))
  const [lookup, setLookup] = useState<{ phone: string; matches: { id: string; name: string; age: number | null }[] }>({ phone: '', matches: [] })

  // New patient only: anything typed at all (Start fresh shows once there is)
  const typed = !patient && (agreed || [phone, name, ageText, birthDay, birthMonth, birthYear, gender, address, alerts, heardFrom, language].some((value) => value.trim() !== ''))
  // Left with typing in it (Back, another screen): when it shows again, the top line says whose it is
  const typedRef = useRef(typed)
  useEffect(() => {
    typedRef.current = typed
  }, [typed])
  const [continuing, setContinuing] = useState(false)
  useEffect(
    () => () => {
      if (typedRef.current) setContinuing(true)
    },
    [],
  )

  // A failed save means the form stays, so it must not be emptied when hidden
  useEffect(() => {
    if (state.error) setSaving(false)
  }, [state, setSaving])

  // Only the name, the gender and their agreement are needed; the button looks grey until they are there
  const ready = name.trim().length > 0 && (!!patient || (gender !== '' && agreed))

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
    <form action={formAction} className="space-y-5"
      onSubmit={(e) => {
        setSaving(true)
        // Read by the action after this runs (React builds the form data after onSubmit)
        const id = e.currentTarget.elements.namedItem('patient_id')
        if (id instanceof HTMLInputElement) id.value = takeId()
      }}>
      {!patient && <input type="hidden" name="patient_id" defaultValue="" />}
      {typed && (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-base font-medium text-gray-700" role="status">
            {continuing && (name.trim() ? <>Continuing <span className="font-semibold text-gray-900">{name.trim()}</span></> : 'Continuing a half-typed patient')}
          </p>
          <button type="button" onClick={startFresh}
            className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-4 text-base font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Start fresh
          </button>
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

      {byAge ? (
        <div className="space-y-1.5">
          <label htmlFor="age" className={labelClass}>Age (years)</label>
          <input id="age" name="age" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} autoComplete="off" placeholder="35"
            value={ageText} onChange={(e) => setAgeText(digits(e))} className={inputClass} />
          <input type="hidden" name="age_was" value={age != null ? String(age) : ''} />
          <input type="hidden" name="birth_by" value="age" />
          <button type="button" onClick={() => setByAge(false)} className={switchClass}>Enter the date of birth instead</button>
        </div>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className={labelClass}>Date of birth</legend>
          <div className="flex items-end gap-2">
            <label className="w-16 space-y-1 text-xs font-semibold text-gray-500">
              Day
              <input name="birth_day" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} autoComplete="off" placeholder="12"
                value={birthDay} onChange={(e) => setBirthDay(digits(e))} className={boxClass} />
            </label>
            <label className="w-16 space-y-1 text-xs font-semibold text-gray-500">
              Month
              <input name="birth_month" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} autoComplete="off" placeholder="3"
                value={birthMonth} onChange={(e) => setBirthMonth(digits(e))} className={boxClass} />
            </label>
            <label className="w-24 space-y-1 text-xs font-semibold text-gray-500">
              Year
              <input name="birth_year_typed" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" placeholder="1985"
                value={birthYear} onChange={(e) => setBirthYear(digits(e))} className={boxClass} />
            </label>
            {typedBirthDate && <p className="flex min-h-12 items-center text-base font-semibold text-gray-700">{ageOn(typedBirthDate)} yrs</p>}
          </div>
          <input type="hidden" name="birth_date_was" value={birthDate ?? ''} />
          <button type="button" onClick={() => setByAge(true)} className={switchClass}>Only know the age?</button>
        </fieldset>
      )}

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

      {/* Only once Dr. Rahil has checked the Kannada messages (src/lib/whatsapp.ts) */}
      {KANNADA_READY && (
        <div className="space-y-1.5">
          <p className={labelClass}>WhatsApp messages in</p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)}
                className={`min-h-12 rounded-full px-4 text-base font-medium ring-1 ring-inset transition-colors ${
                  language === value ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="language" value={language} />
        </div>
      )}

      <input type="hidden" name="consent_was" value={consentWas ?? ''} />
      {patient && <ConsentTick agreed={agreed} onChange={setAgreed} />}

      {/* Stays just above the bottom bar, so it is in reach without scrolling, as the booking screens' Save.
          A new patient's agreement is the last thing asked, so it sits here too, just above the button. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 space-y-2 border-t border-gray-200 bg-gray-50 px-4 pt-2 pb-2">
        {!patient && <ConsentTick agreed={agreed} onChange={setAgreed} />}
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

// Their agreement to the clinic keeping their records (India's data protection law): asked when they
// are added. Editing shows what they said, and taking the tick off records that they withdrew it.
function ConsentTick({ agreed, onChange }: { agreed: boolean; onChange: (agreed: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3">
      <input type="checkbox" name="consent" value="yes" checked={agreed} onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 shrink-0 rounded border-gray-300 text-blue-600" />
      <span className="min-w-0">
        <span className="block text-base font-semibold text-gray-900">They agree to the clinic keeping their records</span>
        <span className="block text-xs text-gray-500">Their details and treatment notes, for their care. Ask them first.</span>
      </span>
    </label>
  )
}
