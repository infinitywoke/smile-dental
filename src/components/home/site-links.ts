import { siteConfig } from '@/config/site'
import { WEBSITE_ONLY } from '@/config/deployment'
import { websiteHosts } from '@/config/redirects'
import { OPEN_SESSIONS } from '@/lib/clinic-hours'
import { formatPhone, normalizePhone } from '@/lib/phone'
import { formatBlock } from '@/lib/schedule'

// The clinic's phone, WhatsApp and hours, as every page shows them
export const TEL = `tel:${siteConfig.phone.replace(/[^\d+]/g, '')}`
export const PHONE_SHOWN = `+91 ${formatPhone(normalizePhone(siteConfig.phone) ?? siteConfig.phone)}`
export const WHATSAPP = `https://wa.me/${siteConfig.whatsapp.replace(/\D/g, '')}`
export const HOURS = OPEN_SESSIONS.map(([from, until]) => `${formatBlock(from)} – ${formatBlock(until)}`)

// Where links into Clinic OS go (a website request's "Open in Clinic OS"), and the Booking API: from the
// clinic's own domain or a deployment of the website alone, straight to Clinic OS's address; on a test server
// or a preview, where both parts share one address, there. In the browser only.
export function clinicOsOrigin(): string {
  return WEBSITE_ONLY || websiteHosts().includes(window.location.host) ? siteConfig.clinicOsUrl : window.location.origin
}

// Where the site's links go from a page: on the homepage, to its own sections; elsewhere, to the page
// or the homepage section. Book is the card on the page itself where there is one (home and booking).
export function linksFor(pathname: string) {
  const onHome = pathname === '/'
  return {
    home: onHome ? '#top' : '/',
    book: onHome || pathname === '/book' ? '#book' : '/book',
    treatments: onHome ? '#treatments' : '/treatments',
    doctor: onHome ? '#doctor' : '/#doctor',
  }
}
