'use client'

import { useEffect } from 'react'

type Badging = { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

// The number on the installed app's icon: booking requests waiting for a decision. Only where the phone
// shows such numbers (an iPhone, a computer); elsewhere nothing happens.
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    const badging = navigator as Navigator & Badging
    if (count > 0) void badging.setAppBadge?.(count).catch(() => {})
    else void badging.clearAppBadge?.().catch(() => {})
  }, [count])
  return null
}
