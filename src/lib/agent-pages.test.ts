import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { asksForMarkdown, CONTENT_SIGNAL, MARKDOWN_PAGES, markdownRewrites } from '@/config/agents'
import { faqs, siteConfig, treatments } from '@/config/site'
import { homeMarkdown, llmsFullTxt, llmsTxt, markdownPath, pageMarkdown } from './agent-pages'
import { priceForPatients } from './pricing'

// What AI assistants and agents read: llms.txt, the whole site in one file, each page's Markdown copy,
// and robots.txt and security.txt (public/)
const site = siteConfig.url
const priceLine = (detail: string, cost: string) => `- ${detail}: ${priceForPatients(cost)}`
const file = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('the website for AI assistants and agents', () => {
  it('llms.txt is in the llmstxt.org shape and links every page and treatment in Markdown', () => {
    const txt = llmsTxt(treatments)
    const lines = txt.split('\n')
    expect(lines[0]).toBe('# Smile Dental Clinic, Katapadi')
    expect(lines[2]).toMatch(/^> Dental clinic in Katapadi, Udupi/)
    expect(lines[2]).toContain(`${site}/book`)
    for (const path of ['/', '/book', '/treatments', ...treatments.map((t) => `/treatments/${t.slug}`)]) {
      expect(txt).toContain(`(${site}${markdownPath(path)})`)
    }
    // A treatment's one price, or where its options start
    expect(txt).toContain(`- [Root Canal Treatment](${site}/treatments/root-canal-treatment.md): ₹3,500. `)
    expect(txt).toContain(`- [Fillings](${site}/treatments/fillings.md): from ₹300. `)
    expect(txt).toContain('## Optional')
  })

  it("every price on the list is in the whole-site file and the price list's copy, as the pages say it", () => {
    const full = llmsFullTxt(treatments)
    const list = pageMarkdown('/treatments', treatments)!
    for (const t of treatments) {
      expect(list).toContain(`[${t.name}](${site}/treatments/${t.slug})`)
      for (const p of t.pricing ?? []) {
        expect(full).toContain(priceLine(p.detail, p.cost))
        expect(list).toContain(priceLine(p.detail, p.cost))
      }
    }
  })

  it("the homepage's copy has the visit details, how to book and every question", () => {
    const home = homeMarkdown(treatments)
    for (const fact of [siteConfig.phone, siteConfig.email, siteConfig.address, '8:30 AM – 1:00 PM and 2:30 PM – 7:30 PM, every day except Friday', `${site}/book`, '## How booking works']) {
      expect(home).toContain(fact)
    }
    for (const f of faqs.filter((q) => q.isVerified)) expect(home).toContain(`### ${f.question}`)
    expect(home).toContain(`[Book](${site}/book?reason=cleaning)`)
  })

  it("a treatment's copy has its prices and ways to book it; a page with no copy has none", () => {
    const md = pageMarkdown('/treatments/crowns-bridges-zirconia', treatments)!
    expect(md.split('\n')[0]).toBe('# Crowns & Bridges (Zirconia/Emax)')
    expect(md).toContain('- IPS Emax Lithium Disilicate (10 years warranty, balances Beauty and strength): ₹9,999 per crown')
    expect(md).toContain(`(${site}/book?reason=crown)`)
    expect(md).toContain('(https://wa.me/916361816711?text=')
    expect(md).toContain(`- [Crowns & Bridges (Ceramic)](${site}/treatments/crowns-bridges-ceramic)`)
    expect(pageMarkdown('/treatments/whitening', treatments)).toBeNull()
    expect(pageMarkdown('/privacy', treatments)).toBeNull()
  })

  it("a copy answers at the page's address with .md, and at the page itself when asked for Markdown", () => {
    const rules = markdownRewrites()
    for (const { page, markdown, copy } of MARKDOWN_PAGES) {
      expect(rules).toContainEqual({ source: markdown, destination: copy })
      expect(rules).toContainEqual({ source: page, has: asksForMarkdown, destination: copy })
    }
    // Next matches the whole header value
    const asks = new RegExp(`^${asksForMarkdown[0].value}$`)
    expect(asks.test('text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8')).toBe(false)
    expect(asks.test('text/markdown, text/html;q=0.9')).toBe(true)
  })

  it("robots.txt names the AI crawlers, and every group keeps the clinic's app and patients' links out", () => {
    const robots = file('public/robots.txt')
    const groups = robots.split(/\n\s*\n/).map((g) => g.split('\n')).filter((g) => g.some((line) => line.startsWith('User-agent:')))
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect(group).toContain(`Content-Signal: ${CONTENT_SIGNAL}`)
      for (const path of ['/app/', '/login', '/auth/', '/r/', '/api/', '/md/']) expect(group).toContain(`Disallow: ${path}`)
    }
    for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended']) {
      expect(groups[0]).toContain(`User-agent: ${bot}`)
    }
    expect(groups[1]).toContain('User-agent: *')
    expect(robots).toContain(`Sitemap: ${site}/sitemap.xml`)
  })

  it('security.txt names a contact and has not expired: renew it (a year ahead at most) before this fails', () => {
    const txt = file('public/.well-known/security.txt')
    expect(txt).toMatch(/^Contact: mailto:\S+@\S+$/m)
    const days = (new Date(txt.match(/^Expires: (\S+)$/m)![1]).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(30)
    expect(days).toBeLessThanOrEqual(366)
  })
})
