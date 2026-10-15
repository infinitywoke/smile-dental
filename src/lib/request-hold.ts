// A waiting website request holds its time on the website for 24 hours (get_open_slots in
// supabase/schema.sql). Past that, or once the time itself has gone by, its card on Today says so,
// and offers Decline right there.
const HOUR = 60 * 60_000
export const HOLD_HOURS = 24

// "Time passed", "No longer held, asked 2 days ago", or null while the request is still held
export function requestNotice(requestedStart: string | null, createdAt: string, now: number): string | null {
  if (requestedStart && new Date(requestedStart).getTime() <= now) return 'Time passed'
  const age = now - new Date(createdAt).getTime()
  if (!(age > HOLD_HOURS * HOUR)) return null
  const days = Math.max(1, Math.floor(age / (24 * HOUR)))
  const ago = `${days} day${days === 1 ? '' : 's'} ago`
  return requestedStart ? `No longer held, asked ${ago}` : `Asked ${ago}`
}
