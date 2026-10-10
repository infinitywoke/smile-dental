import { describe, expect, it } from 'vitest'
import { prakashVisit1 } from './fixtures'
import { FDI_TEETH, isFdiTooth, parseVisitSummary, SUMMARY_VERSION, type VisitSummary } from './visit-summary'

// Deep copy with changes, so each test starts from the valid worked example
function variant(change: (s: VisitSummary) => void): unknown {
  const copy = structuredClone(prakashVisit1)
  change(copy)
  return copy
}

function errorOf(json: unknown): string {
  const result = parseVisitSummary(json)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}

describe('parseVisitSummary', () => {
  it('accepts the Prakash worked example unchanged', () => {
    const result = parseVisitSummary(prakashVisit1)
    expect(result).toEqual({ ok: true, summary: prakashVisit1 })
    if (!result.ok) return
    expect(result.summary.plan[1]).toMatchObject({ price: null, price_min: 3499, price_max: 9999 })
    expect(result.summary.medicines[0].name).toBe('Amoxicillin')
    expect(result.summary.next_visit).toMatchObject({ date: '2026-10-15', time: '18:00' })
    expect(result.summary.payment).toEqual({ collected: 4200, method: 'upi', advance: null, balance_next_visit: null })
  })

  it('accepts the JSON round trip (as stored in visits.summary)', () => {
    expect(parseVisitSummary(JSON.parse(JSON.stringify(prakashVisit1))).ok).toBe(true)
  })

  it('accepts a minimal summary with nothing to report', () => {
    const empty: VisitSummary = {
      tidy_note: 'Routine check-up. No complaints.',
      complaint: '',
      findings: '',
      teeth: [],
      diagnoses: [],
      procedures_done: [],
      plan: [],
      medicines: [],
      aftercare: [],
      next_visit: null,
      payment: null,
      patient_updates: null,
      warnings: [],
      unclear: [],
    }
    expect(parseVisitSummary(empty)).toEqual({ ok: true, summary: empty })
  })

  it('accepts visit 2: decided crown and an advance', () => {
    const visit2 = variant((s) => {
      s.plan = [{ tooth: '46', procedure: 'Ivoclar zirconia crown', price: 7499, price_min: null, price_max: null }]
      s.payment = { collected: 3000, method: 'cash', advance: 3000, balance_next_visit: null }
      s.next_visit = { when_text: 'Review in 5 to 7 days', date: '', time: '', within_days: 7 }
    })
    expect(parseVisitSummary(visit2).ok).toBe(true)
  })

  it('accepts primary teeth', () => {
    expect(parseVisitSummary(variant((s) => { s.teeth = [{ tooth: '85', note: 'Caries' }] })).ok).toBe(true)
  })

  it('rejects tooth numbers that are not FDI, naming the field', () => {
    const error = errorOf(variant((s) => { s.teeth[0].tooth = '49' as never }))
    expect(error).toContain('teeth.0.tooth')
    expect(error).toContain('"49" is not an FDI tooth number')

    expect(errorOf(variant((s) => { s.plan[1].tooth = '19' as never }))).toContain('plan.1.tooth')
    expect(errorOf(variant((s) => { s.diagnoses[0].tooth = '56' as never }))).toContain('"56" is not an FDI tooth number')
    // Teeth without a specific tooth use '', which is only allowed where a tooth is optional
    expect(errorOf(variant((s) => { s.teeth[0].tooth = '' as never }))).toContain('teeth.0.tooth')
  })

  it('rejects a tooth given as a number', () => {
    expect(errorOf(variant((s) => { s.teeth[0].tooth = 46 as never }))).toContain('"46" is not an FDI tooth number')
  })

  it('rejects wrong types with readable paths', () => {
    expect(errorOf(variant((s) => { s.procedures_done[2].amount = '3,500' as never })))
      .toMatch(/procedures_done\.2\.amount: .*expected number, received string/)
    expect(errorOf(variant((s) => { s.medicines = 'Amoxicillin' as never })))
      .toMatch(/medicines: .*expected array, received string/)
    expect(errorOf(variant((s) => { s.payment = { ...s.payment!, method: 'card' as never } })))
      .toContain('payment.method')
  })

  it('rejects negative money', () => {
    expect(errorOf(variant((s) => { s.payment!.collected = -200 }))).toContain('payment.collected')
  })

  it('rejects dates and times in other formats', () => {
    expect(errorOf(variant((s) => { s.next_visit!.date = '15/10/2026' }))).toContain('next_visit.date: Use YYYY-MM-DD or empty')
    expect(errorOf(variant((s) => { s.next_visit!.time = '6 PM' }))).toContain('next_visit.time: Use 24-hour HH:MM or empty')
    expect(errorOf(variant((s) => { s.next_visit!.time = '24:00' }))).toContain('next_visit.time')
  })

  it('requires every key, using null or empty rather than leaving keys out', () => {
    expect(errorOf(variant((s) => { Reflect.deleteProperty(s, 'warnings') }))).toMatch(/^warnings: /)
    expect(errorOf(variant((s) => { Reflect.deleteProperty(s.plan[1], 'price') }))).toContain('plan.1.price')
    // Text uses '' for "none", so null is a mistake there
    expect(errorOf(variant((s) => { s.complaint = null as never }))).toContain('complaint')
  })

  it('reports several problems at once', () => {
    const error = errorOf(variant((s) => {
      s.teeth[0].tooth = '99' as never
      s.payment!.collected = '4200' as never
    }))
    expect(error).toContain('teeth.0.tooth')
    expect(error).toContain('payment.collected')
  })

  it('rejects things that are not a summary', () => {
    expect(errorOf(null)).toMatch(/expected object/)
    expect(errorOf('tidy note')).toMatch(/expected object/)
  })

  it('is version 1', () => {
    expect(SUMMARY_VERSION).toBe(1)
  })
})

describe('isFdiTooth', () => {
  it('accepts every permanent and primary tooth', () => {
    expect(FDI_TEETH).toHaveLength(52)
    for (const t of ['11', '18', '21', '28', '31', '38', '41', '46', '48', '51', '55', '61', '65', '71', '75', '81', '85']) {
      expect(isFdiTooth(t)).toBe(true)
    }
  })

  it('rejects numbers outside the FDI ranges', () => {
    for (const t of ['10', '19', '20', '29', '30', '39', '40', '49', '50', '56', '60', '66', '70', '76', '80', '86', '90', '99', '00', '1', '9']) {
      expect(isFdiTooth(t), t).toBe(false)
    }
  })

  it('rejects anything that is not exactly a two-digit string', () => {
    for (const t of [46, '046', ' 46', '46 ', '4 6', '46a', '', null, undefined, {}, ['46']]) {
      expect(isFdiTooth(t), JSON.stringify(t)).toBe(false)
    }
  })
})
