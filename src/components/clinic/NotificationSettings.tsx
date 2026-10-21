'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { Card } from '@/components/clinic/ui'
import { removePushSubscription, savePushSubscription, saveNotificationSettings, sendTestNotification } from '@/lib/actions/notifications'
import type { NotifySettings } from '@/lib/notifications'

type Props = {
  // The database part has been run and the server has its keys
  ready: boolean
  vapidKey: string
  initial: NotifySettings
  phones: { endpoint: string; device: string }[]
}

type PhoneState = 'checking' | 'unsupported' | 'install-first' | 'blocked' | 'off' | 'on'

const SCOPE = '/app/'
const QUIET_FROM = ['19:00', '20:00', '21:00', '22:00', '23:00']
const QUIET_UNTIL = ['06:00', '07:00', '07:30', '08:00', '08:30', '09:00']
const label12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// "Android · Chrome", "iPhone · Safari"
function deviceName(): string {
  const ua = navigator.userAgent
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : 'This device'
  const browser = /edg\//i.test(ua) ? 'Edge' : /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'browser'
  return `${os} · ${browser}`
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Turn notifications on for this phone, try one, and choose what to hear about and when to keep quiet
export function NotificationSettings({ ready, vapidKey, initial, phones }: Props) {
  const [state, setState] = useState<PhoneState>('checking')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [settings, setSettings] = useState(initial)
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    async function check() {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
      let next: PhoneState
      let current: string | null = null
      if (!supported) next = /iphone|ipad/i.test(navigator.userAgent) && !standalone ? 'install-first' : 'unsupported'
      else if (Notification.permission === 'denied') next = 'blocked'
      else {
        const registration = await navigator.serviceWorker.getRegistration(SCOPE)
        current = (await registration?.pushManager.getSubscription())?.endpoint ?? null
        next = current ? 'on' : 'off'
      }
      if (!cancelled) {
        setEndpoint(current)
        setState(next)
      }
    }
    check().catch(() => { if (!cancelled) setState('unsupported') })
    return () => { cancelled = true }
  }, [])

  function turnOn() {
    setMessage(null)
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setState(permission === 'denied' ? 'blocked' : 'off')
          return
        }
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: SCOPE })
        await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) })
        const keys = subscription.toJSON().keys ?? {}
        const result = await savePushSubscription({ endpoint: subscription.endpoint, p256dh: keys.p256dh ?? '', auth: keys.auth ?? '', device: deviceName() })
        if (!result.ok) {
          await subscription.unsubscribe()
          setMessage({ text: result.error, good: false })
          return
        }
        setEndpoint(subscription.endpoint)
        setState('on')
        setMessage({ text: 'Notifications are on for this phone. Try a test.', good: true })
      } catch {
        setMessage({ text: 'This phone could not turn notifications on. Please try again.', good: false })
      }
    })
  }

  function turnOff() {
    if (!endpoint) return
    setMessage(null)
    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration(SCOPE)
      await (await registration?.pushManager.getSubscription())?.unsubscribe().catch(() => false)
      const result = await removePushSubscription(endpoint)
      setEndpoint(null)
      setState('off')
      setMessage(result.ok ? { text: 'Notifications are off for this phone.', good: true } : { text: result.error, good: false })
    })
  }

  function test() {
    if (!endpoint) return
    setMessage(null)
    startTransition(async () => {
      const result = await sendTestNotification(endpoint)
      setMessage(result.ok ? { text: 'Sent. It should appear in a few seconds.', good: true } : { text: result.error, good: false })
    })
  }

  function change(next: Partial<NotifySettings>) {
    const updated = { ...settings, ...next }
    setSettings(updated)
    setMessage(null)
    startTransition(async () => {
      const result = await saveNotificationSettings(updated)
      setMessage(result.ok ? { text: 'Saved', good: true } : { text: result.error, good: false })
    })
  }

  const others = phones.filter((p) => p.endpoint !== endpoint)

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold text-gray-900">This phone</p>
        {!ready && <p className="text-sm text-gray-600">Notifications are not set up on the server yet.</p>}
        {ready && state === 'checking' && <p className="text-sm text-gray-500">Checking this phone…</p>}
        {ready && state === 'unsupported' && <p className="text-sm text-gray-600">This browser cannot show notifications. On Android, open Clinic OS in Chrome.</p>}
        {ready && state === 'install-first' && (
          <p className="text-sm text-gray-600">On iPhone, first add Clinic OS to the Home Screen (Share, then Add to Home Screen), and open it from there.</p>
        )}
        {ready && state === 'blocked' && (
          <p className="text-sm text-gray-600">Notifications are blocked for Clinic OS. Allow them in the phone&apos;s settings for this app or browser, then come back.</p>
        )}
        {ready && state === 'off' && (
          <>
            <p className="text-sm text-gray-600">Get a notification when a patient books online, and a short brief each morning.</p>
            <button type="button" onClick={turnOn} disabled={pending}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">
              <Bell className="h-5 w-5" aria-hidden="true" /> Turn on notifications
            </button>
          </>
        )}
        {ready && state === 'on' && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={pending}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-60">
              <Send className="h-5 w-5" aria-hidden="true" /> Send a test
            </button>
            <button type="button" onClick={turnOff} disabled={pending}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 font-semibold text-gray-700 ring-1 ring-gray-300 disabled:opacity-60">
              <BellOff className="h-5 w-5" aria-hidden="true" /> Turn off
            </button>
          </div>
        )}
        {others.length > 0 && <p className="text-xs text-gray-500">Also on: {others.map((p) => p.device || 'another phone').join(', ')}</p>}
      </Card>

      <Card className="space-y-1">
        <p className="pb-1 font-semibold text-gray-900">Tell me about</p>
        <Toggle label="A new booking request" detail="As soon as a patient books online" checked={settings.new_request} onChange={(v) => change({ new_request: v })} />
        <Toggle label="A request still waiting" detail="30 minutes after it came in, if not confirmed" checked={settings.waiting_request} onChange={(v) => change({ waiting_request: v })} />
        <Toggle label="The morning brief" detail="8:15 AM on open days: today's bookings and requests" checked={settings.morning_brief} onChange={(v) => change({ morning_brief: v })} />
        <Toggle label="Patient names on the lock screen" detail="Off: only the time and the reason show" checked={settings.show_names} onChange={(v) => change({ show_names: v })} />
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="font-semibold text-gray-900">Quiet hours</p>
          <p className="text-sm text-gray-600">No requests at night; the morning brief counts them.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            From
            <select value={settings.quiet_from} onChange={(e) => change({ quiet_from: e.target.value })}
              className="min-h-12 rounded-xl border-0 px-3 text-base text-gray-900 ring-1 ring-inset ring-gray-300">
              {QUIET_FROM.map((t) => <option key={t} value={t}>{label12(t)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Until
            <select value={settings.quiet_until} onChange={(e) => change({ quiet_until: e.target.value })}
              className="min-h-12 rounded-xl border-0 px-3 text-base text-gray-900 ring-1 ring-inset ring-gray-300">
              {QUIET_UNTIL.map((t) => <option key={t} value={t}>{label12(t)}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {message && <p role="status" className={`text-sm font-medium ${message.good ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
    </div>
  )
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-1">
      <span>
        <span className="block text-base font-medium text-gray-900">{label}</span>
        <span className="block text-sm text-gray-500">{detail}</span>
      </span>
      <span className="relative inline-flex h-7 w-12 shrink-0">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0" />
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2" />
        <span aria-hidden="true" className="absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}
