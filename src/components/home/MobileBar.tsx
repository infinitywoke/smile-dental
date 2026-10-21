'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { BookButton } from './BookButton'
import { WHATSAPP } from './site-links'

// On a phone, WhatsApp and Book stay one tap away at the bottom of the screen; the bar steps aside
// while a booking card is on screen. It stays put as pages change, so it looks again on each page.
export function MobileBar() {
  const pathname = usePathname()
  const [seen, setSeen] = useState({ path: '', inView: false })
  const cardInView = seen.path === pathname && seen.inView

  useEffect(() => {
    const zone = document.getElementById('book-zone')
    if (!zone) return
    const observer = new IntersectionObserver(([entry]) => setSeen({ path: pathname, inView: entry.isIntersecting }), { threshold: 0.12 })
    observer.observe(zone)
    return () => observer.disconnect()
  }, [pathname])

  return (
    <div className={`h-mobile-bar${cardInView ? ' away' : ''}`} aria-hidden={cardInView}>
      <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="h-btn glass-dark" tabIndex={cardInView ? -1 : 0}>
        <MessageCircle className="h-icon" aria-hidden="true" /> WhatsApp
      </a>
      <BookButton className="h-btn amber" tabIndex={cardInView ? -1 : 0} />
    </div>
  )
}
