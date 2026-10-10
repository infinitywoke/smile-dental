// Guesses "How did you hear about us?" from where a visitor came from, so most people
// don't have to answer. The booking form shows it as a pre-selected option they can change.

const OWN_SITE_HINTS = ['vercel.app', 'localhost', 'smiledental']

// `referrer` is document.referrer; `utmSource` is the utm_source link parameter
export function guessHeardFrom(referrer: string | null | undefined, utmSource?: string | null): string {
  const source = (utmSource ?? '').toLowerCase().trim()
  if (source) {
    if (/google|gmb|gbp|maps/.test(source)) return 'Google'
    if (/insta|^ig$/.test(source)) return 'Instagram'
    if (/facebook|^fb$/.test(source)) return 'Facebook'
    if (/whatsapp|^wa$/.test(source)) return 'WhatsApp'
  }

  let host = ''
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : ''
  } catch {
    host = ''
  }
  if (!host || OWN_SITE_HINTS.some((hint) => host.includes(hint))) return ''

  if (/(^|\.)google\.[a-z.]+$/.test(host) || host === 'goo.gl' || host.endsWith('.goo.gl') || host === 'g.page') return 'Google'
  if (/(^|\.)(instagram\.com|l\.instagram\.com)$/.test(host)) return 'Instagram'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com)$/.test(host)) return 'Facebook'
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return 'WhatsApp'
  if (/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org)$/.test(host)) return 'Google'
  return ''
}
