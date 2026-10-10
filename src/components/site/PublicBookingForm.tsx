'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, ArrowRight, CalendarCheck, Clock, MessageCircle, Phone } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { submitBookingRequest } from '@/lib/actions/booking'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { bookingRequestMessage, clinicWhatsappLink } from '@/lib/whatsapp'

// Same options the clinic app offers when a new patient walks in
const HEARD_FROM = ['Friend / family', 'Google', 'Website', 'Walked past', 'Instagram', 'Doctor referral']
const REASONS = ['Check-up / cleaning', 'Tooth pain', 'Consultation', 'Other']

const inputClass =
  'block w-full rounded-lg border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
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

export function PublicBookingForm({ slots, promise, today, initialReason = '' }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [details, setDetails] = useState<Details>({
    phone: '', name: '', dateOfBirth: '', address: '', medicalAlerts: '', heardFrom: '', reason: initialReason.slice(0, 100), notes: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [sentId, setSentId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
  const activeDay = pickedDay && days.has(pickedDay) ? pickedDay : null
  const set = (patch: Partial<Details>) => setDetails((d) => ({ ...d, ...patch }))

  const phoneOk = isValidPhone(normalizePhone(details.phone))
  const detailsOk = phoneOk && details.name.trim().length >= 2 && !!details.dateOfBirth && details.address.trim().length > 0 && !!details.reason
  const callHref = `tel:${siteConfig.phone.replace(/[^\d+]/g, '')}`

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
        setSentId(result.id)
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

  // ---- After saving: one tap sends the WhatsApp message that alerts the clinic ----
  if (sentId && picked) {
    const link = `${window.location.origin}/app/requests/${sentId}`
    const message = bookingRequestMessage({
      name: details.name.trim(),
      phone: normalizePhone(details.phone) ?? details.phone,
      startsAt: picked,
      reason: details.reason,
      link,
    })
    const { date, time } = inIndia(picked)
    return (
      <div className="mx-auto mt-10 max-w-md space-y-5 rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-gray-100 sm:p-8">
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
          <p className="font-semibold">One last step: tap the button below, then press Send in WhatsApp.</p>
          <p className="mt-1">This is how the clinic gets alerted.</p>
        </div>
        <a href={clinicWhatsappLink(message)} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white shadow-sm hover:bg-green-700">
          <MessageCircle className="h-6 w-6" />
          Send on WhatsApp
        </a>
        <p className="text-sm text-gray-600">{promise}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-10 max-w-md overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-100">
      <div className="h-1.5 w-full bg-gray-100">
        <div className="h-1.5 bg-blue-600 transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      <div className="p-6 sm:p-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Pick a time</h2>
              <p className="mt-2 text-gray-500">Each visit is a 40-minute slot.</p>
            </div>

            {dayKeys.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-5 text-center text-gray-700">
                <p className="font-semibold">No online times are free right now.</p>
                <a href={callHref} className="mt-3 inline-flex items-center gap-2 font-bold text-blue-700">
                  <Phone className="h-4 w-4" /> Call {siteConfig.phone}
                </a>
              </div>
            ) : (
              <>
                <div>
                  <p className={labelClass}>Day</p>
                  <div className="-mx-6 flex snap-x gap-2 overflow-x-auto px-6 pb-2 sm:-mx-8 sm:px-8">
                    {dayKeys.map((day) => (
                      <button key={day} type="button"
                        onClick={() => { setPickedDay(day); setPicked(null) }}
                        className={`shrink-0 snap-start rounded-xl px-3 py-2 text-center text-sm font-semibold ring-1 ring-inset ${
                          activeDay === day ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300 hover:ring-blue-400'
                        }`}>
                        <span className="block text-xs font-medium opacity-80">{formatDay(day).split(',')[0]}</span>
                        <span className="block">{formatDay(day).split(', ')[1]}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Closed on Fridays.</p>
                </div>

                {activeDay && (
                  <div>
                    <p className={labelClass}>Time</p>
                    <div className="grid grid-cols-3 gap-2">
                      {days.get(activeDay)!.map((slot) => {
                        const label = formatBlock(inIndia(slot).time)
                        return (
                          <button key={slot} type="button" onClick={() => setPicked(slot)}
                            className={`rounded-lg px-1 py-2.5 text-sm font-semibold ring-1 ring-inset ${
                              picked === slot ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300 hover:ring-blue-400'
                            }`}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <p>
                Need a time after <b>7 PM</b> (open until 9 PM)?{' '}
                <a href={callHref} className="font-bold text-blue-700">Please call {siteConfig.phone}</a> to book.
              </p>
            </div>

            <button type="button" onClick={() => setStep(2)} disabled={!picked}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3.5 text-base font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              Continue <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Your details</h2>
              <p className="mt-2 text-gray-500">So the clinic can prepare for you.</p>
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
              <p className={labelClass}>Reason for visit</p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((option) => (
                  <button key={option} type="button" onClick={() => set({ reason: details.reason === option ? '' : option })}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                      details.reason === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
                    }`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="alerts" className={labelClass}>Medical alerts <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea id="alerts" rows={2} placeholder="Allergies, diabetes, BP, blood thinners… Leave empty if none."
                value={details.medicalAlerts} onChange={(e) => set({ medicalAlerts: e.target.value })} className={inputClass} />
            </div>

            <div>
              <p className={labelClass}>How did you hear about us? <span className="font-normal text-gray-400">(optional)</span></p>
              <div className="flex flex-wrap gap-2">
                {HEARD_FROM.map((option) => (
                  <button key={option} type="button" onClick={() => set({ heardFrom: details.heardFrom === option ? '' : option })}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
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
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-3.5 text-base font-medium text-gray-700 hover:bg-gray-200">
                <ArrowLeft className="h-5 w-5" /> Back
              </button>
              <button type="button" onClick={() => setStep(3)} disabled={!detailsOk}
                className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3.5 text-base font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                Review <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && picked && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">Check and send</h2>
              <p className="mt-2 text-gray-500">{promise}</p>
            </div>

            <dl className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-5 text-sm">
              <Row label="When" value={`${formatDay(inIndia(picked).date)}, ${formatBlock(inIndia(picked).time)}`} />
              <Row label="Name" value={details.name.trim()} />
              <Row label="WhatsApp" value={details.phone.trim()} />
              <Row label="Date of birth" value={details.dateOfBirth} />
              <Row label="Address" value={details.address.trim()} />
              <Row label="Reason" value={details.reason} />
              <Row label="Medical alerts" value={details.medicalAlerts.trim() || 'None'} />
              {details.heardFrom && <Row label="Heard about us" value={details.heardFrom} />}
              {details.notes.trim() && <Row label="Note" value={details.notes.trim()} />}
            </dl>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(2)} disabled={pending}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-3.5 text-base font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                <ArrowLeft className="h-5 w-5" /> Edit
              </button>
              <button type="button" onClick={submit} disabled={pending}
                className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-60">
                {pending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 last:border-0 last:pb-0">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  )
}
