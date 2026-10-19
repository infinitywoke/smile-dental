'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Check, MessageCircle, Phone, Stethoscope, UserX } from 'lucide-react'
import { markNoShow, setFollowedUp, setRecalled, setReminded, undoNoShow } from '@/lib/actions/follow-ups'
import { formatDate } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { firstName } from '@/lib/whatsapp'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { markSent } from '@/lib/mark-sent'
import { useUndo } from './UndoBar'

// Today's lists that empty themselves as he taps. A WhatsApp tap counts as done (the message is in
// front of him to send); each tap can be undone from the bar at the bottom.

const whenLabel = (iso: string) => {
  const { date, time } = inIndia(iso)
  return `${formatDay(date)}, ${formatBlock(time)}`
}
// The tap is saved first (briefly: Android lets a tap open WhatsApp only for a few seconds), so leaving
// the page for WhatsApp can't cut the save off
const RECORD_WAIT_MS = 1500
export function saveThenOpen(event: React.MouseEvent<HTMLAnchorElement>, href: string, save: () => Promise<unknown>) {
  event.preventDefault()
  const saved = save().catch(() => {})
  void Promise.race([saved, new Promise((resolve) => setTimeout(resolve, RECORD_WAIT_MS))]).then(() => openWhatsApp(href))
}

const waButton = 'flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-green-600 px-4 text-base font-semibold text-white hover:bg-green-700'
const plainButton = 'flex min-h-12 items-center justify-center rounded-full px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50'

// On a booked appointment whose time has passed: the patient didn't come
export function DidntComeButton({ appointmentId, name }: { appointmentId: string; name: string }) {
  const offerUndo = useUndo()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex flex-col items-end">
      <button type="button" disabled={pending}
        onClick={() => startTransition(async () => {
          setError(null)
          const result = await markNoShow(appointmentId)
          if (result.error) setError(result.error)
          else offerUndo(`${firstName(name)}: didn't come`, () => undoNoShow(appointmentId))
        })}
        aria-label={`Didn't come: ${name}`}
        className="flex min-h-12 items-center gap-1 rounded-full px-3 text-sm font-semibold text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60">
        <UserX className="h-4 w-4" /> Didn&apos;t come
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  )
}

export type ReminderItem = { id: string; startsAt: string; name: string; patientId: string; href: string | null; reminded: boolean }

// Folded to one line until opened; gone once everyone is reminded
export function RemindersCard({ dayLabel, items }: { dayLabel: string; items: ReminderItem[] }) {
  const offerUndo = useUndo()
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const isSent = (r: ReminderItem) => sent[r.id] ?? r.reminded
  const left = items.filter((r) => !isSent(r) && r.href).length
  if (left === 0 && !items.some((r) => sent[r.id])) return null

  const mark = (r: ReminderItem, value: boolean) => {
    setSent((s) => ({ ...s, [r.id]: value }))
    return value ? markSent('reminded', r.id) : setReminded(r.id, false)
  }

  return (
    <details className="rounded-2xl bg-white shadow-sm ring-1 ring-blue-200">
      <summary className="flex min-h-14 cursor-pointer items-center gap-2 px-4 text-base font-semibold text-gray-900">
        <Bell className="h-5 w-5 text-blue-700" />
        <span className="flex-1">Remind {dayLabel}&apos;s patients</span>
        <span className="text-sm font-semibold text-blue-700">{left === 0 ? 'All sent' : `${left} to send`}</span>
      </summary>
      <ul className="space-y-2 px-3 pb-3">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-xl bg-gray-50 py-1 pr-1 pl-3">
            <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatBlock(inIndia(r.startsAt).time)}</span>
            <Link href={`/app/patients/${r.patientId}`} className="min-w-0 flex-1 truncate text-base text-gray-900">{r.name}</Link>
            {!r.href ? (
              <span className="px-2 text-sm text-gray-500">No phone</span>
            ) : isSent(r) ? (
              <span className="flex min-h-12 items-center gap-1 px-3 text-sm font-semibold text-green-700"><Check className="h-4 w-4" /> Sent</span>
            ) : (
              <a href={r.href} aria-label={`Remind ${r.name} on WhatsApp`}
                onClick={(event) => {
                  offerUndo(`Reminder for ${firstName(r.name)} marked sent`, () => mark(r, false))
                  saveThenOpen(event, r.href!, () => mark(r, true))
                }}
                className={waButton}>
                <MessageCircle className="h-5 w-5" /> Remind
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

export type MissedItem = { id: string; startsAt: string; name: string; patientId: string; phone: string | null; href: string | null }

// Patients who didn't come: call, WhatsApp, or set aside. Tapping the name opens them to book again.
export function MissedList({ items }: { items: MissedItem[] }) {
  const offerUndo = useUndo()
  const [done, setDone] = useState<Record<string, boolean>>({})
  const mark = (m: MissedItem, value: boolean) => {
    setDone((d) => ({ ...d, [m.id]: value }))
    return value ? markSent('followed-up', m.id) : setFollowedUp(m.id, false)
  }
  const finish = (m: MissedItem, label: string) => {
    offerUndo(label, () => mark(m, false))
    return mark(m, true)
  }
  return (
    <>
      {items.filter((m) => !done[m.id]).map((m) => (
        <div key={m.id} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-amber-200">
          <Link href={`/app/patients/${m.patientId}`} className="block">
            <span className="block truncate text-base font-semibold text-gray-900">{m.name}</span>
            <span className="block text-sm text-amber-800">Didn&apos;t come · {whenLabel(m.startsAt)}</span>
          </Link>
          <div className="flex flex-wrap gap-2">
            {m.phone && (
              <a href={`tel:+91${m.phone}`} className={plainButton} aria-label={`Call ${m.name}`}>
                <Phone className="mr-1.5 h-4 w-4" /> Call
              </a>
            )}
            {m.href && (
              <a href={m.href} aria-label={`WhatsApp ${m.name}`}
                onClick={(event) => saveThenOpen(event, m.href!, () => finish(m, `${firstName(m.name)}: followed up`))} className={waButton}>
                <MessageCircle className="h-5 w-5" /> WhatsApp
              </a>
            )}
            <button type="button" onClick={() => void finish(m, `${firstName(m.name)}: set aside`)} className={plainButton}>Done</button>
          </div>
        </div>
      ))}
    </>
  )
}

export type RecallItem = { patientId: string; name: string; lastVisit: string; recalledAt: string | null; href: string }

// Six-month check-ups, folded to one line until opened
export function RecallCard({ items }: { items: RecallItem[] }) {
  const offerUndo = useUndo()
  const [done, setDone] = useState<Record<string, boolean>>({})
  const left = items.filter((r) => !done[r.patientId])
  if (left.length === 0) return null
  const finish = (r: RecallItem, label: string) => {
    setDone((d) => ({ ...d, [r.patientId]: true }))
    offerUndo(label, async () => {
      setDone((d) => ({ ...d, [r.patientId]: false }))
      return setRecalled(r.patientId, r.recalledAt)
    })
    return markSent('recalled', r.patientId)
  }
  return (
    <details className="rounded-2xl bg-white shadow-sm ring-1 ring-teal-200">
      <summary className="flex min-h-14 cursor-pointer items-center gap-2 px-4 text-base font-semibold text-gray-900">
        <Stethoscope className="h-5 w-5 text-teal-700" />
        <span className="flex-1">Check-ups due</span>
        <span className="text-sm font-semibold text-teal-700">{left.length}</span>
      </summary>
      <ul className="space-y-2 px-3 pb-3">
        {left.map((r) => (
          <li key={r.patientId} className="flex items-center gap-2 rounded-xl bg-gray-50 py-1 pr-1 pl-3">
            <Link href={`/app/patients/${r.patientId}`} className="min-w-0 flex-1">
              <span className="block truncate text-base text-gray-900">{r.name}</span>
              <span className="block text-xs text-gray-500">Last visit {formatDate(r.lastVisit)}</span>
            </Link>
            <button type="button" onClick={() => void finish(r, `${firstName(r.name)}: skipped`)}
              className="flex min-h-12 items-center px-3 text-sm font-semibold text-gray-600">Skip</button>
            <a href={r.href} aria-label={`Check-up reminder for ${r.name}`}
              onClick={(event) => saveThenOpen(event, r.href, () => finish(r, `Check-up reminder for ${firstName(r.name)} marked sent`))} className={waButton}>
              <MessageCircle className="h-5 w-5" /> Send
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
