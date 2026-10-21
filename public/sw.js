// Clinic OS service worker: shows the notifications the server sends, and opens the right screen when one
// is tapped. It caches nothing, so the app always loads fresh from the server.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Clinic OS', {
    body: data.body || '',
    tag: data.tag || undefined,
    // A newer notification with the same tag (a request still waiting) buzzes again
    renotify: Boolean(data.tag),
    icon: '/icons/clinic-192.png',
    data: { url: data.url || '/app' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/app', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const app = windows.find((w) => new URL(w.url).pathname.startsWith('/app'))
    if (app) {
      await app.focus()
      try {
        await app.navigate(url)
        return
      } catch {
        // Not controlled by this worker yet: open a new window instead
      }
    }
    await self.clients.openWindow(url)
  })())
})
