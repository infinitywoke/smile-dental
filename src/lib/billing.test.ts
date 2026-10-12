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
  it('works out what is still due, with what other visits owe', () => {
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
  const nextVisit = { starts_at: '2026-10-15T12:30:00.000Z' } // Thu 15 Oct, 6:00 PM in India

  it('lays out the bill, a part payment, the next visit and a photo link, with headings', () => {
    const text = visitMessage({
      patientName: 'Prakash Shetty',
      visitDate: '2026-10-12',
      lines: [
        { description: 'Root canal treatment (46)', amount: 3500 },
        { description: 'X-ray', amount: 200 },
      ],
      payments: [{ amount: 2000, method: 'upi' }],
      summary: summarise({ charges: [{ amount: 3500 }, { amount: 200 }], payments: [{ amount: 2000 }], earlier: 0 }),
      nextAppointment: nextVisit,
      photos: [{ label: 'Prescription', url: 'https://example.com/p.jpg' }],
    })
    expect(text).toBe(
      [
        '*Smile Dental Clinic*',
        '_Dr. Rahil Yusuf, BDS_',
        '',
        'Dear Prakash,',
        'Thank you for visiting us on 12 Oct 2026.',
        '',
        '*Treatment & charges*',
        '- Root canal treatment (46): ₹3,500',
        '- X-ray: ₹200',
        '*Total: ₹3,700*',
        '',
        '*Payment*',
        'Paid: ₹2,000 (UPI)',
        '*Balance due: ₹1,700*',
        '',
        '*Next appointment*',
        '📅 *Thursday, 15 October*',
        '🕗 *6:00 PM*',
        '📍 1st Floor, YM Zohara Building, Shirva Road, Katapadi',
        '',
        '*Your photo* _(the link works for 30 days)_',
        '- Prescription: https://example.com/p.jpg',
        '',
        'For any questions, call or WhatsApp us on +91 6361816711.',
        '',
        'Warm regards,',
        '*Dr. Rahil Yusuf*',
        'Smile Dental Clinic, Katapadi',
      ].join('\n'),
    )
    expect(text).not.toContain('Shetty')
  })

  it('leaves out empty sections: only a next appointment still reads well', () => {
    const text = visitMessage({ patientName: 'Prakash Shetty', visitDate: '2026-10-12', nextAppointment: nextVisit })
    expect(text).toContain('Dear Prakash,')
    expect(text).toContain('*Next appointment*')
    expect(text).not.toContain('*Treatment & charges*')
    expect(text).not.toContain('*Payment*')
    expect(text).not.toContain('*Your photo')
    expect(text).toContain('Warm regards,')
  })

  it('a visit with nothing but a prescription sent as a photo has no sections and no links', () => {
    const text = visitMessage({ patientName: 'Asha Rao', visitDate: '2026-10-12', lines: [], payments: [], photos: [] })
    expect(text).not.toMatch(/https?:\/\//)
    expect(text).not.toContain('*Payment*')
    expect(text).not.toContain('*Next appointment*')
    expect(text).toContain('Thank you for visiting us on 12 Oct 2026.')
  })

  it('names money owed from other visits as such, with the total due', () => {
    const summary = summarise({ charges: [{ amount: 1000 }], payments: [{ amount: 800 }], earlier: 500 })
    const text = visitMessage({
      patientName: 'Prakash Shetty',
      visitDate: '2026-10-12',
      lines: [{ description: 'Filling', amount: 1000 }],
      payments: [{ amount: 800, method: 'cash' }],
      summary,
    })
    expect(text).toContain('Paid: ₹800 (Cash)')
    expect(text).toContain('*Balance due: ₹200*')
    expect(text).toContain('Due from other visits: ₹500')
    expect(text).toContain('*Total due: ₹700*')
  })

  it('says paid in full, or an advance, in bold', () => {
    const paid = visitMessage({
      patientName: 'Asha', visitDate: '2026-10-12', lines: [{ description: 'Scaling', amount: 800 }],
      payments: [{ amount: 500, method: 'cash' }, { amount: 300, method: 'upi' }],
      summary: summarise({ charges: [{ amount: 800 }], payments: [{ amount: 800 }], earlier: 0 }),
    })
    expect(paid).toContain('Paid: ₹800 (Cash + UPI)')
    expect(paid).toContain('*Paid in full.* Thank you!')
    expect(paid).not.toContain('Balance due')

    const advance = visitMessage({
      patientName: 'Asha', visitDate: '2026-10-12', payments: [{ amount: 2000, method: 'upi' }],
      summary: summarise({ charges: [], payments: [{ amount: 2000 }], earlier: 0 }),
    })
    expect(advance).not.toContain('*Treatment & charges*')
    expect(advance).toContain('*Advance with us: ₹2,000*')
  })

  it('names each photo by its kind and numbers repeats', () => {
    const text = visitMessage({
      patientName: 'Asha Rao',
      visitDate: '2026-10-12',
      photos: [
        { label: 'Prescription', url: 'https://x/1' },
        { label: 'X-ray', url: 'https://x/2' },
        { label: 'X-ray', url: 'https://x/3' },
      ],
    })
    expect(text).toContain('*Your photos* _(the links work for 30 days)_')
    expect(text).toContain('- Prescription: https://x/1')
    expect(text).toContain('- X-ray 1: https://x/2')
    expect(text).toContain('- X-ray 2: https://x/3')
  })

  it('uses the first name only, never anything else about the patient', () => {
    const text = visitMessage({ patientName: 'Asha Rao', visitDate: '2026-10-12' })
    expect(text).toContain('Dear Asha,')
    expect(text).not.toContain('Rao')
    expect(text).not.toMatch(/\b(Mr|Mrs|Ms|male|female)\b/i)
  })
})

