'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TEST_MESSAGE, type NotifySettings } from '@/lib/notifications'
import { pushKeysReady, sendPush } from '@/lib/push'

type Result = { ok: true } | { ok: false; error: string }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// This phone turned notifications on: keep its address and keys (a phone that turns them on again
// replaces its old keys)
export async function savePushSubscription(input: { endpoint: string; p256dh: string; auth: string; device: string }): Promise<Result> {
  await getDoctor()
  const endpoint = input.endpoint.trim()
  if (!endpoint.startsWith('https://') || endpoint.length > 1000 || !input.p256dh || input.p256dh.length > 200 || !input.auth || input.auth.length > 100) {
    return { ok: false, error: 'This phone gave an address the app cannot use. Please try again.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ endpoint, p256dh: input.p256dh, auth: input.auth, device: input.device.slice(0, 100) }, { onConflict: 'endpoint' })
  if (error) return { ok: false, error: 'Could not save this phone. Please try again.' }
  revalidatePath('/app/notifications')
  return { ok: true }
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) return { ok: false, error: 'Could not turn notifications off. Please try again.' }
  revalidatePath('/app/notifications')
  return { ok: true }
}

export async function saveNotificationSettings(settings: NotifySettings): Promise<Result> {
  const doctor = await getDoctor()
  if (!TIME.test(settings.quiet_from) || !TIME.test(settings.quiet_until)) return { ok: false, error: 'Please choose the quiet hours again.' }
  const supabase = await createClient()
  const { error } = await supabase.from('notification_settings').upsert({
    owner_id: doctor.id,
    new_request: Boolean(settings.new_request),
    waiting_request: Boolean(settings.waiting_request),
    morning_brief: Boolean(settings.morning_brief),
    show_names: Boolean(settings.show_names),
    quiet_from: settings.quiet_from,
    quiet_until: settings.quiet_until,
  }, { onConflict: 'owner_id' })
  if (error) return { ok: false, error: 'Could not save. Please try again.' }
  return { ok: true }
}

// A test notification to this phone only
export async function sendTestNotification(endpoint: string): Promise<Result> {
  await getDoctor()
  if (!pushKeysReady()) return { ok: false, error: 'Notifications are not set up on the server yet.' }
  const supabase = await createClient()
  const { data: phone } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('endpoint', endpoint).maybeSingle()
  if (!phone) return { ok: false, error: 'This phone is not turned on. Turn notifications on first.' }
  const { sent, gone } = await sendPush([phone], TEST_MESSAGE)
  if (gone.length > 0) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return { ok: false, error: 'This phone no longer accepts notifications. Turn them on again.' }
  }
  return sent > 0 ? { ok: true } : { ok: false, error: 'The test could not be sent. Please try again.' }
}
