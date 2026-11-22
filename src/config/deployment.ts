// A deployment that serves only a clinic's website, such as one on Cloudflare (scripts/build-website.mjs sets
// this when it builds): Clinic OS is at siteConfig.clinicOsUrl, and its paths there go to it
// (src/config/redirects.ts). Read at build time, so the browser's code knows it too.
export const WEBSITE_ONLY = process.env.NEXT_PUBLIC_WEBSITE_ONLY === '1'

// How long the website's cached parts last (the footer's year, the price list): cacheLife(WEBSITE_CACHE).
// On Cloudflare nothing can refresh them between deploys, and an expired one makes the Worker render the
// page on the visit, which hangs there (22 Nov 2026: every page 500, error 1101, a week after the deploy,
// when the footer's 'days' expired). So there they never go stale, and a deploy is what updates them. With
// Clinic OS (Vercel) they are made again hourly, like the 'hours' preset.
export const WEBSITE_CACHE = WEBSITE_ONLY
  ? { stale: 300, revalidate: 60 * 60 * 24 * 365 * 10 }
  : { stale: 300, revalidate: 60 * 60, expire: 60 * 60 * 24 }
