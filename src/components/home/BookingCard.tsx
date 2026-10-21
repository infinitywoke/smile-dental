'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarCheck, CalendarDays, MessageCircle } from 'lucide-react'
import { bookingReasons } from '@/config/site'
import { submitBookingRequest } from '@/lib/actions/booking'
import { checkOtherDate, daysWithSlots, otherTimeMessage, partOfDay, preferredTimeOptions, slotsOn } from '@/lib/booking-days'
import { addDays, formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/phone'
import { bookingRequestMessage, clinicWhatsappLink } from '@/lib/whatsapp'
import { SOURCE_KEY } from '@/components/site/SourceTracker'
import { BOOK_EVENT, takePendingBookFor, type BookFor } from './book-events'

type Props = {
  // Free times from the clinic's calendar (ISO moments), four weeks ahead
  slots: string[]
  // Today in India
  today: string
  // "Dr. Rahil will confirm your appointment on WhatsApp in under 15 minutes."
  promise: string
}

const PARTS = ['Morning', 'Afternoon', 'Evening'] as const

// The homepage booking card: what you need, a day, a free time, a name and a WhatsApp number. The
// request is the same one the /book page sends; WhatsApp then opens with it written for the clinic.
export function BookingCard({ slots, today, promise }: Props) {
  const router = useRouter()
  const days = useMemo(() => daysWithSlots(slots, today), [slots, today])
  // What the visit is for (a reason id), and a note such as which tooth, from the tooth chart
  const [choice, setChoice] = useState<{ reason: string | null; note: string | null }>({ reason: null, note: null })
  const [day, setDay] = useState<string>(days[0]?.date ?? 'other')
  const [otherDate, setOtherDate] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [askOther, setAskOther] = useState(false)
  const [preferred, setPreferred] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [sent, setSent] = useState<{ url: string | null; at: string } | null>(null)
  // Bot traps: a hidden field, and a card answered in under a few seconds
  const [trap, setTrap] = useState('')
  const [humanPace, setHumanPace] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const timer = setTimeout(() => setHumanPace(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  // A Book link or the tooth chart picks the reason; one tapped while this card was loading counts too
  useEffect(() => {
    const apply = (detail: BookFor) => setChoice({ reason: detail.reason, note: detail.note ?? null })
    const waiting = takePendingBookFor()
    if (waiting) apply(waiting)
    const onFor = (event: Event) => {
      takePendingBookFor()
      apply((event as CustomEvent<BookFor>).detail)
    }
    window.addEventListener(BOOK_EVENT, onFor)
    return () => window.removeEventListener(BOOK_EVENT, onFor)
  }, [])

  // After fresh free times arrive, a day that is no longer listed falls back to the first one
  const activeDay = day === 'other' || days.some((d) => d.date === day) ? day : days[0]?.date ?? 'other'
  const other = activeDay === 'other' && otherDate ? checkOtherDate(otherDate, today, slots) : null
  const daySlots = activeDay === 'other' ? (other?.ok ? other.slots : []) : slotsOn(slots, activeDay)
  const chosenDate = activeDay === 'other' ? otherDate || null : activeDay
  // A full or far-off date can still be asked for on WhatsApp
  const mustAsk = days.length === 0 || (other !== null && !other.ok && (other.reason === 'beyond' || other.reason === 'full'))
  const showAsk = askOther || mustAsk
  const timeGroups = showAsk ? preferredTimeOptions(chosenDate, today, new Date()) : []

  const reasonLabel = bookingReasons.find((r) => r.id === choice.reason)?.label ?? null
  const reasonText = reasonLabel ? `${reasonLabel}${choice.note ? ` (${choice.note})` : ''}`.slice(0, 200) : ''
  const askUrl = clinicWhatsappLink(otherTimeMessage({ name, date: chosenDate, time: preferred || null, forWhat: reasonText || null }))

  const phoneOk = isValidPhone(normalizePhone(phone))
  const missing = !choice.reason
    ? { id: 'home-reason', text: 'Please choose what you need, or Not sure' }
    : !picked
      ? { id: 'home-times', text: 'Please pick a free time' }
      : !phoneOk
        ? { id: 'home-phone', text: 'Please enter your WhatsApp number' }
        : name.trim().length < 2
          ? { id: 'home-name', text: 'Please enter your name' }
          : null

  function chooseDay(value: string) {
    setDay(value)
    setPicked(null)
    setAskOther(false)
    setPreferred('')
    setError(null)
  }

  function submit(contact: 'whatsapp' | 'call') {
    if (missing) {
      setTried(true)
      const el = document.getElementById(missing.id)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus({ preventScroll: true })
      return
    }
    const startsAt = picked!
    let heardFrom = ''
    try {
      heardFrom = sessionStorage.getItem(SOURCE_KEY) ?? ''
    } catch {
      // Storage blocked: left blank
    }
    setError(null)
    startTransition(async () => {
      const result = await submitBookingRequest({
        name, phone, age: '', gender: '', address: '', medicalAlerts: '', heardFrom, reason: reasonText, notes: '',
        requestedStart: startsAt, contact, website: trap, tooFast: !humanPace,
      })
      if (!result.ok) {
        setError(result.error)
        // The time was probably taken meanwhile: fresh free times, and choose again
        if (/no longer available|available times/i.test(result.error)) {
          setPicked(null)
          router.refresh()
        }
        return
      }
      if (contact === 'call') {
        setSent({ url: null, at: startsAt })
        return
      }
      const url = clinicWhatsappLink(bookingRequestMessage({
        name: name.trim(),
        phone: normalizePhone(phone) ?? phone,
        startsAt,
        reason: reasonText,
        // Opened by Dr. Rahil from the message, this records that it arrived (the time is held from then)
        link: `${window.location.origin}/app/requests/${result.id}/received`,
      }))
      setSent({ url, at: startsAt })
      window.location.assign(url)
    })
  }

  if (sent) {
    const { date, time } = inIndia(sent.at)
    return (
      <div id="book" className="h-card" role="status">
        <CalendarCheck className="h-sent-icon" aria-hidden="true" />
        <h2 className="h-serif h-card-title">Request saved</h2>
        <p className="h-sent-text">
          {name.trim()}, we have your request for <strong>{formatDay(date)}, {formatBlock(time)}</strong>.
        </p>
        {sent.url ? (
          <>
            <p className="h-callout">WhatsApp should have opened with your request written. Just tap Send, and Dr. Rahil confirms your time on WhatsApp.</p>
            <a href={sent.url} className="h-btn navy wide"><MessageCircle className="h-icon" aria-hidden="true" /> WhatsApp didn&apos;t open? Tap here</a>
            <p className="h-hint">{promise}</p>
          </>
        ) : (
          <p className="h-callout">
            The clinic will call you on {formatPhone(normalizePhone(phone) ?? phone)} to confirm. Please keep your phone close; calls come during clinic hours.
          </p>
        )}
      </div>
    )
  }

  return (
    <div id="book" className="h-card">
      <h2 className="h-serif h-card-title">Book an appointment</h2>
      <p className="h-sub">No account needed. The clinic confirms your time on WhatsApp.</p>

      {error && (
        <div className="h-error" role="alert">
          <AlertCircle className="h-icon" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <div className="h-step" id="home-reason" tabIndex={-1}>
        <p className="h-label"><span className="h-num">1</span>What do you need?</p>
        <div role="group" aria-label="What do you need?" className="h-row">
          {bookingReasons.map((reason) => (
            <button key={reason.id} type="button" className={`h-chip${choice.reason === reason.id ? ' on' : ''}`}
              aria-pressed={choice.reason === reason.id}
              onClick={() => setChoice({ reason: reason.id, note: reason.id === choice.reason ? choice.note : null })}>
              {reason.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-step">
        <p className="h-label"><span className="h-num">2</span>Pick a day</p>
        <div role="group" aria-label="Pick a day" className="h-row">
          {days.map((d) => (
            <button key={d.date} type="button" className={`h-day${activeDay === d.date ? ' on' : ''}`}
              aria-pressed={activeDay === d.date} onClick={() => chooseDay(d.date)}>
              <span>{d.label}</span>
              <span className="h-day-sub">{d.short}</span>
            </button>
          ))}
          <button type="button" className={`h-day${activeDay === 'other' ? ' on' : ''}`}
            aria-pressed={activeDay === 'other'} onClick={() => chooseDay('other')}>
            <CalendarDays className="h-icon-sm" aria-hidden="true" />
            <span className="h-day-sub">Other date</span>
          </button>
        </div>
        {activeDay === 'other' && (
          <label className="h-field h-gap">
            Choose a date
            <input type="date" min={today} max={addDays(today, 365)} value={otherDate}
              onChange={(e) => { setOtherDate(e.target.value); setPicked(null); setPreferred('') }} />
          </label>
        )}
        {other && !other.ok && <p className="h-note">{other.message}</p>}
        {days.length === 0 && (
          <p className="h-note">No online times are free in the next four weeks. Ask for a time on WhatsApp below, or call the clinic.</p>
        )}
      </div>

      <div className="h-step" id="home-times" tabIndex={-1}>
        <p className="h-label"><span className="h-num">3</span>Pick a free time</p>
        {!askOther && PARTS.map((part) => {
          const list = daySlots.filter((slot) => partOfDay(inIndia(slot).time) === part)
          if (list.length === 0) return null
          return (
            <div key={part} className="h-part">
              <p className="h-part-name">{part}</p>
              <div role="group" aria-label={`${part} times`} className="h-row">
                {list.map((slot) => (
                  <button key={slot} type="button" className={`h-chip${picked === slot ? ' on' : ''}`}
                    aria-pressed={picked === slot} onClick={() => { setPicked(slot); setError(null) }}>
                    {formatBlock(inIndia(slot).time)}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {activeDay === 'other' && !otherDate && !askOther && <p className="h-hint">Choose a date to see its free times.</p>}
        {!mustAsk && (daySlots.length > 0 || askOther) && (
          <button type="button" className="h-linkbtn" onClick={() => { setAskOther(!askOther); setPicked(null) }}>
            {askOther ? 'Back to the free times' : 'None of these work? Ask for another time'}
          </button>
        )}
        {showAsk && (
          <div className="h-ask">
            <div className="h-ask-row">
              <label className="h-field">
                Preferred time
                <select value={preferred} onChange={(e) => setPreferred(e.target.value)}>
                  <option value="">Choose a time</option>
                  <optgroup label="Flexible">
                    <option value="any">Any time</option>
                    {timeGroups.map((group) => (
                      <option key={group.part} value={`any-${group.part.toLowerCase()}`}>Any time in the {group.part.toLowerCase()}</option>
                    ))}
                  </optgroup>
                  {timeGroups.map((group) => (
                    <optgroup key={group.part} label={group.part}>
                      {group.times.map((t) => <option key={t} value={t}>{formatBlock(t)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <a href={askUrl} className="h-btn small">Ask on WhatsApp</a>
            </div>
            <p className="h-hint">Only times the clinic is open. WhatsApp opens with your request written, and the clinic replies to confirm.</p>
          </div>
        )}
      </div>

      <div className="h-step">
        <p className="h-label"><span className="h-num">4</span>Your details</p>
        <div className="h-grid2">
          <label className="h-field">
            Name
            <input id="home-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="h-field">
            WhatsApp number
            <input id="home-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98450 21763"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="h-summary">
        <strong>{picked ? `${formatDay(inIndia(picked).date)} at ${formatBlock(inIndia(picked).time)}` : 'Pick a day and a free time'}</strong>
        <span className={`h-for${reasonText ? '' : ' quiet'}`}>{reasonText || 'Dr. Rahil Yusuf · Smile Dental Clinic, Katapadi'}</span>
      </div>

      {/* Bot trap: hidden from people (and screen readers), so only bots fill it in */}
      <div aria-hidden="true" className="h-trap">
        <label htmlFor="home-website">Leave this empty</label>
        <input id="home-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      {tried && missing && <p className="h-missing" role="alert">{missing.text}</p>}
      <button type="button" className="h-btn navy wide" onClick={() => submit('whatsapp')} disabled={pending}>
        {pending ? 'Sending…' : 'Request this appointment'}
      </button>
      <p className="h-hint">Next, WhatsApp opens with your request written: just tap Send. {promise}</p>
      <button type="button" className="h-linkbtn h-center" onClick={() => submit('call')} disabled={pending}>
        No WhatsApp? Ask the clinic to call you
      </button>
    </div>
  )
}
