// A photo from the chair monitor (Intellicam). The monitor makes its own Wi-Fi and shows a QR code with
// the photo's address on it ("http://192.168.1.1/store/00017.jpg"). The app scans the code and pulls the
// photo straight into the visit (pullMonitorPhoto). Chrome lets an https page fetch an http address on
// the local network only with its Local Network Access permission (asked once) and only if the monitor
// allows the read (CORS); where it doesn't, the photo comes through the phone's share sheet instead:
// Chrome opens it, "Share image" sends it to Clinic OS, and public/sw.js gives it straight to the visit
// waiting for it (for half an hour). The waiting visit is kept in cache storage, which the page and the
// service worker can both read.
const CACHE = 'clinic-monitor-v1'
const KEY = '/__clinic-monitor-visit'

export async function waitForMonitorPhoto(visitId: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE)
    await cache.put(KEY, new Response(JSON.stringify({ visitId, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }))
  } catch {
    // No cache storage (a private window): the share sheet then asks which visit
  }
}

// The photo itself, fetched from the monitor; null when it can't be (blocked, not an image, too slow)
export async function pullMonitorPhoto(url: string, ms = 10_000): Promise<File | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    // targetAddressSpace: Chrome's Local Network Access, which lets an https page reach the monitor's http address
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', targetAddressSpace: 'local' } as RequestInit)
    if (!response.ok) return null
    const blob = await response.blob()
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || 'monitor.jpg'
    const type = blob.type.startsWith('image/') ? blob.type : /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.png$/i.test(name) ? 'image/png' : ''
    if (!type || blob.size === 0) return null
    return new File([blob], name, { type })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// The address a monitor's QR code holds: a photo on the monitor's own network ("http://192.168.1.1/store/00017.jpg"),
// else null. Only http(s) addresses on a private network, so a stray QR code can't open just anything.
export function monitorPhotoUrl(text: string): string | null {
  const raw = text.trim()
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const privateHost = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)
  return privateHost ? url.href : null
}
