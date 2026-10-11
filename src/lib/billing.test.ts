import { describe, expect, it } from 'vitest'
import { parseAmount, summarise, sumAmounts, visitMessage } from './billing'
import { upiLink } from './upi'

describe('sumAmounts', () => {
  it('adds money without floating-point noise', () => {
    expect(sumAmounts([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3)
    expect(sumAmounts([{ amount: 1200 }, { amount: 350.5 }])).toBe(1550.5)
    expect(sumAmounts([])).toBe(0)
  })
})

describe('parseAmount', () => {
  it('reads amounts typed by hand', () => {
    expect(parseAmount('1250')).toBe(1250)
    expect(parseAmount('1,250')).toBe(1250)
    expect(parseAmount('₹ 1,25,000')).toBe(125000)
    expect(parseAmount('Rs. 99.50')).toBe(99.5)
  })

  it('refuses anything that is not a plain amount', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('12.345')).toBeNull()
    expect(parseAmount('1e5')).toBeNull()
    expect(parseAmount('99999999')).toBeNull()
  })
})

describe('summarise', () => {
  it('works out what is still due, with earlier balance', () => {
    const s = summarise({ charges: [{ amount: 1200 }, { amount: 300 }], payments: [{ amount: 1000 }], earlier: 500 })
    expect(s).toEqual({ total: 1500, paid: 1000, balance: 500, earlier: 500, due: 1000 })
  })

  it('shows an advance as a negative balance', () => {
    const s = summarise({ charges: [], payments: [{ amount: 2000 }], earlier: 0 })
    expect(s.balance).toBe(-2000)
    expect(s.due).toBe(-2000)
  })
})

describe('upiLink', () => {
  it('points at the clinic with the amount filled in', () => {
    const link = upiLink({ amount: 1250, note: 'Smile Dental - Prakash' })
    expect(link).toMatch(/^upi:\/\/pay\?/)
    expect(link).toContain('pa=rahil.yusuf.k-1%40okhdfcbank')
    expect(link).toContain('pn=Smile%20Dental%20Clinic')
    expect(link).toContain('am=1250.00')
    expect(link).toContain('cu=INR')
    expect(link).toContain('tn=Smile%20Dental%20-%20Prakash')
    expect(link).not.toContain('+')
  })

  it('drops risky characters from the note', () => {
    expect(upiLink({ amount: 10, note: 'a&b=c#d' })).toContain('tn=abcd')
  })
})

describe('visitMessage', () => {
  it('combines bill, payments, next appointment and prescription photo link', () => {
    const summary = summarise({ charges: [{ amount: 3500 }], payments: [{ amount: 3500 }], earlier: 0 })
    const text = visitMessage({
      patientName: 'Prakash Shetty',
      visitDate: '2026-10-15',
      lines: [{ description: 'RCT', amount: 3500 }],
      payments: [{ amount: 3500, method: 'upi' }],
      summary,
      nextAppointment: { starts_at: '2026-10-22T05:00:00.000Z' }, // 10:30 AM IST
      photos: [{ label: 'Prescription', url: 'https://example.com/prescription.jpg' }],
    })

    expect(text).toContain('Hello Prakash')
    expect(text).toContain('• RCT: ₹3,500')
    expect(text).toContain('Total: ₹3,500')
    expect(text).toContain('Paid: ₹3,500 (UPI)')
    expect(text).toContain('*Next appointment*')
    expect(text).toContain('10:30 AM')
    expect(text).toContain('Prescription: https://example.com/prescription.jpg')
    expect(text).toContain('– Dr. Rahil Yusuf')
  })

  it('works gracefully when only bill or only next appointment is present', () => {
    const text = visitMessage({
      patientName: 'Prakash Shetty',
      visitDate: '2026-10-15',
      nextAppointment: { starts_at: '2026-10-22T05:00:00.000Z' },
    })
    expect(text).toContain('Hello Prakash')
    expect(text).not.toContain('*Bill*')
    expect(text).toContain('*Next appointment*')
  })
})

describe('visitMessage photos', () => {
  const base = { patientName: 'Asha Rao', visitDate: '2026-10-15' }

  it('names each photo by its kind and numbers repeats', () => {
    const text = visitMessage({
      ...base,
      photos: [
        { label: 'Prescription', url: 'https://x/1' },
        { label: 'X-ray', url: 'https://x/2' },
        { label: 'X-ray', url: 'https://x/3' },
      ],
    })
    expect(text).toContain('*Photos*')
    expect(text).toContain('Prescription: https://x/1')
    expect(text).toContain('X-ray 1: https://x/2')
    expect(text).toContain('X-ray 2: https://x/3')
  })

  it('uses the first name only, never gender, and leaves out photos when none are sent', () => {
    const text = visitMessage({ ...base, photos: [] })
    expect(text).toContain('Hello Asha,')
    expect(text).not.toContain('Rao')
    expect(text).not.toMatch(/(Mr|Mrs|Ms|male|female)/i)
    expect(text).not.toContain('*Photos*')
  })
})
