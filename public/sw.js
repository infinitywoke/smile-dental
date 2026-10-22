// Clinic OS service worker: shows the notifications the server sends, opens the right screen when one
// is tapped, and keeps a copy of each screen and of the app's own files on the phone, so the app still
// opens with no signal (src/lib/offline/worker.ts starts it; the outbox saves what is done meanwhile).
//
// In development (?mode=dev) it caches nothing, so code changes always show, unless ?offline=1 (the
// offline tests): then files are taken from the network first, and a slow page is waited for.
const params = new URL(self.location.href).searchParams
const DEV = params.get('mode') === 'dev'
const OFFLINE = !DEV || params.get('offline') === '1'
const PAGES = 'clinic-pages-v1'
const FILES = 'clinic-files-v1'
const PAGE_LIMIT = 60
const FILE_LIMIT = 300
// On a weak signal the copy shows after this long; the fresh screen replaces it when it arrives
const WAIT_MS = 6000
// After a change is saved on a screen, its copy is made again once the changes stop for this long
const SETTLE_MS = 3000
const SAVED_AT = 'x-clinic-saved-at'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Copies an older version of this worker made go
  for (const name of await caches.keys()) {
    if (name.startsWith('clinic-') && name !== PAGES && name !== FILES) await caches.delete(name)
  }
  await self.clients.claim()
})()))

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

const isAppPage =(url) => url.pathname === '/app' || url.pathname.startsWith('/app/')

self.addEventListener('fetch', (event) => {
  if (!OFFLINE) return
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.method === 'GET' && request.mode === 'navigate' && isAppPage(url)) event.respondWith(openPage(event))
  else if (request.method === 'GET' && url.pathname.startsWith('/_next/static/')) event.respondWith(openFile(event))
  // A change saved on a screen (a server action): its copy is made again once the changes stop
  else if (request.method === 'POST' && request.headers.has('next-action') && isAppPage(url)) event.waitUntil(keepLater(url.href))
})

// Signing out forgets every copy; one being made then is dropped too (it was asked for before)
let generation = 0

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (OFFLINE && data.type === 'keep' && Array.isArray(data.urls)) event.waitUntil(keepPages(data.urls, Number(data.maxAge) || 0))
  if (data.type === 'forget') {
    generation++
    event.waitUntil(caches.delete(PAGES).finally(() => event.ports[0]?.postMessage('forgotten')))
  }
})

// A screen: from the server when there is signal (and kept for next time), else the phone's copy,
// marked with when it was made so the screen can say so. One never kept says there is no signal.
async function openPage(event) {
  const { request } = event
  const since = generation
  const fresh = fetch(request)
  let showedCopy = false
  event.waitUntil(fresh.then(async (response) => {
    if (!keepable(response)) return
    await keepPage(request.url, response.clone(), since)
    // The copy went up first (a weak signal): the screen fetches the fresh one now it is here
    if (showedCopy) (await self.clients.get(event.resultingClientId))?.postMessage({ type: 'fresh', url: request.url })
  }).catch(() => {}))

  const copy = await copyOf(request.url)
  if (!copy) return fresh.catch(() => noSignal())
  try {
    return await (DEV ? fresh : Promise.race([fresh, new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), WAIT_MS))]))
  } catch {
    showedCopy = true
    return marked(copy)
  }
}

// A sign-in redirect or an error page is never kept
const keepable = (response) => response.status === 200 && response.type === 'basic' && !response.redirected &&
  (response.headers.get('content-type') || '').includes('text/html')

// The copy of a screen. A visit or a patient opened on another step or tab uses the one kept.
async function copyOf(href) {
  const cache = await caches.open(PAGES)
  const exact = await cache.match(href)
  if (exact) return exact
  return /^\/app\/(visits|patients)\/[^/]+$/.test(new URL(href).pathname) ? cache.match(href, { ignoreSearch: true }) : undefined
}

async function keepPage(href, response, since) {
  const headers = new Headers(response.headers)
  for (const name of ['content-encoding', 'content-length', 'vary']) headers.delete(name)
  headers.set(SAVED_AT, String(Date.now()))
  const copy = new Response(await response.blob(), { status: 200, headers })
  if (since !== generation) return
  const cache = await caches.open(PAGES)
  if (since !== generation) return
  await cache.put(href, copy)
  await trim(cache, PAGE_LIMIT)
}

// Oldest first: a screen kept again moves to the end
async function trim(cache, limit) {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)))
}

// The copy, marked with when it was made (src/lib/offline/worker.ts reads the mark)
async function marked(copy) {
  const savedAt = copy.headers.get(SAVED_AT) || ''
  const html = (await copy.text()).replace(/<head[^>]*>/i, (head) => `${head}<meta name="clinic-copy" content="${savedAt}">`)
  return new Response(html, { status: 200, headers: copy.headers })
}

function noSignal() {
  return new Response(NO_SIGNAL, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// The app's own files (scripts, styles, fonts). Their names change whenever they do, so a kept one is
// used as it is; in development, where names stay the same, only with no signal.
async function openFile(event) {
  const { request } = event
  const cache = await caches.open(FILES)
  const kept = () => cache.match(fileKey(request.url), { ignoreVary: true })
  if (!DEV) {
    const hit = await kept()
    if (hit) return hit
  }
  try {
    const response = await fetch(request)
    if (response.status === 200 && response.type === 'basic') event.waitUntil(keepFile(cache, request.url, response.clone()))
    return response
  } catch (error) {
    const hit = DEV ? await kept() : undefined
    if (hit) return hit
    throw error
  }
}

// One name per file, however the page spells it ([x] or %5Bx%5D) and whatever is asked after the ?
function fileKey(href) {
  const url = new URL(href)
  try {
    return url.origin + decodeURIComponent(url.pathname)
  } catch {
    return url.origin + url.pathname
  }
}

async function keepFile(cache, href, response) {
  await cache.put(fileKey(href), response)
  await trim(cache, FILE_LIMIT)
}

// Screens he may open with no signal (today's visits and patients, the screen just opened), fetched now
// while there is signal; one kept within maxAge stays as it is. With no signal the rest wait for next time.
async function keepPages(urls, maxAge) {
  const since = generation
  const cache = await caches.open(PAGES)
  for (const href of [...new Set(urls)].slice(0, 40)) {
    if (since !== generation) return
    const url = new URL(href, self.location.origin)
    if (url.origin !== self.location.origin || !isAppPage(url)) continue
    const kept = maxAge > 0 ? await cache.match(url.href) : undefined
    if (kept && Date.now() - Number(kept.headers.get(SAVED_AT)) < maxAge) continue
    try {
      await fetchAndKeep(url.href)
    } catch {
      return
    }
  }
}

async function fetchAndKeep(href) {
  const since = generation
  const response = await fetch(href, { redirect: 'manual' })
  // Gone (a visit deleted): its copy goes too
  if (response.status === 404) return (await caches.open(PAGES)).delete(href)
  if (!keepable(response)) return
  // Its files first, so a screen kept always has them
  await keepFilesOf(await response.clone().text())
  await keepPage(href, response, since)
}

// The files a kept screen needs, so it also works when it is first opened with no signal. Pages name
// them as /_next/static/... and, in the list the page loads first, as static/...
async function keepFilesOf(html) {
  const cache = await caches.open(FILES)
  const paths = new Set([...html.matchAll(/(?:\/_next\/)?static\/(?:chunks|media|css)\/[^"'\\\s)]+/g)]
    .map((match) => '/_next/' + match[0].replace(/^\/_next\//, '')))
  for (const path of paths) {
    const href = new URL(path, self.location.origin).href
    if (await cache.match(fileKey(href), { ignoreVary: true })) continue
    const response = await fetch(href)
    if (response.status === 200) await cache.put(fileKey(href), response)
  }
  await trim(cache, FILE_LIMIT)
}

// Each change saved restarts the wait, so a run of changes makes one copy
const settling = new Map()
function keepLater(href) {
  settling.get(href)?.()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      settling.delete(href)
      fetchAndKeep(href).catch(() => {}).finally(resolve)
    }, SETTLE_MS)
    settling.set(href, () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

const NO_SIGNAL = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#FAF6EE">
<title>No signal - Clinic OS</title>
<style>
  :root { color-scheme: light dark; --bg: #FAF6EE; --text: #071534; --muted: #5E6472; --button: #071534; --button-text: #F5EFE3 }
  @media (prefers-color-scheme: dark) { :root { --bg: #071534; --text: #F5EFE3; --muted: #B8BFCC; --button: #F5EFE3; --button-text: #071534 } }
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif }
  main { width: 100%; max-width: 22rem; padding: 24px 16px; box-sizing: border-box; text-align: center }
  h1 { margin: 0 0 8px; font-size: 1.5rem }
  p { margin: 0 0 24px; color: var(--muted) }
  a, button { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%; min-height: 48px; border-radius: 12px; font: inherit; font-weight: 700; text-decoration: none }
  a { margin-bottom: 12px; background: var(--button); color: var(--button-text) }
  button { border: 1px solid currentColor; background: transparent; color: var(--text) }
</style>
</head>
<body>
<main>
<h1>No signal</h1>
<p>This screen isn't kept on the phone, so it opens when the signal is back.</p>
<a href="/app">Go to Today</a>
<button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>`
