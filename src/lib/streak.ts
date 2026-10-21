import { addDays } from '@/lib/schedule'

// A game touch for the Cockpit: how many clinic days in a row, up to yesterday, every visit was finished
// and sent. Days without visits (Fridays, days off, quiet days) neither count nor break the run.
export function sentStreak(allSentByDay: Map<string, boolean>, today: string, lookBack = 90): number {
  let streak = 0
  for (let i = 1; i <= lookBack; i++) {
    const sent = allSentByDay.get(addDays(today, -i))
    if (sent === undefined) continue
    if (!sent) break
    streak++
  }
  return streak
}
