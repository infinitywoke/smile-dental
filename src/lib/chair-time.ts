// After this long, the visit was started earlier and reopened: no ticking clock
const CHAIR_HOURS = 3

// How long the patient has been in the chair: "18:42", "1:05:09"; null once it is past CHAIR_HOURS
export function chairTime(startedAt: string, now: Date): string | null {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000))
  if (seconds >= CHAIR_HOURS * 3600) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
