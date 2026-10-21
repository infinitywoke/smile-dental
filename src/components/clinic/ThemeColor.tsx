'use client'

import { useEffect } from 'react'

// The phone's status bar takes the Cockpit's background, in whichever theme is showing (the dentist's
// choice, or the phone's own mode while that choice is System)
export function ThemeColor() {
  useEffect(() => {
    const root = document.getElementById('hud-root')
    if (!root) return
    const apply = () => {
      const color = getComputedStyle(root).getPropertyValue('--hud-bg').trim()
      if (color) document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', color))
    }
    apply()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      media.removeEventListener('change', apply)
      observer.disconnect()
    }
  }, [])
  return null
}
