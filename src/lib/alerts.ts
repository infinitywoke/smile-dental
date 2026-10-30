import { pauseText } from '@/lib/booking-pause'
import { formatDate } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { requestNotice } from '@/lib/request-hold'
import { formatWhen, inIndia } from '@/lib/schedule'
import { expiresSoon, isLow, qtyWithUnit, type StockLevel } from '@/lib/stock'

// Everything that needs the dentist, in one list: the Alerts screen, and the number on the bottom bar's
// Alerts button. Each alert says in a line what happened, names what to do, and leads to where it is done.
// Worked out from the clinic's data each time, so an alert goes as soon as it is dealt with.

export type AlertKind = 'request' | 'resend' | 'missed' | 'reminders' | 'stock' | 'due' | 'recalls' | 'paused'

export type Alert = {
  key: string
  kind: AlertKind
  // What happened, in a few words
  title: string
  // A line more: when, how much, who
  detail: string
  // What to do (the button's words)
  action: string
  // Where it is done
  href: string
  // Needs a decision now: counted on the Alerts button
  now: boolean
}

export type AlertData = {
  today: string
  now: number
  requests: { id: string; name: string; requested_start: string | null; reason: string | null; created_at: string; received_at: string | null }[]
  resend: { id: string; visit_date: string; patient: { name: string } }[]
  missed: { id: string; starts_at: string; patient: { name: string } }[]
  reminders: { date: string; tomorrow: boolean; items: { reminded: boolean; patient: { name: string; phone: string | null } }[] } | null
  stock: StockLevel[]
  dues: { patientName: string; amount: number; visitId: string }[]
  recalls: { name: string }[]
  pausedUntil: string | null
}

// Each one owing is an alert of its own up to here; the rest are one, leading to Practice
export const DUES_LISTED = 5

// "just now", "5 min ago", "2 h ago", "yesterday", "3 days ago"
export function ago(moment: string, now: number): string {
  const minutes = Math.floor((now - new Date(moment).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

// "Asha Rao, Ravi Kumar and 3 more"
const names = (list: string[], shown = 3) =>
  list.length <= shown ? list.join(', ') : `${list.slice(0, shown).join(', ')} and ${list.length - shown} more`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const shortDate = (date: string) => formatDate(date, { day: 'numeric', month: 'short' })

export function buildAlerts(data: AlertData): Alert[] {
  const { today, now } = data
  const alerts: Alert[] = []

  // A patient waiting to hear back, the longest-waiting first: book the time (or another) on its screen
  for (const r of data.requests) {
    const notice = requestNotice(r.requested_start, r.created_at, r.received_at, now)
    const wanted = r.requested_start ? inIndia(r.requested_start) : null
    alerts.push({
      key: `request-${r.id}`,
      kind: 'request',
      title: `Booking request: ${r.name}`,
      detail: [
        r.requested_start ? `Wants ${formatWhen(r.requested_start)}` : notice?.stale ? null : 'No time chosen',
        r.reason,
        notice?.stale ? notice.text : `asked ${ago(r.created_at, now)}`,
      ].filter(Boolean).join(' · '),
      action: 'Book a time',
      href: `/app/requests/${r.id}${wanted ? `?d=${wanted.date >= today ? wanted.date : today}` : ''}`,
      now: true,
    })
  }

  // The bill changed after the WhatsApp went: the patient has an old one
  for (const v of data.resend) {
    alerts.push({
      key: `resend-${v.id}`,
      kind: 'resend',
      title: `Bill changed after sending: ${v.patient.name}`,
      detail: `Visit on ${shortDate(v.visit_date)}. Send the new bill on WhatsApp.`,
      action: 'Send new bill',
      href: `/app/visits/${v.id}`,
      now: true,
    })
  }

  // Didn't come: Today's list has the message to send (and marks it followed up)
  for (const m of data.missed) {
    alerts.push({
      key: `missed-${m.id}`,
      kind: 'missed',
      title: `${m.patient.name} didn't come`,
      detail: `Booked ${formatWhen(m.starts_at)}. Message them to book again.`,
      action: 'Follow up',
      href: '/app#needs-you',
      now: true,
    })
  }

  // The next open day's patients not reminded yet (with a WhatsApp number): all sent from Today
  const toRemind = (data.reminders?.items ?? []).filter((r) => !r.reminded && r.patient.phone)
  if (data.reminders && toRemind.length > 0) {
    const day = data.reminders.tomorrow ? 'tomorrow' : formatDate(data.reminders.date, { weekday: 'long' })
    alerts.push({
      key: `reminders-${data.reminders.date}`,
      kind: 'reminders',
      title: `Remind ${plural(toRemind.length, 'patient', 'patients')} about ${day}`,
      detail: names(toRemind.map((r) => r.patient.name)),
      action: 'Send',
      href: '/app#to-send',
      now: true,
    })
  }

  // Stock: low first, then what expires soon (one alert an item)
  const stock = data.stock
    .map((s) => ({ s, low: isLow(s), expiring: expiresSoon(s.next_expiry, today) }))
    .filter((x) => x.low || x.expiring)
    .sort((a, b) => Number(b.low) - Number(a.low) || a.s.name.localeCompare(b.s.name))
  for (const { s, low, expiring } of stock) {
    const expires = expiring ? `expires ${shortDate(s.next_expiry!)}` : ''
    alerts.push({
      key: `stock-${s.item_id}`,
      kind: 'stock',
      title: low ? `${s.name} is running low${expiring ? ` and ${expires}` : ''}` : `${s.name} ${expires}`,
      detail: `${qtyWithUnit(s.on_hand, s.unit)} ${low ? 'left' : 'in stock'}`,
      action: low ? 'Restock' : 'Check',
      href: `/app/stock/${s.item_id}`,
      now: false,
    })
  }

  // Money owed: each patient's bill, the largest first; past a few, the rest together on Practice
  const dues = [...data.dues].sort((a, b) => b.amount - a.amount)
  for (const d of dues.slice(0, DUES_LISTED)) {
    alerts.push({
      key: `due-${d.visitId}`,
      kind: 'due',
      title: `${d.patientName} owes ${formatRupees(d.amount)}`,
      detail: 'Take the payment on the bill.',
      action: 'Collect',
      href: `/app/visits/${d.visitId}?step=bill`,
      now: false,
    })
  }
  const rest = dues.slice(DUES_LISTED)
  if (rest.length > 0) {
    alerts.push({
      key: 'dues-rest',
      kind: 'due',
      title: `${plural(rest.length, 'more patient owes', 'more patients owe')} ${formatRupees(rest.reduce((total, d) => total + d.amount, 0))}`,
      detail: 'Everyone who owes is on Practice.',
      action: 'See all',
      href: '/app/insights',
      now: false,
    })
  }

  // Due a check-up: the reminders are sent from Today
  if (data.recalls.length > 0) {
    alerts.push({
      key: 'recalls',
      kind: 'recalls',
      title: `${plural(data.recalls.length, 'patient is', 'patients are')} due a check-up`,
      detail: names(data.recalls.map((r) => r.name)),
      action: 'Send',
      href: '/app#to-send',
      now: false,
    })
  }

  // The website takes no bookings: turned back on from Today's status
  if (data.pausedUntil !== null) {
    alerts.push({
      key: 'paused',
      kind: 'paused',
      title: 'Online booking is paused',
      detail: `${pauseText(data.pausedUntil, new Date(now))}.`,
      action: 'Change',
      href: '/app',
      now: false,
    })
  }

  return alerts
}
