import { siteConfig } from '@/config/site'
import { OPEN_SESSIONS } from '@/lib/clinic-hours'
import { formatPhone, normalizePhone } from '@/lib/phone'
import { formatBlock } from '@/lib/schedule'

// Where the new website lives: at /preview until it replaces the old one, then at /
export const HOME: string = '/preview'
export const sitePath = (path: string) => (HOME === '/' ? path : `${HOME}${path}`)

// The clinic's phone, WhatsApp and hours, as every page shows them
export const TEL = `tel:${siteConfig.phone.replace(/[^\d+]/g, '')}`
export const PHONE_SHOWN = `+91 ${formatPhone(normalizePhone(siteConfig.phone) ?? siteConfig.phone)}`
export const WHATSAPP = `https://wa.me/${siteConfig.whatsapp.replace(/\D/g, '')}`
export const HOURS = OPEN_SESSIONS.map(([from, until]) => `${formatBlock(from)} – ${formatBlock(until)}`)

// Where the site's links go from a page: on the homepage, to its own sections; elsewhere, to the page
// or the homepage section. Book is the card on the page itself where there is one (home and booking).
export function linksFor(pathname: string) {
  const onHome = pathname === HOME
  return {
    home: onHome ? '#top' : HOME,
    book: onHome || pathname === sitePath('/book') ? '#book' : sitePath('/book'),
    treatments: onHome ? '#treatments' : sitePath('/treatments'),
    doctor: onHome ? '#doctor' : `${HOME}#doctor`,
  }
}
