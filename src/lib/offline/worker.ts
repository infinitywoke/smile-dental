import { removePushSubscription, savePushSubscription } from '@/lib/actions/notifications'

// The one service worker (public/sw.js): notifications, and the copies of the screens that let Clinic OS
// open with no signal. Its scope is /app, which takes in Today (/app itself) as well as every screen
// under it; nothing on the website starts with /app.
const SCOPE = '/app'
// It used to cover /app/ only (notifications), so not Today: a phone with that one is moved over
const OLD_SCOPE = '/app/'
// In development it caches nothing, so code changes always show, unless this is set (the offline tests)
const DEV_OFFLINE = 'clinic-offline-dev'
const PAGE_CACHES = 'clinic-pages'

const dev = process.env.NODE_ENV === 'development'
function devOffline(): boolean {
  try {
    return localStorage.getItem(DEV_OFFLINE) === '1'
  } catch {
    return false
  }
}

// Whether the worker keeps copies (always, but in development only when asked)
export const keepsCopies = () => !dev || devOffline()

let started: Promise<ServiceWorkerRegistration | null> | null = null

// Started once per page load. Null without service workers (a private window, an old browser).
export function clinicWorker(): Promise<ServiceWorkerRegistration | null> {
  started ??= start()
  return started
}

async function start(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const url = dev ? `/sw.js?mode=dev${devOffline() ? '&offline=1' : ''}` : '/sw.js'
    const registration = await navigator.serviceWorker.register(url, { scope: SCOPE })
    await moveOver(registration).catch(() => {})
    return registration
  } catch {
    started = null
    return null
  }
}

// The worker running (needed to turn notifications on, and to ask it for copies), or null after 10 s
function running(registration: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  if (registration.active) return Promise.resolve(registration.active)
  const worker = registration.installing ?? registration.waiting
  if (!worker) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(registration.active), 10_000)
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'activated' && worker.state !== 'redundant') return
      clearTimeout(timer)
      resolve(registration.active)
    })
  })
}

export async function readyWorker(): Promise<ServiceWorkerRegistration | null> {
  const registration = await clinicWorker()
  return registration && (await running(registration)) ? registration : null
}

// The old worker's notifications come too: subscribed again here (with the old subscription's own key)
// and saved before the old one goes, so none is missed. If a step fails the old one stays, for next time.
async function moveOver(registration: ServiceWorkerRegistration) {
  const old = (await navigator.serviceWorker.getRegistrations()).find((r) => new URL(r.scope).pathname === OLD_SCOPE)
  if (!old) return
  const subscription = await old.pushManager.getSubscription()
  const allowed = 'Notification' in window && Notification.permission === 'granted'
  if (subscription && allowed) {
    const key = subscription.options.applicationServerKey
    if (!key || !(await running(registration))) return
    const moved = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    const keys = moved.toJSON().keys ?? {}
    const saved = await savePushSubscription({ endpoint: moved.endpoint, p256dh: keys.p256dh ?? '', auth: keys.auth ?? '', device: deviceName() })
    if (!saved.ok) return
  }
  if (subscription) {
    await removePushSubscription(subscription.endpoint)
    await subscription.unsubscribe().catch(() => false)
  }
  await old.unregister()
}

// "Android · Chrome", "iPhone · Safari"
export function deviceName(): string {
  const ua = navigator.userAgent
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : 'This device'
  const browser = /edg\//i.test(ua) ? 'Edge' : /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'browser'
  return `${os} · ${browser}`
}

// Asks the worker to keep these screens, fetched now while there is signal. One it kept within maxAge
// (milliseconds) stays as it is.
export async function keepCopies(urls: string[], maxAge: number) {
  if (urls.length === 0 || !keepsCopies() || navigator.onLine === false) return
  const registration = await clinicWorker()
  const worker = registration && (await running(registration))
  worker?.postMessage({ type: 'keep', urls, maxAge })
}

// The screen on show is the phone's copy (the worker marks it): when that copy was made. Read as the
// page loads, before React takes the page over.
let copyAt: number | null =
  typeof document === 'undefined' ? null : Number(document.querySelector('meta[name="clinic-copy"]')?.getAttribute('content')) || null
const copyListeners = new Set<() => void>()
export const readCopyAt = () => copyAt
export function subscribeCopyAt(listener: () => void): () => void {
  copyListeners.add(listener)
  return () => {
    copyListeners.delete(listener)
  }
}

// The screen shows the server's data again
export function copyReplaced() {
  if (copyAt === null) return
  copyAt = null
  copyListeners.forEach((listener) => listener())
}

// The copy went up because the signal was weak, and the fresh screen has now arrived
export function onFreshCopy(listener: () => void): () => void {
  if (!('serviceWorker' in navigator)) return () => {}
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === 'fresh') listener()
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}

// Kept screens open with no signal only after this phone's fingerprint or PIN (public/sw.js asks on its
// lock page). The key for that is made by the phone and never leaves it: here only its id is kept, to
// ask the phone for it again. It is set up once, with signal.
const UNLOCK_KEY = 'clinic-unlock-key'
const lockListeners = new Set<() => void>()

// The phone can check its owner (it has a screen lock: fingerprint, face, PIN or pattern)
export async function canLock(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== 'undefined' && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

export function lockIsSet(): boolean {
  try {
    return Boolean(localStorage.getItem(UNLOCK_KEY))
  } catch {
    return false
  }
}

export function subscribeLock(listener: () => void): () => void {
  lockListeners.add(listener)
  return () => {
    lockListeners.delete(listener)
  }
}

// The phone asks for its fingerprint or PIN and makes the key. False if he cancels or it can't.
export async function setUpLock(): Promise<boolean> {
  try {
    const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'Clinic OS', id: location.hostname },
        user: { id: random(16), name: 'Clinic OS on this phone', displayName: 'Clinic OS on this phone' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!credential) return false
    const id = btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    localStorage.setItem(UNLOCK_KEY, id)
    lockListeners.forEach((listener) => listener())
    return true
  } catch {
    return false
  }
}

// Signing out: the phone forgets which key opens the kept screens
export function forgetLock() {
  try {
    localStorage.removeItem(UNLOCK_KEY)
  } catch {
    // No storage: nothing was kept
  }
  lockListeners.forEach((listener) => listener())
}

// Signing out: the screens kept on the phone go (they show patients). The worker is told first, so a
// copy it is making then is dropped too; it answers once its copies are gone (or after 3 s).
export async function forgetCopies() {
  try {
    const worker = 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistration(SCOPE))?.active : undefined
    if (worker) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel()
        const timer = setTimeout(resolve, 3000)
        channel.port1.onmessage = () => {
          clearTimeout(timer)
          resolve()
        }
        worker.postMessage({ type: 'forget' }, [channel.port2])
      })
    }
    for (const name of await caches.keys()) {
      if (name.startsWith(PAGE_CACHES)) await caches.delete(name)
    }
  } catch {
    // No service worker or cache storage: nothing was kept
  }
}
