'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// Taps on Today's self-emptying lists. Each is safe to repeat and has an undo.
type Result = { error?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRY_AGAIN = "Couldn't save that. Check the internet and try again."

function refresh() {
  revalidatePath('/app', 'layout')
}

// The reminder WhatsApp was opened (or undone)
export async function setReminded(appointmentId: string, reminded: boolean): Promise<Result> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({ reminded_at: reminded ? new Date().toISOString() : null }).eq('id', appointmentId)
  if (error) return { error: TRY_AGAIN }
  refresh()
  return {}
}

// "Didn't come": only a booked appointment whose time has passed and that has no visit
export async function markNoShow(appointmentId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'no_show', followed_up_at: null })
    .eq('id', appointmentId)
    .in('status', ['booked', 'no_show'])
    .is('visit_id', null)
    .lt('starts_at', new Date().toISOString())
    .select('id')
  if (error) return { error: TRY_AGAIN }
  if (data.length === 0) return { error: "That appointment can't be marked: it hasn't started yet, or the patient was seen." }
  refresh()
  return {}
}

// Undo "Didn't come": booked again (the time is refused if someone else has taken it since)
export async function undoNoShow(appointmentId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({ status: 'booked' }).eq('id', appointmentId).eq('status', 'no_show')
  if (error) return { error: 'Could not undo: that time has been given to someone else.' }
  refresh()
  return {}
}

// A missed appointment was followed up (WhatsApp sent, or "Done"), or undone
export async function setFollowedUp(appointmentId: string, done: boolean): Promise<Result> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({ followed_up_at: done ? new Date().toISOString() : null })
    .eq('id', appointmentId)
    .eq('status', 'no_show')
  if (error) return { error: TRY_AGAIN }
  refresh()
  return {}
}

// The check-up reminder was sent or skipped ("now"); undo puts back what was there before
export async function setRecalled(patientId: string, recalledAt: 'now' | string | null): Promise<Result> {
  await getDoctor()
  if (!UUID.test(patientId)) return { error: 'Something went wrong.' }
  if (recalledAt !== null && recalledAt !== 'now' && Number.isNaN(Date.parse(recalledAt))) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const value = recalledAt === 'now' ? new Date().toISOString() : recalledAt
  const { error } = await supabase.from('patients').update({ recalled_at: value }).eq('id', patientId)
  if (error) return { error: TRY_AGAIN }
  refresh()
  return {}
}
