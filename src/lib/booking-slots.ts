import 'server-only'
import { createPublicClient } from '@/lib/supabase/public'

// Whether a clinic's online booking is paused now (from the Cockpit). Unknown, or out of reach: not paused.
export async function bookingPaused(clinicSlug: string): Promise<boolean> {
  const { data, error } = await createPublicClient().rpc('booking_paused_until', { p_clinic: clinicSlug })
  return !error && data !== null
}

// A clinic's free times: start times only, no names. Empty for a clinic that is paused or unknown.
export async function openSlots(clinicSlug: string, from: string | null = null, days = 28): Promise<string[]> {
  const { data, error } = await createPublicClient().rpc('get_open_slots', { p_clinic: clinicSlug, p_from: from, p_days: days })
  if (error || !data) return []
  return (data as { slot_start: string }[]).map((row) => new Date(row.slot_start).toISOString())
}
