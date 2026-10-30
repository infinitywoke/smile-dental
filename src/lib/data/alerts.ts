import 'server-only'
import { cache } from 'react'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getBookingPause } from '@/lib/actions/booking'
import { getClinic } from '@/lib/data/clinic'
import { getDues } from '@/lib/data/dues'
import { getMissed, getRecalls, getReminders } from '@/lib/data/follow-ups'
import { getStock } from '@/lib/data/stock'
import { todayInIndia } from '@/lib/dates'
import { buildAlerts, type Alert, type AlertData } from '@/lib/alerts'

// Website requests waiting for a decision (without their voice notes: the request's screen plays those)
async function waitingRequests(): Promise<AlertData['requests']> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_requests')
    .select('id, name, requested_start, reason, created_at, received_at')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Visits whose bill changed after the WhatsApp went, the latest first
async function billsToResend(): Promise<AlertData['resend']> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select('id, visit_date, patient:patients!inner (name)')
    .eq('resend_needed', true)
    .not('closed_at', 'is', null)
    .order('visit_date', { ascending: false })
  if (error) throw error
  return data as unknown as AlertData['resend']
}

// The Alerts screen: everything, worked out fresh
export const getAlerts = cache(async (): Promise<Alert[]> => {
  await getDoctor()
  const today = todayInIndia()
  const [requests, resend, missed, reminders, stock, dues, recalls, pause] = await Promise.all([
    waitingRequests(), billsToResend(), getMissed(), getReminders(today), getStock(), getDues(1000), getRecalls(today), getClinic().then(({ clinic }) => getBookingPause(clinic.slug)),
  ])
  return buildAlerts({
    today, now: Date.now(), requests, resend, missed, reminders,
    stock: stock.ready ? stock.levels : [],
    dues, recalls,
    pausedUntil: pause.ready ? pause.until : null,
  })
})

// The number on the Alerts button: what needs a decision now. Every screen asks (the layout), so only the
// light lists are read, and a failure shows no number rather than breaking the screen.
export const getAlertCount = cache(async (): Promise<number> => {
  try {
    const today = todayInIndia()
    const [requests, resend, missed, reminders] = await Promise.all([waitingRequests(), billsToResend(), getMissed(), getReminders(today)])
    return buildAlerts({
      today, now: Date.now(), requests, resend, missed, reminders, stock: [], dues: [], recalls: [], pausedUntil: null,
    }).filter((a) => a.now).length
  } catch {
    return 0
  }
})
