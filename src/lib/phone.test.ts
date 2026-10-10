import { describe, expect, it } from 'vitest'
import { formatPhone, isValidPhone, normalizePhone } from './phone'

describe('normalizePhone', () => {
  it.each([
    ['+91 98450 21763', '9845021763'],
    ['098450 21763', '9845021763'],
    ['9845021763', '9845021763'],
    ['91-98450-21763', '9845021763'],
    ['+91-98450-21763', '9845021763'],
    ['(98450) 21763', '9845021763'],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it('returns null for empty input', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
    expect(normalizePhone('no digits')).toBeNull()
  })

  it('keeps short numbers as digits so validation can reject them', () => {
    expect(normalizePhone('98450')).toBe('98450')
    expect(isValidPhone(normalizePhone('98450'))).toBe(false)
  })

  it('does not strip a leading 91 from a 10-digit number', () => {
    expect(normalizePhone('9198450217')).toBe('9198450217')
  })
})

describe('isValidPhone', () => {
  it('accepts 10-digit mobiles starting 6 to 9', () => {
    for (const phone of ['6000000000', '7012345678', '8123456789', '9845021763']) {
      expect(isValidPhone(phone)).toBe(true)
    }
  })

  it('rejects numbers starting 0 to 5', () => {
    for (const phone of ['0845021763', '1845021763', '5845021763']) {
      expect(isValidPhone(phone)).toBe(false)
    }
  })

  it('rejects wrong lengths, formatting and empty values', () => {
    expect(isValidPhone('984502176')).toBe(false)
    expect(isValidPhone('98450217631')).toBe(false)
    expect(isValidPhone('98450 21763')).toBe(false)
    expect(isValidPhone('')).toBe(false)
    expect(isValidPhone(null)).toBe(false)
  })

  it('accepts every format normalizePhone understands', () => {
    expect(isValidPhone(normalizePhone('+91 98450 21763'))).toBe(true)
    expect(isValidPhone(normalizePhone('098450 21763'))).toBe(true)
  })
})

describe('formatPhone', () => {
  it('splits a 10-digit number 5 + 5', () => {
    expect(formatPhone('9845021763')).toBe('98450 21763')
  })

  it('leaves other lengths as they are', () => {
    expect(formatPhone('98450')).toBe('98450')
    expect(formatPhone('919845021763')).toBe('919845021763')
  })

  it('returns an empty string for missing numbers', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone(null)).toBe('')
    expect(formatPhone(undefined)).toBe('')
  })

  it('round-trips through normalizePhone', () => {
    expect(normalizePhone(formatPhone('9845021763'))).toBe('9845021763')
  })
})
