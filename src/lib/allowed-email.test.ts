import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAllowedEmail } from './allowed-email'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isAllowedEmail', () => {
  it('allows the exact address', () => {
    vi.stubEnv('ALLOWED_EMAIL', 'doctor@example.com')
    expect(isAllowedEmail('doctor@example.com')).toBe(true)
  })

  it('ignores case and surrounding spaces on both sides', () => {
    vi.stubEnv('ALLOWED_EMAIL', '  Doctor@Example.com ')
    expect(isAllowedEmail('DOCTOR@example.COM')).toBe(true)
    expect(isAllowedEmail('  doctor@example.com\n')).toBe(true)
  })

  it('rejects any other address', () => {
    vi.stubEnv('ALLOWED_EMAIL', 'doctor@example.com')
    expect(isAllowedEmail('someone@example.com')).toBe(false)
    expect(isAllowedEmail('doctor@example.com.evil.test')).toBe(false)
    expect(isAllowedEmail('xdoctor@example.com')).toBe(false)
    expect(isAllowedEmail('')).toBe(false)
  })

  it('rejects a missing email', () => {
    vi.stubEnv('ALLOWED_EMAIL', 'doctor@example.com')
    expect(isAllowedEmail(null)).toBe(false)
    expect(isAllowedEmail(undefined)).toBe(false)
  })

  it('fails closed when ALLOWED_EMAIL is unset', () => {
    vi.stubEnv('ALLOWED_EMAIL', undefined)
    expect(isAllowedEmail('doctor@example.com')).toBe(false)
    expect(isAllowedEmail('')).toBe(false)
    expect(isAllowedEmail(null)).toBe(false)
  })

  it('fails closed when ALLOWED_EMAIL is blank', () => {
    vi.stubEnv('ALLOWED_EMAIL', '')
    expect(isAllowedEmail('')).toBe(false)
    expect(isAllowedEmail('doctor@example.com')).toBe(false)
    vi.stubEnv('ALLOWED_EMAIL', '   ')
    expect(isAllowedEmail('   ')).toBe(false)
    expect(isAllowedEmail('doctor@example.com')).toBe(false)
  })
})
