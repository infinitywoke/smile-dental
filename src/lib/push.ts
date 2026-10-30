import 'server-only'
import webpush from 'web-push'
import { siteConfig } from '@/config/site'
import { createPublicClient } from '@/lib/supabase/public'
import { messageFor, type NotifyItem, type NotifySettings, type PushMessage } from '@/lib/notifications'

// Sending notifications to the phones that turned them on (Web Push). The keys come from Vercel:
// NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY identify the app to the push services, and
// CLINIC_OS_CRON_SECRET lets the database's notification functions answer (the same secret is in Vault).

export type PushTarget = { endpoint: string; p256dh: string; auth: string }
type Due = { settings: NotifySettings; subscriptions: PushTarget[]; items: NotifyItem[] }

export const pushKeysReady = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

// One message to each phone; the phones the push service says are gone (404 or 410) are returned
export async function sendPush(targets: PushTarget[], message: PushMessage): Promise<{ sent: number; gone: string[] }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey || targets.length === 0) return { sent: 0, gone: [] }
  const payload = JSON.stringify(message)
  const results = await Promise.allSettled(targets.map((t) => webpush.sendNotification(
    { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
    payload,
    { TTL: 60 * 60, urgency: 'high', vapidDetails: { subject: `mailto:${siteConfig.email}`, publicKey, privateKey } },
  )))
  const gone = results.flatMap((r, i) => {
    const status = r.status === 'rejected' ? (r.reason as { statusCode?: number })?.statusCode : undefined
    return status === 404 || status === 410 ? [targets[i].endpoint] : []
  })
  return { sent: results.filter((r) => r.status === 'fulfilled').length, gone }
}

// Turn what the database says is due into messages, send them, and forget phones that are gone
// (one Due for each member of a clinic with a phone set up: each has their own settings)
async function deliver(all: Due[] | null, secret: string, now = new Date()): Promise<number> {
  let sent = 0
  const gone = new Set<string>()
  for (const due of all ?? []) {
    for (const item of due.items) {
      const message = messageFor(item, due.settings, now)
      if (!message) continue
      const result = await sendPush(due.subscriptions.filter((s) => !gone.has(s.endpoint)), message)
      sent += result.sent
      result.gone.forEach((endpoint) => gone.add(endpoint))
    }
  }
  if (gone.size > 0) await createPublicClient().rpc('notify_gone', { p_secret: secret, p_endpoints: [...gone] })
  return sent
}

const secretNow = () => (pushKeysReady() ? process.env.CLINIC_OS_CRON_SECRET : undefined)

// A website request was just saved: tell the phones of its clinic's members (once, whatever calls this)
export async function notifyNewRequest(requestId: string): Promise<void> {
  const secret = secretNow()
  if (!secret) return
  try {
    const { data, error } = await createPublicClient().rpc('notify_new_request_all', { p_secret: secret, p_request: requestId })
    if (!error) await deliver(data as Due[] | null, secret)
  } catch (e) {
    // A notification must never break a booking
    console.error('notifyNewRequest failed', e)
  }
}

// Every 5 minutes, from the scheduler: whatever is due now
export async function notifyDue(): Promise<{ ok: boolean; sent: number }> {
  const secret = secretNow()
  if (!secret) return { ok: false, sent: 0 }
  const { data, error } = await createPublicClient().rpc('notify_due_all', { p_secret: secret })
  if (error) return { ok: false, sent: 0 }
  return { ok: true, sent: await deliver(data as Due[] | null, secret) }
}
