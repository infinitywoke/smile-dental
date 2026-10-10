'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, ArrowRight, CalendarCheck, CalendarDays, Clock, MessageCircle, Pencil, Phone, Sun, Sunrise, Sunset,
} from 'lucide-react'
import { siteConfig } from '@/config/site'
import { submitBookingRequest } from '@/lib/actions/booking'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { addDays, formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { bookingRequestMessage, clinicWhatsappLink } from '@/lib/whatsapp'
import { SOURCE_KEY } from './SourceTracker'

// Same options the clinic app offers when a new patient walks in
const HEARD_FROM = ['Friend / family', 'Google', 'Website', 'Walked past', 'Instagram', 'Doctor referral']
const REASONS = ['Check-up / cleaning', 'Tooth pain', 'Consultation', 'Other']

const inputClass =
  'block w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'mb-1.5 block text-sm font-semibold text-gray-700'

type Details = {
  phone: string
  name: string
  dateOfBirth: string
  address: string
  medicalAlerts: string
  heardFrom: string
  reason: string
  notes: string
}

type Props = {
  // Free blocks, as ISO moments (from the database)
  slots: string[]
  // "Dr. Rahil will confirm ... in under 15 minutes."
  promise: string
  // Today in India, to keep the date of birth picker sensible
  today: string
  // Set when the visitor came from a treatment page ("Book Root Canal")
  initialReason?: string
}

// "Today", "Tomorrow" or the weekday
function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return formatDay(date).split(',')[0]
}

function partOfDay(hhmm: string): 'Morning' | 'Afternoon' | 'Evening' {
  if (hhmm < '13:00') return 'Morning'
  return hhmm < '18:00' ? 'Afternoon' : 'Evening'
}

const PART_ICON = { Morning: Sunrise, Afternoon: Sun, Evening: Sunset } as const

export function PublicBookingForm({ slots, promise, today, initialReason = '' }: Props) {
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const sendRef = useRef<HTMLButtonElement>(null)
  const focusFieldRef = useRef<string | null>(null)
  const firstRender = useRef(true)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  // Coming back from the review to change the time: return straight to the review afterwards
  const [returnToReview, setReturnToReview] = useState(false)
  const [details, setDetails] = useState<Details>({
    phone: '', name: '', dateOfBirth: '', address: '', medicalAlerts: '', heardFrom: '', reason: initialReason.slice(0, 100), notes: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ url: string } | null>(null)
  // "Google", "Instagram"... worked out from the link the visitor came from (see SourceTracker)
  const [guessed, setGuessed] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    try {
      const value = sessionStorage.getItem(SOURCE_KEY) ?? ''
      if (!value) return
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuessed(value)
      setDetails((d) => (d.heardFrom ? d : { ...d, heardFrom: value }))
    } catch {
      // Storage blocked: the visitor answers it themselves
    }
  }, [])

  // Each new step comes into view with its next action ready: the first field to fill,
  // or the Send button on the review
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const timer = setTimeout(() => {
      if (step === 2) document.getElementById(focusFieldRef.current ?? 'phone')?.focus({ preventScroll: true })
      if (step === 3) sendRef.current?.focus({ preventScroll: true })
      focusFieldRef.current = null
    }, 300)
    return () => clearTimeout(timer)
  }, [step])

  // Free times grouped by day
  const days = useMemo(() => {
    const byDay = new Map<string, string[]>()
    for (const slot of slots) {
      const { date } = inIndia(slot)
      byDay.set(date, [...(byDay.get(date) ?? []), slot])
    }
    return byDay
  }, [slots])

  const dayKeys = [...days.keys()]
  // The first day with free times is open by default, so the times are visible straight away
  const activeDay = pickedDay && days.has(pickedDay) ? pickedDay : dayKeys[0] ?? null
  const set = (patch: Partial<Details>) => setDetails((d) => ({ ...d, ...patch }))

  const phoneOk = isValidPhone(normalizePhone(details.phone))
  const detailsOk = phoneOk && details.name.trim().length >= 2 && !!details.dateOfBirth && details.address.trim().length > 0 && !!details.reason
  const callHref = `tel:${siteConfig.phone.replace(/[^\d+]/g, '')}`

  function chooseTime(slot: string) {
    setPicked(slot)
    setError(null)
    // A moment to see the choice highlighted, then straight on
    setTimeout(() => {
      setStep(returnToReview && detailsOk ? 3 : 2)
      setReturnToReview(false)
    }, 220)
  }

  // From the review: jump to the part that needs changing, with its field ready
  function changeField(id: string) {
    focusFieldRef.current = id
    setStep(2)
  }

  function submit() {
    if (!picked) return
    setError(null)
    startTransition(async () => {
      const result = await submitBookingRequest({
        name: details.name,
        phone: details.phone,
        dateOfBirth: details.dateOfBirth,
        address: details.address,
        medicalAlerts: details.medicalAlerts,
        heardFrom: details.heardFrom,
        reason: details.reason,
        notes: details.notes,
        requestedStart: picked,
      })
      if (result.ok) {
        const message = bookingRequestMessage({
          name: details.name.trim(),
          phone: normalizePhone(details.phone) ?? details.phone,
          startsAt: picked,
          reason: details.reason,
          link: `${window.location.origin}/app/requests/${result.id}`,
        })
        const url = clinicWhatsappLink(message)
        // Saved. Open WhatsApp with the message ready; keep a button in case it doesn't open.
        setSent({ url })
        window.location.assign(url)
        return
      }
      setError(result.error)
      // The time was probably taken meanwhile: reload the free times and go back to choose again
      if (/no longer available|available times/i.test(result.error)) {
        setPicked(null)
        setStep(1)
        router.refresh()
      }
    })
  }

  // ---- Saved: WhatsApp has been opened; this screen is the fallback ----
  if (sent && picked) {
    const { date, time } = inIndia(picked)
    return (
      <div className="mx-auto mt-10 max-w-md space-y-5 rounded-3xl bg-white p-6 text-center shadow-lg ring-1 ring-gray-100 sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CalendarCheck className="h-9 w-9 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Request saved</h2>
          <p className="mt-2 text-gray-600">
            {details.name.trim()}, we have your request for<br />
            <strong>{formatDay(date)}, {formatBlock(time)}</strong>.
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">WhatsApp should have opened with your message ready. Just press Send.</p>
          <p className="mt-1">That is how the clinic gets alerted.</p>
        </div>
        <a href={sent.url}
          className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white shadow-sm hover:bg-green-700">
          <MessageCircle className="h-6 w-6" />
          WhatsApp didn&apos;t open? Tap here
        </a>
        <p className="text-sm text-gray-600">{promise}</p>
      </div>
    )
  }

  const pickedParts = picked ? inIndia(picked) : null
  const stepTitles = ['Choose a time', 'Your details', 'Confirm']

  return (
    <div ref={cardRef} className="mx-auto mt-10 max-w-md scroll-mt-20 overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-100">
      {/* Progress */}
      <div className="flex gap-1.5 bg-gray-50 px-6 pt-5 sm:px-8">
        {stepTitles.map((title, i) => (
          <div key={title} className="flex-1">
            <div className={`h-1.5 rounded-full transition-colors ${i + 1 <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
            <p className={`mt-1.5 text-[11px] font-semibold uppercase tracking-wide ${i + 1 === step ? 'text-blue-700' : 'text-gray-400'}`}>
              {title}
            </p>
          </div>
        ))}
      </div>

      <div className="p-6 sm:p-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* ---- 1. Time ---- */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">When suits you?</h2>
              <p className="mt-1 text-sm text-gray-500">Tap a time and we go straight to the next step.</p>
            </div>

            {dayKeys.length === 0 ? (
              <div className="rounded-2xl bg-gray-50 p-6 text-center text-gray-700">
                <p className="font-semibold">No online times are free right now.</p>
                <a href={callHref} className="mt-3 inline-flex items-center gap-2 font-bold text-blue-700">
                  <Phone className="h-4 w-4" /> Call {siteConfig.phone}
                </a>
              </div>
            ) : (
              <>
                {/* Days */}
                <div className="-mx-6 flex snap-x gap-2.5 overflow-x-auto px-6 pb-2 sm:-mx-8 sm:px-8" role="tablist" aria-label="Day">
                  {dayKeys.map((day) => {
                    const active = activeDay === day
                    const [, month] = formatDay(day).split(', ')[1].split(' ')
                    return (
                      <button key={day} type="button" role="tab" aria-selected={active}
                        onClick={() => setPickedDay(day)}
                        className={`w-[4.5rem] shrink-0 snap-start rounded-2xl px-2 py-3 text-center transition ${
                          active
                            ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30'
                            : 'bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200 hover:ring-blue-300'
                        }`}>
                        <span className={`block text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-blue-100' : 'text-gray-500'}`}>
                          {dayLabel(day, today)}
                        </span>
                        <span className="block text-2xl font-bold leading-tight">{Number(day.slice(8))}</span>
                        <span className={`block text-xs ${active ? 'text-blue-100' : 'text-gray-500'}`}>{month}</span>
                        <span className={`mt-1.5 block rounded-full px-1 text-[10px] font-semibold ${active ? 'bg-white/20' : 'bg-green-50 text-green-700'}`}>
                          {days.get(day)!.length} free
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Times */}
                {activeDay && (
                  <div className="space-y-4">
                    {(['Morning', 'Afternoon', 'Evening'] as const).map((part) => {
                      const times = days.get(activeDay)!.filter((slot) => partOfDay(inIndia(slot).time) === part)
                      if (times.length === 0) return null
                      const Icon = PART_ICON[part]
                      return (
                        <div key={part}>
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                            <Icon className="h-4 w-4 text-amber-500" /> {part}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {times.map((slot) => {
                              const chosen = picked === slot
                              return (
                                <button key={slot} type="button" onClick={() => chooseTime(slot)}
                                  className={`rounded-xl py-3 text-sm font-semibold transition active:scale-95 ${
                                    chosen
                                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                                      : 'bg-white text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-blue-50 hover:ring-blue-400'
                                  }`}>
                                  {formatBlock(inIndia(slot).time)}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            <div className="flex items-start gap-3 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <p>
                Closed on Fridays. Need a time after <b>7 PM</b>, or don&apos;t see one that suits you?{' '}
                <a href={callHref} className="font-bold text-blue-700">Please call {siteConfig.phone}</a>.
              </p>
            </div>
          </div>
        )}

        {/* ---- 2. Details ---- */}
        {step === 2 && (
          <div className="space-y-5">
            {pickedParts && (
              <button type="button" onClick={() => { setReturnToReview(false); setStep(1) }}
                className="flex w-full items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-left ring-1 ring-blue-100">
                <CalendarDays className="h-5 w-5 shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1 text-sm font-semibold text-blue-900">
                  {formatDay(pickedParts.date)}, {formatBlock(pickedParts.time)}
                </span>
                <span className="text-xs font-semibold text-blue-700">Change</span>
              </button>
            )}

            <div>
              <h2 className="text-2xl font-bold text-gray-900">Your details</h2>
              <p className="mt-1 text-sm text-gray-500">So the clinic can prepare for you.</p>
            </div>

            <div>
              <label htmlFor="phone" className={labelClass}>WhatsApp number</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98450 21763"
                value={details.phone} onChange={(e) => set({ phone: e.target.value })} className={inputClass} />
              <p className="mt-1 text-xs text-gray-400">We will send your confirmation here.</p>
            </div>

            <div>
              <label htmlFor="name" className={labelClass}>Full name</label>
              <input id="name" autoComplete="name" placeholder="Prakash Shetty"
                value={details.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
            </div>

            <div>
              <label htmlFor="dob" className={labelClass}>Date of birth</label>
              <input id="dob" type="date" max={today} autoComplete="bday"
                value={details.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} className={inputClass} />
            </div>

            <div>
              <label htmlFor="address" className={labelClass}>Address</label>
              <textarea id="address" rows={2} autoComplete="street-address" placeholder="Pangala, Udupi"
                value={details.address} onChange={(e) => set({ address: e.target.value })} className={inputClass} />
            </div>

            <div>
              <p id="reason" tabIndex={-1} className={`${labelClass} outline-none`}>Reason for visit</p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((option) => (
                  <button key={option} type="button" onClick={() => set({ reason: details.reason === option ? '' : option })}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium ring-1 ring-inset ${
                      details.reason === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
                    }`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="alerts" className={labelClass}>Medical alerts <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea id="alerts" rows={3} placeholder="Any allergies / medical conditions we should know about? (e.g. penicillin allergy, diabetes, BP, blood thinners)"
                value={details.medicalAlerts} onChange={(e) => set({ medicalAlerts: e.target.value })} className={inputClass} />
            </div>

            <div>
              <p id="heard" tabIndex={-1} className={`${labelClass} outline-none`}>How did you hear about us? <span className="font-normal text-gray-400">(optional)</span></p>
              {guessed && details.heardFrom === guessed && (
                <p className="mb-2 text-xs text-gray-400">We filled this in from the link you came from. Change it if it is wrong.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {HEARD_FROM.map((option) => (
                  <button key={option} type="button" onClick={() => set({ heardFrom: details.heardFrom === option ? '' : option })}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium ring-1 ring-inset ${
                      details.heardFrom === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
                    }`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="notes" className={labelClass}>Anything else? <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea id="notes" rows={2} placeholder="Anything you'd like us to know"
                value={details.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3.5 text-base font-medium text-gray-700 hover:bg-gray-200">
                <ArrowLeft className="h-5 w-5" /> Back
              </button>
              <button type="button" onClick={() => setStep(3)} disabled={!detailsOk}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                Review <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* ---- 3. Confirm ---- */}
        {step === 3 && picked && pickedParts && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Looks good?</h2>
              <p className="mt-1 text-sm text-gray-500">{promise}</p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-lg shadow-blue-500/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Your appointment</p>
              <p className="mt-1 text-xl font-bold">{formatDay(pickedParts.date)}</p>
              <p className="text-lg font-semibold">{formatBlock(pickedParts.time)}</p>
              <button type="button" onClick={() => { setReturnToReview(true); setStep(1) }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25">
                <Pencil className="h-3.5 w-3.5" /> Change time
              </button>
            </div>

            <dl className="divide-y divide-gray-100 rounded-2xl border border-gray-100 text-sm">
              <Row label="Name" value={details.name.trim()} onChange={() => changeField('name')} />
              <Row label="WhatsApp" value={details.phone.trim()} onChange={() => changeField('phone')} />
              <Row label="Date of birth" value={details.dateOfBirth} onChange={() => changeField('dob')} />
              <Row label="Address" value={details.address.trim()} onChange={() => changeField('address')} />
              <Row label="Reason" value={details.reason} onChange={() => changeField('reason')} />
              <Row label="Medical alerts" value={details.medicalAlerts.trim() || 'None'} onChange={() => changeField('alerts')} />
              {details.heardFrom && <Row label="Heard about us" value={details.heardFrom} onChange={() => changeField('heard')} />}
              {details.notes.trim() && <Row label="Note" value={details.notes.trim()} onChange={() => changeField('notes')} />}
            </dl>

            <button ref={sendRef} type="button" onClick={submit} disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white shadow-lg shadow-green-600/30 hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 disabled:opacity-60">
              <MessageCircle className="h-6 w-6" />
              {pending ? 'Sending…' : 'Confirm and send on WhatsApp'}
            </button>
            <p className="text-center text-xs text-gray-500">
              WhatsApp opens with your message ready. Just press Send there.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-gray-500">{label}</dt>
        <dd className="mt-0.5 break-words font-medium text-gray-900">{value}</dd>
      </div>
      <button type="button" onClick={onChange} className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
        Edit
      </button>
    </div>
  )
}
