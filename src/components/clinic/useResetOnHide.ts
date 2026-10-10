'use client'

import { useEffect, useState } from 'react'

// With Cache Components, Next.js keeps recently visited screens mounted but hidden.
// Returns a key that changes whenever the screen is hidden, so a form keyed with it
// starts fresh the next time it is shown instead of keeping old input.
export function useResetOnHide(): number {
  const [key, setKey] = useState(0)
  useEffect(() => () => setKey((k) => k + 1), [])
  return key
}
