import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { addDays } from '@/lib/schedule'
import { sentStreak } from '@/lib/streak'

// The Cockpit's streak: past clinic days on which every visit was finished and sent (a visit with nothing
// in it, started and then left, doesn't count)
export async function getSentStreak(today: string): Promise<number> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select('visit_date, notes, closed_at, resend_needed, visit_charges (count)')
    .gte('visit_date', addDays(today, -90))
    .lt('visit_date', today)
  if (error) return 0
  const byDay = new Map<string, boolean>()
  for (const visit of data) {
    const charges = (visit.visit_charges as unknown as { count: number }[] | null)?.[0]?.count ?? 0
    if (!visit.closed_at && !visit.notes.trim() && charges === 0) continue
    const sent = Boolean(visit.closed_at) && !visit.resend_needed
    byDay.set(visit.visit_date, (byDay.get(visit.visit_date) ?? true) && sent)
  }
  return sentStreak(byDay, today)
}
