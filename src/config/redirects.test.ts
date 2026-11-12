import { describe, expect, it } from 'vitest'
import { CLINIC_OS_PATHS, hostRedirects, WEBSITE_PAGES, websiteHosts, websiteOnlyRedirects } from './redirects'
import { siteConfig } from './site'

// One deployment, two addresses: each shows only its own part
const rules = hostRedirects()
const on = (host: string) => rules.filter((r) => r.has[0].value === host.replace(/\./g, '\\.'))

describe('the two addresses', () => {
  it('are the clinic domain (with and without www) and Clinic OS on Vercel', () => {
    expect(websiteHosts()).toEqual(['www.smiledentalkatapadi.com', 'smiledentalkatapadi.com'])
    expect(siteConfig.clinicOsUrl).toBe('https://smile-dental-hin3.vercel.app')
  })

  it("send the website's pages on Clinic OS's address to the clinic's domain, for good", () => {
    const moved = on('smile-dental-hin3.vercel.app')
    expect(moved.map((r) => [r.source, r.destination])).toEqual([
      ['/', 'https://www.smiledentalkatapadi.com/'],
      ['/book', 'https://www.smiledentalkatapadi.com/book'],
      ['/treatments', 'https://www.smiledentalkatapadi.com/treatments'],
      ['/treatments/:slug', 'https://www.smiledentalkatapadi.com/treatments/:slug'],
      ['/privacy', 'https://www.smiledentalkatapadi.com/privacy'],
      ['/llms.txt', 'https://www.smiledentalkatapadi.com/llms.txt'],
      ['/llms-full.txt', 'https://www.smiledentalkatapadi.com/llms-full.txt'],
      ['/index.md', 'https://www.smiledentalkatapadi.com/index.md'],
      ['/book.md', 'https://www.smiledentalkatapadi.com/book.md'],
      ['/treatments.md', 'https://www.smiledentalkatapadi.com/treatments.md'],
      ['/treatments/:slug.md', 'https://www.smiledentalkatapadi.com/treatments/:slug.md'],
    ])
    expect(moved.every((r) => r.permanent)).toBe(true)
    // Clinic OS itself stays on its address
    expect(moved.some((r) => CLINIC_OS_PATHS.includes(r.source))).toBe(false)
  })

  it("send Clinic OS, sign-in, patients' links and the API on the clinic's domain to Clinic OS, for now", () => {
    for (const host of websiteHosts()) {
      const sent = on(host)
      expect(sent.map((r) => [r.source, r.destination])).toEqual(CLINIC_OS_PATHS.map((p) => [p, `https://smile-dental-hin3.vercel.app${p}`]))
      expect(sent.every((r) => !r.permanent)).toBe(true)
      expect(sent.some((r) => WEBSITE_PAGES.includes(r.source))).toBe(false)
    }
  })

  it('match the host exactly, dots and all, and leave a test server or preview alone', () => {
    expect(rules.every((r) => r.has.length === 1 && r.has[0].type === 'host')).toBe(true)
    expect(new RegExp(`^${on('smile-dental-hin3.vercel.app')[0].has[0].value}$`).test('smile-dental-hin3Xvercel.app')).toBe(false)
    expect(rules.some((r) => /localhost/.test(r.has[0].value))).toBe(false)
  })
})

// A deployment of the website alone (on Cloudflare): no Clinic OS of its own
describe('the website on its own', () => {
  const rules = websiteOnlyRedirects()

  it('sends the address without www to the main one, keeping the page', () => {
    expect(rules[0]).toEqual({
      source: '/:path*',
      has: [{ type: 'host', value: 'smiledentalkatapadi\\.com' }],
      destination: 'https://www.smiledentalkatapadi.com/:path*',
      permanent: true,
    })
  })

  it("sends Clinic OS, sign-in, patients' links and the API to Clinic OS's address, from any address", () => {
    const sent = rules.slice(1)
    expect(sent.map((r) => [r.source, r.destination])).toEqual(CLINIC_OS_PATHS.map((p) => [p, `https://smile-dental-hin3.vercel.app${p}`]))
    expect(sent.every((r) => !r.permanent && !('has' in r))).toBe(true)
  })

  it("never sends the website's own pages away", () => {
    expect(rules.some((r) => WEBSITE_PAGES.includes(r.source))).toBe(false)
  })
})
