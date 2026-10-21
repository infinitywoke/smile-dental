'use client'

import { useState, useTransition } from 'react'
import { Moon, Smartphone, Sun } from 'lucide-react'
import { setThemePreference } from '@/lib/actions/settings'
import type { ThemePref } from '@/lib/theme'

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'Phone', Icon: Smartphone },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

// Light, dark, or whatever the phone is set to. The screen changes at once; the choice is saved for
// this phone behind it.
export function ThemeSwitch({ initial }: { initial: ThemePref }) {
  const [pref, setPref] = useState(initial)
  const [, startTransition] = useTransition()

  function choose(value: ThemePref) {
    setPref(value)
    document.getElementById('hud-root')?.setAttribute('data-theme', value)
    navigator.vibrate?.(8)
    startTransition(async () => {
      await setThemePreference(value)
    })
  }

  return (
    <div role="radiogroup" aria-label="Look" className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = pref === value
        return (
          <button key={value} type="button" role="radio" aria-checked={on} onClick={() => choose(value)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-bold ring-1 transition-colors ${
              on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-200'
            }`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
