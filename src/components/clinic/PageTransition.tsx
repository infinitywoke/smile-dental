'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Each screen fades gently in as it opens. The wrapper stays mounted (so a screen kept for Back keeps
// what was typed in it), and only opacity moves, so nothing fixed to the screen shifts while it plays.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const wrapper = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    wrapper.current?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
  }, [pathname])

  return <div ref={wrapper}>{children}</div>
}
