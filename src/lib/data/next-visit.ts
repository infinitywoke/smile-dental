import 'server-only'
import { getDoctor } from '@/lib/auth'
import { todayInIndia } from '@/lib/dates'
import { blockInstant, inIndia } from '@/lib/schedule'
import { pickSuggestedTime, suggestedDate } from '@/lib/next-visit'
import { getDaySchedule } from './appointments'
import type { VisitDetail } from './types'

// The proposed next visit for the Send step: the same weekday a week on, at today's appointment time
// when that is free (else the first free time). Null when the patient already has one coming up,
// or that day is full.
export async function getNextVisitSuggestion(visit: VisitDetail): Promise<string | null> {
  await getDoctor()
  if (visit.next_appointment) return null

  const today = todayInIndia()
  const date = suggestedDate(visit.visit_date > today ? visit.visit_date : today)
  const schedule = await getDaySchedule(date)
  if (schedule.closed || schedule.dayOff) return null

  const free = schedule.blocks.filter((b) => b.state === 'free').map((b) => b.time)
  const usual = visit.linked_appointment ? inIndia(visit.linked_appointment.starts_at).time : null
  const time = pickSuggestedTime(usual, free)
  return time ? blockInstant(date, time) : null
}
