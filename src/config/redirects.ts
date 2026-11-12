import { AGENT_FILES } from './agents'
import { siteConfig } from './site'

// The website and Clinic OS run from one deployment that answers on two addresses: the clinic's own
// domain (siteConfig.url) and Clinic OS's (siteConfig.clinicOsUrl). Each address shows only its own part:
// - on Clinic OS's address, the website's pages go to the clinic's domain, permanently, so search engines
//   move them there (a link's query, like the Google profile's ?utm_source=google, goes along);
// - on the clinic's domain, Clinic OS, sign-in, patients' links and the API go to Clinic OS's address,
//   temporarily, because Clinic OS will move to an address of its own.
// Anywhere else (a test server, a preview) both parts still answer on one address.

export const WEBSITE_PAGES = ['/', '/book', '/treatments', '/treatments/:slug', '/privacy']
export const CLINIC_OS_PATHS = ['/app', '/app/:path*', '/login', '/auth/:path*', '/r/:path*', '/api/:path*']

const hostOf = (url: string) => new URL(url).host
// A host as Next matches it: a pattern, so its dots must be taken literally
const exactly = (host: string) => host.replace(/\./g, '\\.')

// The website's addresses: the main one, and the same without "www" (Vercel already sends that one to the
// main address; it is listed in case it ever reaches the app)
export function websiteHosts(): string[] {
  const main = hostOf(siteConfig.url)
  return [...new Set([main, main.replace(/^www\./, '')])]
}

// A deployment of the website alone (src/config/deployment.ts): Clinic OS's paths go to Clinic OS's address
// whatever the host, and the address without "www" goes to the main one, for good
export function websiteOnlyRedirects() {
  return [
    ...websiteHosts().slice(1).map((host) => ({
      source: '/:path*',
      has: [{ type: 'host' as const, value: exactly(host) }],
      destination: `${siteConfig.url}/:path*`,
      permanent: true,
    })),
    ...CLINIC_OS_PATHS.map((source) => ({ source, destination: `${siteConfig.clinicOsUrl}${source}`, permanent: false })),
  ]
}

export function hostRedirects() {
  const clinicOsHost = hostOf(siteConfig.clinicOsUrl)
  if (websiteHosts().includes(clinicOsHost)) return []
  return [
    // The website's pages, and what it has for AI agents (llms.txt and the pages' Markdown copies)
    ...[...WEBSITE_PAGES, ...AGENT_FILES].map((source) => ({
      source,
      has: [{ type: 'host' as const, value: exactly(clinicOsHost) }],
      destination: `${siteConfig.url}${source}`,
      permanent: true,
    })),
    ...websiteHosts().flatMap((host) => CLINIC_OS_PATHS.map((source) => ({
      source,
      has: [{ type: 'host' as const, value: exactly(host) }],
      destination: `${siteConfig.clinicOsUrl}${source}`,
      permanent: false,
    }))),
  ]
}
