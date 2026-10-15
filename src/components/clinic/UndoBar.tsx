'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// A quick action (book the next visit, add a charge, record a payment, remove the next visit) takes
// effect at once; a bar at the bottom then offers "Undo" for a few seconds and goes away by itself.
// Nothing stays on screen, so the page doesn't get busier.
const UNDO_MS = 8000
const MESSAGE_MS = 4000

type Undo = () => Promise<{ error?: string }>
type Offer = (label: string, undo: Undo) => void

const UndoContext = createContext<Offer>(() => {})

export const useUndo = () => useContext(UndoContext)

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<{ key: number; label: string; undo: Undo } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const counter = useRef(0)

  const offer = useCallback<Offer>((label, undo) => {
    counter.current += 1
    setMessage(null)
    setItem({ key: counter.current, label, undo })
  }, [])

  useEffect(() => {
    if (!item) return
    const timer = setTimeout(() => setItem(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [item])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS)
    return () => clearTimeout(timer)
  }, [message])

  async function undo() {
    if (!item) return
    const { undo: run } = item
    setItem(null)
    try {
      const result = await run()
      setMessage(result.error ?? 'Undone')
    } catch {
      setMessage("Couldn't undo. Check the internet and try again.")
    }
  }

  const bar = 'mx-auto flex min-h-14 max-w-lg items-center gap-3 rounded-2xl bg-gray-900 py-1 pl-4 pr-1 text-base text-white shadow-lg'
  return (
    <UndoContext.Provider value={offer}>
      {children}
      {(item || message) && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 px-4" role="status">
          {item ? (
            <div key={item.key} className={bar}>
              <p className="min-w-0 flex-1 truncate">{item.label}</p>
              <button type="button" onClick={() => void undo()}
                className="min-h-12 shrink-0 rounded-xl px-4 font-semibold text-blue-300 hover:bg-white/10">
                Undo
              </button>
            </div>
          ) : (
            <div className={`${bar} pr-4`}>
              <p className="min-w-0 flex-1">{message}</p>
            </div>
          )}
        </div>
      )}
    </UndoContext.Provider>
  )
}
