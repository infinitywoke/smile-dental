// Saves made with no signal wait here, on the phone, and go to the server in order once it is back
// (OutboxSync). Each is a server action by name with its arguments. Every charge and payment carries an
// id made on the phone, so one sent twice is stored once, and taking back something still waiting
// simply drops it. Kept in the browser's storage, so a closed tab or a restarted phone loses nothing.

export type QueuedAction = 'addCharge' | 'removeCharge' | 'recordPayment' | 'removePayment' | 'setPhotoKind'

export type QueuedSave = {
  id: string
  visitId: string
  action: QueuedAction
  args: unknown[]
  at: number
  // The server turned it down when it was sent (it stays, so he can see it and let it go)
  error?: string
}

const KEY = 'clinic-outbox'
const EMPTY: QueuedSave[] = []
const listeners = new Set<() => void>()
let cache: QueuedSave[] | null = null

export function readOutbox(): QueuedSave[] {
  if (cache) return cache
  if (typeof window === 'undefined') return EMPTY
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    cache = Array.isArray(parsed) ? parsed : []
  } catch {
    cache = []
  }
  return cache
}

function write(items: QueuedSave[]) {
  cache = items
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // No storage (a private window): the queue lasts as long as the page
  }
  listeners.forEach((listener) => listener())
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab changed it
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    cache = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

// The id of the charge or payment a save is about ("" for a photo's kind)
export function subjectOf(save: Pick<QueuedSave, 'action' | 'args'>): string {
  switch (save.action) {
    case 'addCharge':
      return String(save.args[2] ?? '')
    case 'recordPayment':
      return String(save.args[3] ?? '')
    case 'removeCharge':
    case 'removePayment':
    case 'setPhotoKind':
      return String(save.args[0] ?? '')
  }
}

export function enqueue(save: Omit<QueuedSave, 'id' | 'at'>) {
  const items = readOutbox()
  const subject = subjectOf(save)
  // Taking back a charge or payment that is still waiting: it never reached the server, so it just goes
  const undoes = save.action === 'removeCharge' ? 'addCharge' : save.action === 'removePayment' ? 'recordPayment' : null
  const waiting = undoes && items.find((i) => i.action === undoes && subjectOf(i) === subject)
  if (waiting) {
    write(items.filter((i) => i !== waiting))
    return
  }
  // A photo's kind: only the latest choice matters
  const kept = save.action === 'setPhotoKind' ? items.filter((i) => !(i.action === 'setPhotoKind' && subjectOf(i) === subject)) : items
  write([...kept, { ...save, id: crypto.randomUUID(), at: Date.now() }])
}

// Everything waiting goes (signing out, and the tests)
export function clearOutbox() {
  write([])
}

export function dropFromOutbox(id: string) {
  write(readOutbox().filter((i) => i.id !== id))
}

export function markFailed(id: string, error: string) {
  write(readOutbox().map((i) => (i.id === id ? { ...i, error } : i)))
}

// A save that never reached the server (no signal), as opposed to one the server turned down
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return e instanceof TypeError || (e instanceof Error && /fetch|network|load failed|timed? ?out/i.test(e.message))
}
