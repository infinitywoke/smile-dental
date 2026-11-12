import { siteConfig } from '@/config/site'
import { clinicOsOrigin } from './site-links'

export type OpenTimes = { slots: string[]; paused: boolean }

// This website's clinic's free times, from Clinic OS's Booking API (src/app/api/v1): the page itself is built
// ahead, so it works the same wherever the website is hosted. `fresh` skips the copy kept for half a minute (after
// a time turned out to be taken). Null when they can't be had.
export async function fetchOpenTimes(fresh = false): Promise<OpenTimes | null> {
  try {
    const response = await fetch(`${clinicOsOrigin()}/api/v1/clinics/${siteConfig.clinicSlug}/slots${fresh ? `?t=${Date.now()}` : ''}`)
    if (!response.ok) return null
    const answer = (await response.json()) as Partial<OpenTimes>
    return Array.isArray(answer.slots) ? { slots: answer.slots, paused: answer.paused === true } : null
  } catch {
    return null
  }
}
