'use client'

import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'

// On a phone, WhatsApp and Book stay one tap away at the bottom of the screen; the bar steps aside
// while the booking card itself is on screen
export function MobileBar({ whatsapp }: { whatsapp: string }) {
  const [cardInView, setCardInView] = useState(false)

  useEffect(() => {
    const zone = document.getElementById('book-zone')
    if (!zone) return
    const observer = new IntersectionObserver(([entry]) => setCardInView(entry.isIntersecting), { threshold: 0.12 })
    observer.observe(zone)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={`h-mobile-bar${cardInView ? ' away' : ''}`} aria-hidden={cardInView}>
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="h-btn glass-dark" tabIndex={cardInView ? -1 : 0}>
        <MessageCircle className="h-icon" aria-hidden="true" /> WhatsApp
      </a>
      <a href="#book" className="h-btn amber" tabIndex={cardInView ? -1 : 0}>Book appointment</a>
    </div>
  )
}
