import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayInIndia } from '@/lib/dates'
import { blockInstant, inIndia } from '@/lib/schedule'
import { pickSuggestedTime, suggestedDate } from '@/lib/next-visit'
import { getDaySchedule } from './appointments'

// The suggested next visit, worked out only when the visit page asks for it: the same weekday
// a week on, at today's appointment time when that is free (else the first free time).
// Null when the patient already has an appointment coming up, or that day is full or closed.
export async function getNextVisitSuggestion(visitId: string): Promise<string | null> {
  await getDoctor()
  const supabase = await createClient()
  const { data: visit } = await supabase.from('visits').select('id, patient_id, visit_date').eq('id', visitId).maybeSingle()
  if (!visit) return null

  const [linked, upcoming] = await Promise.all([
    supabase.from('appointments').select('id, starts_at').eq('visit_id', visitId).maybeSingle(),
    supabase
      .from('appointments')
      .select('id')
      .eq('patient_id', visit.patient_id)
      .eq('status', 'booked')
      .gt('starts_at', new Date().toISOString())
      .limit(2),
  ])
  // Same rule as the visit page: today's own appointment doesn't count as "coming up"
  if ((upcoming.data ?? []).some((a) => a.id !== linked.data?.id)) return null

  const today = todayInIndia()
  const date = suggestedDate(visit.visit_date > today ? visit.visit_date : today)
  const schedule = await getDaySchedule(date)
  if (schedule.closed || schedule.dayOff) return null

  const free = schedule.blocks.filter((b) => b.state === 'free').map((b) => b.time)
  const usual = linked.data ? inIndia(linked.data.starts_at).time : null
  const time = pickSuggestedTime(usual, free)
  return time ? blockInstant(date, time) : null
}
