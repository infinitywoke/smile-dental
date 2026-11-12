import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as brightside from './sites/brightside'

// The website is one template, and each clinic's words live in src/config/sites. A clinic's name in the template
// itself would show on every other clinic's website.

const ROOT = join(process.cwd(), 'src')
const FOLDERS = ['app/(home)', 'components/home', 'components/site', 'app/md', 'app/llms.txt', 'app/llms-full.txt']
const FILES = ['lib/agent-pages.ts', 'lib/structured-data.ts', 'lib/website-whatsapp.ts']
const SMILE_DENTAL = /Rahil|Katapadi|Smile Dental|Yenepoya|Yenapoya|Shirva|6361816711/
// The dentist's pronouns are the clinic's own too (siteConfig.dentist.pronouns)
const PRONOUN = /\b(he|him|his|himself|she|her|herself)\b/i

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) && !entry.includes('.test.') ? [path] : []
  })
}

describe('the website template', () => {
  it("has no clinic's words of its own, nor its dentist's pronouns (comments aside)", () => {
    const files = [...FOLDERS.flatMap((f) => sourceFiles(join(ROOT, f))), ...FILES.map((f) => join(ROOT, f))]
    expect(files.length).toBeGreaterThan(20)
    const found = files.flatMap((path) => readFileSync(path, 'utf8').split('\n').flatMap((line, i) => {
      const words = line.trim()
      const comment = words.startsWith('//') || words.startsWith('*') || words.startsWith('{/*')
      return !comment && (SMILE_DENTAL.test(line) || PRONOUN.test(line)) ? [`${relative(ROOT, path).split(sep).join('/')}:${i + 1}: ${words}`] : []
    }))
    expect(found).toEqual([])
  })

  it("the demo clinic's content has nothing of Smile Dental's", () => {
    const { siteConfig, homeServices, faqs } = brightside
    expect(JSON.stringify({ ...siteConfig, clinicOsUrl: '', homeServices, faqs })).not.toMatch(SMILE_DENTAL)
  })

  it('says it is a demo, and books into the demo clinic', () => {
    expect(brightside.siteConfig.demo).toBe(true)
    expect(brightside.siteConfig.clinicSlug).toMatch(/^demo-/)
    expect(brightside.faqs[0].answer).toContain('invented')
  })
})

describe('a deployment picks its clinic', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("is Smile Dental Clinic's without the setting", async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE', '')
    vi.resetModules()
    const { siteConfig } = await import('./site')
    expect(siteConfig.clinicSlug).toBe('smile-dental-katapadi')
    expect(siteConfig.demo).toBe(false)
  })

  it('is the demo clinic with it, at its own address', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE', 'brightside')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://demo.example')
    vi.resetModules()
    const { siteConfig } = await import('./site')
    expect(siteConfig.clinicSlug).toBe('demo-brightside')
    expect(siteConfig.url).toBe('https://demo.example')
  })
})
