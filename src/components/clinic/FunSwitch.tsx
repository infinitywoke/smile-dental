'use client'

import { useState, useTransition } from 'react'
import { setGameTouches } from '@/lib/actions/settings'

// Game touches on or off: the Cockpit's ring that glows when everyone is seen, and the all-sent streak
export function FunSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [, startTransition] = useTransition()
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block font-semibold text-gray-900">Game touches</span>
        <span className="block text-sm text-gray-500">The ring glows when everyone is seen, and a streak counts days with every visit sent.</span>
      </span>
      <span className="relative inline-flex h-7 w-12 shrink-0">
        <input type="checkbox" role="switch" checked={on} className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
          onChange={(e) => {
            const value = e.target.checked
            setOn(value)
            navigator.vibrate?.(8)
            startTransition(async () => { await setGameTouches(value) })
          }} />
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2" />
        <span aria-hidden="true" className="absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}
