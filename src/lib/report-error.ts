import { reportAppError } from '@/lib/actions/app-errors'
import { isNetworkError } from '@/lib/offline/outbox'

// Errors on Clinic OS screens go to the server, so the owner hears of them (the daily health check). A
// lost signal is not an error (the app copes with it), nor are the browser's own resize warnings; each
// error is sent once per page, five at most.
const sent = new Set<string>()

export function reportError(error: unknown) {
  if (typeof window === 'undefined' || !location.pathname.startsWith('/app')) return
  if (isNetworkError(error)) return
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (!message || /ResizeObserver loop/i.test(message)) return
  const key = `${location.pathname} ${message}`
  if (sent.has(key) || sent.size >= 5) return
  sent.add(key)
  void reportAppError({ place: location.pathname, message, stack: error instanceof Error ? error.stack : undefined }).catch(() => {})
}
