import { describe, expect, it } from 'vitest'
import { newestVisitOwing, parseAmount, patientAccount, paymentsHeldMessage, summarise, sumAmounts, visitMessage, type VisitMoney } from './billing'
import { upiLink } from './upi'

// A visit's money, oldest day first unless said otherwise
const v = (id: string, date: string, charged: number, paid: number, createdAt = '2026-10-01T10:00:00Z'): VisitMoney => ({ id, date, createdAt, charged, paid })
const parts = (account: ReturnType<typeof patientAccount>) => Object.fromEntries(account.dueByVisit)
const sumOfParts = (account: ReturnType<typeof patientAccount>) => sumAmounts([...account.dueByVisit.values()].map((amount) => ({ amount })))

describe('patientAccount (the one money rule)', () => {
  it('the worked example: an advance on day 1 is taken off the crown on day 2 (₹4,499)', () => {
    const account = patientAccount([v('d1', '2026-10-01', 200, 3200), v('d2', '2026-10-02', 7499, 0)])
    expect(account.owed).toBe(4499)
    expect(parts(account)).toEqual({ d1: 0, d2: 4499 })
  })

  it('overpaid, then unpaid: ₹500 in advance and nothing to collect', () => {
    const account = patientAccount([v('d1', '2026-10-01', 1000, 2000), v('d2', '2026-10-02', 500, 0)])
    expect(account.owed).toBe(-500)
    expect(parts(account)).toEqual({ d1: 0, d2: 0 })
  })

  it('an old due paid on a new visit: nothing owed anywhere', () => {
    const account = patientAccount([v('d1', '2026-10-01', 800, 500), v('d2', '2026-10-02', 500, 800)])
    expect(account.owed).toBe(0)
    expect(parts(account)).toEqual({ d1: 0, d2: 0 })
  })

  it('a part payment stays on its own visit', () => {
    const account = patientAccount([v('d1', '2026-10-01', 1000, 400), v('d2', '2026-10-02', 600, 0)])
    expect(account.owed).toBe(1200)
    expect(parts(account)).toEqual({ d1: 600, d2: 600 })
  })

  it('money paid above a bill pays the oldest visit still unpaid first', () => {
    const account = patientAccount([v('d3', '2026-10-03', 0, 400), v('d2', '2026-10-02', 300, 0), v('d1', '2026-10-01', 300, 0)])
    expect(account.owed).toBe(200)
    expect(parts(account)).toEqual({ d1: 0, d2: 200, d3: 0 })
  })

  it('two visits on one day are taken in the order they were started', () => {
    const account = patientAccount([
      v('late', '2026-10-01', 300, 0, '2026-10-01T12:00:00Z'),
      v('early', '2026-10-01', 300, 0, '2026-10-01T09:00:00Z'),
      v('next', '2026-10-02', 0, 300),
    ])
    expect(parts(account)).toEqual({ early: 0, late: 300, next: 0 })
  })

  it('a charge removed after it was paid leaves an advance, not "no bill"', () => {
    const account = patientAccount([v('d1', '2026-10-01', 0, 600)])
    expect(account.owed).toBe(-600)
    expect(parts(account)).toEqual({ d1: 0 })
  })

  it('works in paise: decimals add up exactly', () => {
    const account = patientAccount([v('d1', '2026-10-01', 0.1, 0), v('d2', '2026-10-02', 0.2, 0.15)])
    expect(account.owed).toBe(0.15)
    expect(parts(account)).toEqual({ d1: 0.1, d2: 0.05 })
  })

  it('whenever something is owed, the parts add up to it', () => {
    const cases = [
      [v('a', '2026-10-01', 200, 3200), v('b', '2026-10-02', 7499, 0), v('c', '2026-10-03', 1250.5, 100)],
      [v('a', '2026-10-01', 999.99, 0), v('b', '2026-10-02', 0, 0.01), v('c', '2026-10-03', 10, 5)],
      [v('a', '2026-10-01', 500, 0)],
    ]
    for (const visits of cases) {
      const account = patientAccount(visits)
      expect(account.owed).toBeGreaterThan(0)
      expect(sumOfParts(account)).toBe(account.owed)
    }
    expect(patientAccount([]).owed).toBe(0)
  })

  it('Collect goes to the newest visit that still has a part owed', () => {
    const visits = [v('d1', '2026-10-01', 1000, 400), v('d2', '2026-10-02', 600, 600), v('d3', '2026-10-03', 0, 0)]
    expect(newestVisitOwing(visits, patientAccount(visits))).toBe('d1')
    const settled = [v('d1', '2026-10-01', 100, 100)]
    expect(newestVisitOwing(settled, patientAccount(settled))).toBeNull()
  })
})

describe('paymentsHeldMessage', () => {
  it('names the amounts by method', () => {
    expect(paymentsHeldMessage([{ amount: 1000, method: 'cash' }, { amount: 500, method: 'upi' }])).toBe(
      'This visit holds ₹1,500 in payments (cash ₹1,000, UPI ₹500). If they were a mistake, remove them in Payment first, then delete the visit.',
    )
    expect(paymentsHeldMessage([{ amount: 200, method: 'cash' }])).toContain('holds ₹200 in payments (cash ₹200)')
  })
})

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
  it('this visit, the other visits, and what the patient owes in all', () => {
    const s = summarise({ charges: [{ amount: 1200 }, { amount: 300 }], payments: [{ amount: 1000 }], owed: 1000 })
    expect(s).toEqual({ total: 1500, paid: 1000, balance: 500, earlier: 500, due: 1000 })
  })

  it('shows an advance as a negative balance', () => {
    const s = summarise({ charges: [], payments: [{ amount: 2000 }], owed: -2000 })
    expect(s.balance).toBe(-2000)
    expect(s.due).toBe(-2000)
    expect(s.earlier).toBe(0)
  })

  it('an advance from another visit is taken off this bill', () => {
    const s = summarise({ charges: [{ amount: 7499 }], payments: [], owed: 4499 })
    expect(s).toEqual({ total: 7499, paid: 0, balance: 7499, earlier: -3000, due: 4499 })
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

  it('is friendly and short: no clinic heading and no money, one link to the prescription, photos and bill, the next visit', () => {
    const text = visitMessage({
      patientName: 'Prakash Shetty',
      visitDate: '2026-10-12',
      today: '2026-10-12',
      nextAppointment: nextVisit,
      photoLink: { url: 'https://example.com/r/AbCdEfGhIjKlMnOpQrStUvWxYz012345', labels: ['Prescription', 'X-ray', 'Bill'] },
    })
    expect(text).toBe(
      [
        'Hi Prakash,',
        '',
        'Thank you for coming in today. It was good to see you.',
        '',
        'Your prescription, X-ray and bill are here _(the link works for 30 days)_:',
        'https://example.com/r/AbCdEfGhIjKlMnOpQrStUvWxYz012345',
        '',
        '*Your next appointment*',
        'Date: *Thursday, 15 October*',
        'Time: *6:00 PM*',
        'Address: 1st Floor, YM Zohara Building, Shirva Road, Katapadi',
        '',
        'Any questions? Just call or WhatsApp us on +91 6361816711.',
        '',
        'Take care,',
        '*Dr. Rahil Yusuf*',
        'Smile Dental Clinic, Katapadi',
      ].join('\n'),
    )
    expect(text).not.toContain('Shetty')
    expect(text).not.toContain('₹')
  })

  it('names the day when it is sent later, and leaves out what there is none of', () => {
    const text = visitMessage({ patientName: 'Prakash Shetty', visitDate: '2026-10-12', today: '2026-10-14', nextAppointment: nextVisit })
    expect(text).toContain('Thank you for coming in on 12 Oct 2026.')
    expect(text).toContain('*Your next appointment*')
    expect(text).not.toMatch(/https?:\/\//)
    const none = visitMessage({ patientName: 'Asha Rao', visitDate: '2026-10-12', today: '2026-10-12', photoLink: null })
    expect(none).not.toMatch(/https?:\/\//)
    expect(none).not.toContain('appointment')
  })

  it('one link, named by what it holds', () => {
    const link = (labels: string[]) => visitMessage({ patientName: 'Asha Rao', visitDate: '2026-10-12', photoLink: { url: 'https://x/r/code', labels } })
    expect(link(['Bill'])).toContain('Your bill is here _(the link works for 30 days)_:\nhttps://x/r/code')
    expect(link(['Prescription'])).toContain('Your prescription is here')
    expect(link(['Prescription', 'Bill'])).toContain('Your prescription and bill are here')
    expect(link(['X-ray', 'X-ray', 'Bill'])).toContain('Your X-rays and bill are here')
    expect(link(['Prescription', 'X-ray', 'Lab slip'])).toContain('Your prescription and photos are here')
    expect(link(['X-ray', 'X-ray'])).toContain('Your X-rays are here')
    expect(link(['Prescription', 'X-ray', 'Bill']).match(/https:\/\//g)).toHaveLength(1)
    expect(link([])).not.toContain('https://x/r/code')
  })

  it('uses the first name only, never anything else about the patient', () => {
    const text = visitMessage({ patientName: 'Asha Rao', visitDate: '2026-10-12' })
    expect(text).toContain('Hi Asha,')
    expect(text).not.toContain('Rao')
    expect(text).not.toMatch(/\b(Mr|Mrs|Ms|male|female)\b/i)
  })
})

