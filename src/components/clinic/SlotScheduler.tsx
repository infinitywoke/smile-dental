'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, CalendarCheck, ChevronLeft, ChevronRight, GripVertical, MessageCircle, UserCheck } from 'lucide-react'
import { confirmBookingRequest, declineBookingRequest, moveAppointment } from '@/lib/actions/appointments'
import { addDays, formatBlock, formatDay, inIndia } from '@/lib/schedule'
import type { DayBlock } from '@/lib/data/appointments'
import { SlotGrid, isPlaceable } from './SlotGrid'

type Props = {
  mode: 'request' | 'move'
  // The booking request, or the appointment being moved
  id: string
  // Name shown on the chip you slide into a block
  label: string
  date: string
  blocks: DayBlock[]
  closed: boolean
  dayOff: boolean
  // Where the patient asked to be (request mode) or already is (move mode)
  originalInstant: string | null
  // Page this screen lives on, for the day arrows (plus any fixed query like "move=1")
  basePath: string
  query?: string
  // Patients in the app who share the request's phone number
  matches?: { id: string; name: string; age: number | null }[]
}

type Done = { whatsappUrl?: string; patientId?: string; when: string }

// Shows a day's blocks. The doctor slides the patient's name into a free block (or taps one) and saves.
export function SlotScheduler({ mode, id, label, date, blocks, closed, dayOff, originalInstant, basePath, query, matches = [] }: Props) {
  const [selected, setSelected] = useState<string | null>(() => {
    if (!originalInstant) return null
    const own = blocks.find((b) => b.instant === originalInstant)
    return own && isPlaceable(own, id) ? own.instant : null
  })
  const [linkPatient, setLinkPatient] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [pending, startTransition] = useTransition()
  const [drag, setDrag] = useState<{ x: number; y: number; over: string | null } | null>(null)
  const pointerY = useRef(0)

  // While dragging near the top or bottom edge, keep scrolling so far blocks stay reachable
  useEffect(() => {
    if (!drag) return
    const timer = setInterval(() => {
      if (pointerY.current < 110) window.scrollBy(0, -16)
      else if (pointerY.current > window.innerHeight - 130) window.scrollBy(0, 16)
    }, 30)
    return () => clearInterval(timer)
  }, [drag])

  const dayHref = (d: string) => `${basePath}?${query ? `${query}&` : ''}d=${d}`
  const blockAt = (instant: string | null) => blocks.find((b) => b.instant === instant)

  function overBlock(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]')
    const instant = el?.dataset.slot ?? null
    const block = blockAt(instant)
    return block && isPlaceable(block, id) ? instant : null
  }

  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerY.current = e.clientY
    setDrag({ x: e.clientX, y: e.clientY, over: null })
  }
  function moveDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    pointerY.current = e.clientY
    setDrag({ x: e.clientX, y: e.clientY, over: overBlock(e.clientX, e.clientY) })
  }
  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return
    const target = overBlock(e.clientX, e.clientY)
    if (target) setSelected(target)
    setDrag(null)
  }

  function save() {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const result =
        mode === 'request'
          ? await confirmBookingRequest(id, selected, linkPatient)
          : await moveAppointment(id, selected)
      if (result.error) {
        setError(result.error)
        return
      }
      const { date: d, time } = inIndia(selected)
      setDone({ whatsappUrl: result.whatsappUrl, patientId: result.patientId, when: `${formatDay(d)}, ${formatBlock(time)}` })
      // Open the patient's chat with the confirmation ready; the doctor taps Send
      if (result.whatsappUrl) window.location.assign(result.whatsappUrl)
    })
  }

  function decline() {
    if (!window.confirm(`Decline ${label}'s request? You can send them a message to call the clinic.`)) return
    setError(null)
    startTransition(async () => {
      const result = await declineBookingRequest(id)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone({ whatsappUrl: result.whatsappUrl, when: 'Declined' })
      if (result.whatsappUrl) window.location.assign(result.whatsappUrl)
    })
  }

  if (done) {
    return (
      <div className="space-y-4 rounded-2xl bg-green-50 p-5 text-center ring-1 ring-green-200">
        <CalendarCheck className="mx-auto h-10 w-10 text-green-600" />
        <h2 className="text-xl font-bold text-gray-900">{done.when === 'Declined' ? 'Request declined' : 'Booked'}</h2>
        {done.when !== 'Declined' && (
          <p className="text-gray-700">{label} · {done.when}</p>
        )}
        {done.whatsappUrl && (
          <a href={done.whatsappUrl}
            className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white">
            <MessageCircle className="h-6 w-6" />
            {done.when === 'Declined' ? 'Send message on WhatsApp' : 'Send confirmation on WhatsApp'}
          </a>
        )}
        <div className="flex justify-center gap-4 text-sm font-semibold text-blue-700">
          {done.patientId && <Link href={`/app/patients/${done.patientId}`}>Open patient</Link>}
          <Link href="/app">Back to Today</Link>
        </div>
      </div>
    )
  }

  const selectedBlock = blockAt(selected)
  
  return (
    <div className="space-y-4">
      {/* Day navigation */}
      <div className="flex items-center justify-between">
        <Link href={dayHref(addDays(date, -1))} className="rounded-full p-2 text-blue-700 hover:bg-blue-50" aria-label="Previous day">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="text-center">
          <p className="text-base font-bold text-gray-900">{formatDay(date)}</p>
          {originalInstant && inIndia(originalInstant).date === date && (
            <p className="text-xs font-semibold text-amber-700">
              {mode === 'request' ? 'Day requested' : 'Current day'}
            </p>
          )}
        </div>
        <Link href={dayHref(addDays(date, 1))} className="rounded-full p-2 text-blue-700 hover:bg-blue-50" aria-label="Next day">
          <ChevronRight className="h-6 w-6" />
        </Link>
      </div>

      {/* Existing patients with this number */}
      {mode === 'request' && matches.length > 0 && (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-900">Already a patient with this number?</p>
          {matches.map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200">
              <input type="radio" name="link" checked={linkPatient === m.id} onChange={() => setLinkPatient(m.id)} />
              <UserCheck className="h-4 w-4 text-amber-700" />
              <span className="font-medium text-gray-900">{m.name}</span>
              {m.age !== null && <span className="text-gray-500">· {m.age} yrs</span>}
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-200">
            <input type="radio" name="link" checked={linkPatient === null} onChange={() => setLinkPatient(null)} />
            <span className="font-medium text-gray-900">New patient: {label}</span>
          </label>
        </div>
      )}

      {/* The chip to slide into a block */}
      <div className="sticky top-14 z-30 -mx-4 bg-gray-50/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <button type="button"
            onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}
            style={{ touchAction: 'none' }}
            aria-label={`Drag ${label} into a free block`}
            className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-md active:cursor-grabbing">
            <GripVertical className="h-5 w-5 shrink-0 opacity-70" />
            <span className="truncate">{label}</span>
          </button>
          <p className="w-28 shrink-0 text-xs text-gray-500">
            {selectedBlock ? <>Placed at <b className="text-gray-900">{formatBlock(selectedBlock.time)}</b></> : 'Slide the name into a free block, or tap one'}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {closed ? (
        <p className="rounded-xl bg-gray-100 p-4 text-center text-sm font-medium text-gray-600">The clinic is closed on Fridays. Try another day.</p>
      ) : (
        <div className="space-y-4">
          {dayOff && <p className="rounded-xl bg-gray-100 p-3 text-center text-sm font-medium text-gray-600">This day is blocked off in your calendar.</p>}
          <SlotGrid blocks={blocks} selected={selected} over={drag?.over ?? null} label={label} onPick={setSelected} ownId={id} />
        </div>
      )}

      <div className="sticky bottom-20 z-30 space-y-2 pb-1">
        <button type="button" onClick={save} disabled={!selected || pending}
          className="w-full rounded-full bg-blue-600 px-5 py-4 text-lg font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50">
          {pending ? 'Saving…' : mode === 'request' ? 'Save and confirm' : 'Move appointment'}
        </button>
        {mode === 'request' && (
          <button type="button" onClick={decline} disabled={pending}
            className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
            Can’t fit this time: decline
          </button>
        )}
      </div>

      {/* The chip follows the finger while dragging */}
      {drag && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-700 px-4 py-3 text-base font-semibold text-white shadow-xl"
          style={{ left: drag.x, top: drag.y - 36 }}>
          {label}
        </div>
      )}
    </div>
  )
}
