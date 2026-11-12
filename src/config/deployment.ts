// A deployment that serves only a clinic's website, such as one on Cloudflare (scripts/build-website.mjs sets
// this when it builds): Clinic OS is at siteConfig.clinicOsUrl, and its paths there go to it
// (src/config/redirects.ts). Read at build time, so the browser's code knows it too.
export const WEBSITE_ONLY = process.env.NEXT_PUBLIC_WEBSITE_ONLY === '1'
