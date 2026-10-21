'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Menu, Phone, X } from 'lucide-react'

type Props = { name: string; place: string; logo: string; tel: string; phoneShown: string; whatsapp: string; directions: string }

// One row on every screen: a wide screen shows every link; a narrower one keeps Call, Book and a menu;
// a phone keeps Call and the menu (Book and WhatsApp sit in the bar at the bottom). The header stays at
// the top as the page scrolls, on a solid background once the page has moved.
export function SiteHeader({ name, place, logo, tel, phoneShown, whatsapp, directions }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => setOpen(false)

  return (
    <header className={`h-header${scrolled || open ? ' solid' : ''}`}>
      <div className="h-wrap h-header-row">
        <a href="#top" className="h-brand" onClick={close}>
          <Image src={logo} alt={`${name} logo`} width={44} height={44} className="h-brand-logo" priority />
          <span className="h-brand-text">
            <span className="h-brand-name">{name}</span>
            <span className="h-brand-place">{place}</span>
          </span>
        </a>
        <nav aria-label="Main" className="h-nav">
          <a href="#treatments" className="h-btn small glass h-desk">Treatments and prices</a>
          <a href="#doctor" className="h-btn small glass h-desk">Dr. Rahil</a>
          <a href={directions} target="_blank" rel="noopener noreferrer" className="h-btn small glass h-desk">Get directions</a>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="h-btn small glass h-desk">WhatsApp the clinic</a>
          <a href={tel} className="h-btn small glass icon" aria-label={`Call the clinic, ${phoneShown}`}>
            <Phone className="h-icon" aria-hidden="true" />
          </a>
          <a href="#book" className="h-btn small amber on-dark h-not-phone">Book appointment</a>
          <button type="button" className="h-btn small glass icon h-menu-btn" aria-label={open ? 'Close menu' : 'Menu'}
            aria-expanded={open} aria-controls="h-menu" onClick={() => setOpen(!open)}>
            {open ? <X className="h-icon" aria-hidden="true" /> : <Menu className="h-icon" aria-hidden="true" />}
          </button>
        </nav>
      </div>
      {open && (
        <nav id="h-menu" aria-label="Menu" className="h-sheet">
          <div className="h-wrap h-sheet-list">
            <a href="#book" className="h-sheet-link primary" onClick={close}>Book appointment</a>
            <a href="#treatments" className="h-sheet-link" onClick={close}>Treatments and prices</a>
            <a href="#doctor" className="h-sheet-link" onClick={close}>Dr. Rahil</a>
            <a href={directions} target="_blank" rel="noopener noreferrer" className="h-sheet-link" onClick={close}>Get directions</a>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="h-sheet-link" onClick={close}>WhatsApp the clinic</a>
            <a href={tel} className="h-sheet-link" onClick={close}>Call {phoneShown}</a>
          </div>
        </nav>
      )}
    </header>
  )
}
