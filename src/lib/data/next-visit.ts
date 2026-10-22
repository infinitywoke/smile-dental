import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayInIndia } from '@/lib/dates'
import { DEFAULT_LENGTH, blockInstant, inIndia } from '@/lib/schedule'
import { pickSuggestedTime, suggestedDate } from '@/lib/next-visit'
import { getDaySchedule } from './appointments'

// How many days on from the chosen day to look for a free time
const SEARCH_DAYS = 7

// The suggested next visit, worked out only when the visit page asks for it: the same weekday
// a week on (or after the gap he chose), at today's appointment time when that is free (else the
// first free time), on the next open day with room. Null when the patient already has an appointment
// coming up, or nothing is free that week.
export async function getNextVisitSuggestion(visitId: string, length: number = DEFAULT_LENGTH, days: number = 7): Promise<string | null> {
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
  const usual = linked.data ? inIndia(linked.data.starts_at).time : null
  // That day, or the next open day with a free time (looking up to a week further)
  let date = suggestedDate(visit.visit_date > today ? visit.visit_date : today, days)
  for (let tries = 0; tries < SEARCH_DAYS; tries++) {
    const schedule = await getDaySchedule(date, length)
    if (!schedule.closed && !schedule.dayOff) {
      const time = pickSuggestedTime(usual, schedule.blocks.filter((b) => b.state === 'free').map((b) => b.time))
      if (time) return blockInstant(date, time)
    }
    date = suggestedDate(date, 1)
  }
  return null
}
