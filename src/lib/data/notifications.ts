import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_NOTIFY_SETTINGS, type NotifySettings } from '@/lib/notifications'

export type NotifyPhone = { endpoint: string; device: string; created_at: string }

// His notification settings and the phones that have them on. `ready` is false until the database
// part (supabase/notifications-2026-10.sql) has been run.
export async function getNotifications(): Promise<{ ready: boolean; settings: NotifySettings; phones: NotifyPhone[] }> {
  await getDoctor()
  const supabase = await createClient()
  const [settings, phones] = await Promise.all([
    supabase.from('notification_settings')
      .select('new_request, waiting_request, morning_brief, show_names, quiet_from, quiet_until').maybeSingle(),
    supabase.from('push_subscriptions').select('endpoint, device, created_at').order('created_at'),
  ])
  if (settings.error || phones.error) return { ready: false, settings: DEFAULT_NOTIFY_SETTINGS, phones: [] }
  const s = settings.data
  return {
    ready: true,
    // Times come back as "21:00:00"
    settings: s ? { ...s, quiet_from: s.quiet_from.slice(0, 5), quiet_until: s.quiet_until.slice(0, 5) } : DEFAULT_NOTIFY_SETTINGS,
    phones: phones.data ?? [],
  }
}
