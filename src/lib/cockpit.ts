import { inIndia, toMinutes } from '@/lib/schedule'

// The Cockpit's day strip runs from 8:30 AM to 7:50 PM (the last appointment may end then), with lunch
// from 1:10 to 2:30 PM
const DAY_START = toMinutes('08:30')
const DAY_END = toMinutes('19:50')
const span = DAY_END - DAY_START

// How far through the day a moment sits, in % of the strip (clamped to its ends)
export function dayPosition(iso: string | Date): number {
  const minutes = toMinutes(inIndia(iso).time)
  return Math.min(100, Math.max(0, ((minutes - DAY_START) / span) * 100))
}

export const LUNCH_SPAN = {
  left: ((toMinutes('13:10') - DAY_START) / span) * 100,
  width: ((toMinutes('14:30') - toMinutes('13:10')) / span) * 100,
}

export type StripBlock = { left: number; width: number; state: 'done' | 'now' | 'booked' }

// One appointment on the strip: over, under way, or still to come
export function stripBlock(startsAt: string, minutes: number, now: Date): StripBlock {
  const start = new Date(startsAt).getTime()
  const end = start + minutes * 60_000
  const state = end <= now.getTime() ? 'done' : start <= now.getTime() ? 'now' : 'booked'
  const left = dayPosition(startsAt)
  return { left, width: Math.min(Math.max((minutes / span) * 100, 1.5), 100 - left), state }
}

// The seen ring's dash: the part of the circle done, then the whole circle
export function ringDash(done: number, total: number, circumference: number): string {
  const part = total > 0 ? Math.min(1, done / total) : 0
  return `${(part * circumference).toFixed(1)} ${circumference.toFixed(1)}`
}

// The next patient: the first booked appointment that isn't over yet
export function nextAppointment<T extends { starts_at: string; duration_min: number }>(booked: T[], now: Date): T | null {
  return [...booked]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .find((a) => new Date(a.starts_at).getTime() + a.duration_min * 60_000 > now.getTime()) ?? null
}
