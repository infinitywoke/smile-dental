'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, CalendarCheck, CalendarDays, Clock, MessageCircle, Phone, Sun, Sunrise, Sunset,
} from 'lucide-react'
import { siteConfig } from '@/config/site'
import { submitBookingRequest } from '@/lib/actions/booking'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { addDays, formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { bookingRequestMessage, clinicWhatsappLink } from '@/lib/whatsapp'
import { SOURCE_KEY } from './SourceTracker'
import { type Gender } from '@/lib/gender'
import { GenderChoice } from '@/components/GenderChoice'

// Same options the clinic app offers when a new patient walks in
const HEARD_FROM = ['Friend / family', 'Google', 'Website', 'Walked past', 'Instagram', 'Doctor referral']
const REASONS = ['Check-up / cleaning', 'Tooth pain', 'Consultation', 'Other']

const inputClass =
  'block w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'mb-1.5 block text-sm font-semibold text-gray-700'

type Details = {
  phone: string
  name: string
  gender: Gender | ''
  age: string
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
  // Today in India, for the day labels
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
  const firstRender = useRef(true)

  const [step, setStep] = useState<1 | 2>(1)
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [details, setDetails] = useState<Details>({
    phone: '', name: '', gender: '', age: '', address: '', medicalAlerts: '', heardFrom: '', reason: initialReason.slice(0, 100), notes: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ url: string } | null>(null)
  // "Google", "Instagram"... worked out from the link the visitor came from (see SourceTracker)
  const [guessed, setGuessed] = useState('')
  const [pending, startTransition] = useTransition()
  // Set when Send was tapped with something missing
  const [tried, setTried] = useState(false)

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

  // Back on the details step returns to the times (everything typed is kept)
  useEffect(() => {
    if (step !== 2) return
    const onBack = () => setStep(1)
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [step])

  // Each new step comes into view with its next action ready: the first field to fill
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const timer = setTimeout(() => {
      if (step === 2) document.getElementById('phone')?.focus({ preventScroll: true })
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
  // The first required answer still missing, in the order of the form
  const missing = !phoneOk
    ? { id: 'phone', text: 'Please enter your WhatsApp number' }
    : details.name.trim().length < 2
      ? { id: 'name', text: 'Please enter your name' }
      : !details.gender
        ? { id: 'gender', text: 'Please choose female, male or other' }
        : !details.reason
          ? { id: 'reason', text: 'Please choose a reason' }
          : null
  const callHref = `tel:${siteConfig.phone.replace(/[^\d+]/g, '')}`

  function chooseTime(slot: string) {
    setPicked(slot)
    setError(null)
    // A moment to see the choice highlighted, then straight on
    setTimeout(() => {
      // One history entry for the details step, so Back returns to the times
      if (window.history.state?.bookingStep !== 2) window.history.pushState({ ...window.history.state, bookingStep: 2 }, '')
      setStep(2)
    }, 220)
  }

  function submit() {
    if (!picked) return
    if (missing) {
      setTried(true)
      const el = document.getElementById(missing.id)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitBookingRequest({
        name: details.name,
        phone: details.phone,
        age: details.age,
        gender: details.gender,
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
        window.history.back()
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
  const stepTitles = ['Choose a time', 'Your details']

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
                <a href={callHref} className="mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-bold text-blue-700 ring-1 ring-inset ring-blue-300">
                  <Phone className="h-4 w-4" /> Call the clinic
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
                        className={`min-h-12 w-24 shrink-0 snap-start rounded-2xl px-2 py-3 text-center transition ${
                          active
                            ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30'
                            : 'bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200 hover:ring-blue-300'
                        }`}>
                        <span className={`block text-xs font-semibold uppercase ${active ? 'text-blue-100' : 'text-gray-500'}`}>
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
                                  className={`min-h-12 rounded-xl py-3 text-sm font-semibold transition active:scale-95 ${
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
                Closed on Fridays. Need a time after <b>7 PM</b>, or don&apos;t see one that suits you? Please call the clinic on {siteConfig.phone}.
              </p>
            </div>
            <a href={callHref} className="flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-bold text-blue-700 ring-1 ring-inset ring-blue-300">
              <Phone className="h-4 w-4" /> Call the clinic
            </a>
          </div>
        )}

        {/* ---- 2. Details ---- */}
        {step === 2 && (
          <div className="space-y-5">
            {pickedParts && (
              <button type="button" onClick={() => window.history.back()}
                className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-left ring-1 ring-blue-100">
                <CalendarDays className="h-5 w-5 shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1 text-sm font-semibold text-blue-900">
                  {formatDay(pickedParts.date)}, {formatBlock(pickedParts.time)}
                </span>
                <span className="text-sm font-semibold text-blue-700">Change</span>
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
              <p id="gender" tabIndex={-1} className={`${labelClass} outline-none`}>Gender</p>
              <GenderChoice value={details.gender} onChange={(gender) => set({ gender })} />
            </div>

            <div>
              <p id="reason" tabIndex={-1} className={`${labelClass} outline-none`}>Reason for visit</p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((option) => (
                  <button key={option} type="button" onClick={() => set({ reason: details.reason === option ? '' : option })}
                    className={`min-h-12 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset ${
                      details.reason === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
                    }`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <p className="border-t border-gray-100 pt-5 text-sm font-bold uppercase tracking-wide text-gray-500">Optional</p>

            <div>
              <label htmlFor="age" className={labelClass}>Age <span className="font-normal text-gray-400">(optional)</span></label>
              <input id="age" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="35"
                value={details.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, '') })} className={inputClass} />
            </div>

            <div>
              <label htmlFor="address" className={labelClass}>Address <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea id="address" rows={2} autoComplete="street-address" placeholder="Pangala, Udupi"
                value={details.address} onChange={(e) => set({ address: e.target.value })} className={inputClass} />
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
                    className={`min-h-12 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset ${
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

            <p className="text-sm text-gray-600">{promise}</p>

            {tried && missing && (
              <p className="text-sm font-semibold text-red-700" role="alert">{missing.text}</p>
            )}
            <button type="button" onClick={submit} disabled={pending}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white shadow-lg shadow-green-600/30 hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 disabled:opacity-50">
              <MessageCircle className="h-6 w-6" />
              {pending ? 'Sending…' : 'Send on WhatsApp'}
            </button>
            <p className="text-center text-xs text-gray-500">
              WhatsApp opens with your message ready. Just press Send there.
            </p>
            <button type="button" onClick={() => window.history.back()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 text-base font-medium text-gray-700 hover:bg-gray-200">
              <ArrowLeft className="h-5 w-5" /> Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
