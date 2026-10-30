import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// src/config/site.ts is the Smile Dental website's content. Clinic OS speaks for whichever clinic is signed in,
// so it reads a clinic's details from the database (src/lib/data/clinic.ts), and a read from siteConfig here
// would show one clinic's phone to another clinic's patients. The product addresses are the same for every
// clinic, so siteConfig.clinicOsUrl and siteConfig.url are allowed.

const ROOT = join(process.cwd(), 'src')
const FOLDERS = ['app/app', 'app/r', 'app/login', 'components/clinic', 'lib/data', 'lib/actions']
const FILES = ['components/SharedPrescription.tsx', 'lib/whatsapp.ts', 'lib/billing.ts', 'lib/upi.ts', 'lib/prescription-image.ts', 'lib/tally-ledgers.ts', 'lib/tally.ts', 'lib/smart-notes.ts']
// The website's booking form: Smile Dental's own website content
const NOT_CLINIC_OS = ['lib/actions/booking.ts']

const DETAILS = ['name', 'phone', 'whatsapp', 'email', 'address', 'dentist', 'payments', 'tally', 'chairMonitor', 'reviewRequestLink', 'googleReviewsLink', 'directionsLink', 'media']
const READ = new RegExp(`siteConfig\\??\\.(${DETAILS.join('|')})\\b`)

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry) && !entry.includes('.test.') ? [path] : []
  })
}

const name = (path: string) => relative(ROOT, path).split(sep).join('/')

describe("Clinic OS speaks for the signed-in clinic, never from the website's content", () => {
  const files = [...FOLDERS.flatMap((f) => sourceFiles(join(ROOT, f))), ...FILES.map((f) => join(ROOT, f))]
    .filter((path) => !NOT_CLINIC_OS.includes(name(path)))

  it('looks at the files it means to', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.map(name)).toContain('lib/whatsapp.ts')
    expect(files.map(name)).toContain('app/app/page.tsx')
  })

  it("reads no clinic's details from siteConfig", () => {
    const found = files.flatMap((path) => readFileSync(path, 'utf8').split('\n')
      .flatMap((line, i) => (READ.test(line) ? [`${name(path)}:${i + 1}: ${line.trim()}`] : [])))
    expect(found).toEqual([])
  })

  it('catches a read, and lets the product addresses through', () => {
    expect(READ.test('`${siteConfig.phone}`')).toBe(true)
    expect(READ.test('siteConfig.dentist.name')).toBe(true)
    expect(READ.test('siteConfig.clinicOsUrl')).toBe(false)
    expect(READ.test('siteConfig.url')).toBe(false)
  })
})
