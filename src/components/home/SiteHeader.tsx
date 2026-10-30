'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, Phone, X } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { BookButton } from './BookButton'
import { NavLink } from './NavLink'
import { PHONE_SHOWN, TEL, WHATSAPP, linksFor } from './site-links'

// One row on every screen: a wide screen shows every link; a narrower one keeps Call, Book and a menu;
// a phone keeps Call and the menu (Book and WhatsApp sit in the bar at the bottom). The header stays at
// the top as the page scrolls, on a solid background once the page has moved.
export function SiteHeader() {
  const links = linksFor(usePathname())
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
      {siteConfig.demo && <p className="h-demo-note">Demo website: this clinic, its dentists and its prices are invented.</p>}
      <div className="h-wrap h-header-row">
        <NavLink href={links.home} className="h-brand" onClick={close}>
          <Image src={siteConfig.media.logo} alt={`${siteConfig.name} logo`} width={44} height={44} className="h-brand-logo" priority />
          <span className="h-brand-text">
            <span className="h-brand-name">{siteConfig.name}</span>
            <span className="h-brand-place">{siteConfig.area}</span>
          </span>
        </NavLink>
        <nav aria-label="Main" className="h-nav">
          <NavLink href={links.treatments} className="h-btn small glass h-desk">Treatments and prices</NavLink>
          <NavLink href={links.doctor} className="h-btn small glass h-desk">{siteConfig.dentist.short}</NavLink>
          <a href={siteConfig.directionsLink} target="_blank" rel="noopener noreferrer" className="h-btn small glass h-desk">Get directions</a>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="h-btn small glass h-desk">WhatsApp the clinic</a>
          <a href={TEL} className="h-btn small glass icon" aria-label={`Call the clinic, ${PHONE_SHOWN}`}>
            <Phone className="h-icon" aria-hidden="true" />
          </a>
          <BookButton className="h-btn small amber on-dark h-not-phone" />
          <button type="button" className="h-btn small glass icon h-menu-btn" aria-label={open ? 'Close menu' : 'Menu'}
            aria-expanded={open} aria-controls="h-menu" onClick={() => setOpen(!open)}>
            {open ? <X className="h-icon" aria-hidden="true" /> : <Menu className="h-icon" aria-hidden="true" />}
          </button>
        </nav>
      </div>
      {open && (
        <nav id="h-menu" aria-label="Menu" className="h-sheet">
          <div className="h-wrap h-sheet-list">
            <BookButton className="h-sheet-link primary" onClick={close} />
            <NavLink href={links.treatments} className="h-sheet-link" onClick={close}>Treatments and prices</NavLink>
            <NavLink href={links.doctor} className="h-sheet-link" onClick={close}>{siteConfig.dentist.short}</NavLink>
            <a href={siteConfig.directionsLink} target="_blank" rel="noopener noreferrer" className="h-sheet-link" onClick={close}>Get directions</a>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="h-sheet-link" onClick={close}>WhatsApp the clinic</a>
            <a href={TEL} className="h-sheet-link" onClick={close}>Call {PHONE_SHOWN}</a>
          </div>
        </nav>
      )}
    </header>
  )
}
