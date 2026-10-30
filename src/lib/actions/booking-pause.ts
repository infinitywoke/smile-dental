'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { endOfTodayInIndia, type PauseMode } from '@/lib/booking-pause'

type Result = { ok: true } | { ok: false; error: string }

// Pauses the website's booking for the rest of today or until it is turned back on, or opens it again.
// For the signed-in person's clinic only (the database checks).
export async function setBookingPause(mode: PauseMode): Promise<Result> {
  await getDoctor()
  if (mode !== 'today' && mode !== 'indefinite' && mode !== 'open') return { ok: false, error: 'Please try again.' }
  const until = mode === 'open' ? null : mode === 'indefinite' ? 'infinity' : endOfTodayInIndia(new Date())
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_booking_pause', { p_until: until })
  if (error) {
    return { ok: false, error: 'Could not change it. Please try again.' }
  }
  revalidatePath('/app', 'layout')
  return { ok: true }
}
