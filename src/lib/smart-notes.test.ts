import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { checkSorted, notesText, priceListWithIds, smartNotesInstructions } = await import('./smart-notes')

describe('smart notes', () => {
  it('the instructions list price-list items by ID, names only (no prices)', () => {
    const text = smartNotesInstructions()
    expect(text).toContain('P1 | Consultation | Standard Consultation')
    expect(text).not.toMatch(/₹|\/-/)
  })

  it('keeps only real price-list items and the clinic lengths', () => {
    const rct = priceListWithIds().find((x) => x.option.slug === 'root-canal-treatment')!
    const sorted = checkSorted({
      complaint: ' Pain ', findings: 'Caries 46', treatment: 'RCT started', prescription: ['Amoxicillin 500 - TDS - 5 days', ''], advice: '',
      charges: [{ id: rct.id, teeth: '46' }, { id: 'P999' }, { id: 7 }],
      next_visit: { in_days: 7, length_minutes: 60, why: 'second sitting' },
    })
    expect(sorted.complaint).toBe('Pain')
    expect(sorted.prescription).toEqual(['Amoxicillin 500 - TDS - 5 days'])
    expect(sorted.charges.map((c) => c.option.slug)).toEqual(['root-canal-treatment'])
    expect(sorted.nextVisit).toEqual({ inDays: 7, minutes: 60, why: 'second sitting' })
    expect(checkSorted({ next_visit: { in_days: 7, length_minutes: 45 } }).nextVisit).toBeNull()
    expect(checkSorted('nonsense').charges).toEqual([])
  })

  it('writes the notes in sections, leaving out empty ones', () => {
    const text = notesText(checkSorted({ complaint: 'Pain', findings: '', treatment: 'RCT started', prescription: ['Amoxicillin 500 - TDS - 5 days'], advice: '', charges: [] }))
    expect(text).toBe('Complaint: Pain\nTreatment: RCT started\nPrescription:\n- Amoxicillin 500 - TDS - 5 days')
  })
})
