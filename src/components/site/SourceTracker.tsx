'use client'

import { useEffect } from 'react'
import { guessHeardFrom } from '@/lib/heard-from'

export const SOURCE_KEY = 'smile_heard_from'

// Remembers, for this browser tab only, which link first brought the visitor to the website
// (Google, Instagram...). The booking form uses it to pre-fill "How did you hear about us?".
// Nothing is sent anywhere from here.
export function SourceTracker() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SOURCE_KEY) !== null) return
      const utm = new URLSearchParams(window.location.search).get('utm_source')
      sessionStorage.setItem(SOURCE_KEY, guessHeardFrom(document.referrer, utm))
    } catch {
      // Private mode or blocked storage: the visitor just answers the question themselves
    }
  }, [])
  return null
}
