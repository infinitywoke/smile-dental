import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { checkAgainstTranscript, checkSorted, notesText, priceListWithIds, smartNotesInstructions } = await import('./smart-notes')

describe('smart notes', () => {
  it('the instructions list price-list items by ID, names only (no prices), and ask for best guesses marked (?)', () => {
    const text = smartNotesInstructions()
    expect(text).toContain('"(?)"')
    expect(text).toContain('NOT_ON_LIST')
    expect(text).toContain('P1 | Consultation | Standard Consultation')
    expect(text).not.toMatch(/₹|\/-/)
  })

  it('keeps only real price-list items and the clinic lengths', () => {
    const rct = priceListWithIds().find((x) => x.option.slug === 'root-canal-treatment')!
    const sorted = checkSorted({
      complaint: ' Pain ', findings: 'Caries 46', treatment: 'RCT started', prescription: ['Amoxicillin 500 - TDS - 5 days', ''], advice: '',
      charges: [{ id: rct.id, teeth: '46', confidence: 'guess' }, { id: 'P999' }, { id: 7 }],
      not_on_list: ['gum flap surgery on 36', ''],
      unclear: ['the medicine name after tablet'],
      next_visit: { in_days: 7, length_minutes: 60, why: 'second sitting' },
    })
    expect(sorted.complaint).toBe('Pain')
    expect(sorted.prescription).toEqual(['Amoxicillin 500 - TDS - 5 days'])
    expect(sorted.charges.map((c) => c.option.slug)).toEqual(['root-canal-treatment'])
    expect(sorted.charges[0].guess).toBe(true)
    expect(sorted.notOnList).toEqual(['gum flap surgery on 36'])
    expect(sorted.unclear).toEqual(['the medicine name after tablet'])
    expect(sorted.nextVisit).toEqual({ inDays: 7, minutes: 60, why: 'second sitting' })
    expect(checkSorted({ next_visit: { in_days: 7, length_minutes: 45 } }).nextVisit?.minutes).toBe(45)
    expect(checkSorted({ next_visit: { in_days: 7, length_minutes: 47 } }).nextVisit).toBeNull()
    expect(checkSorted('nonsense').charges).toEqual([])
  })

  it('writes the notes in headed sections, a point a line, a blank line between, leaving out empty ones', () => {
    const text = notesText(checkSorted({
      complaint: 'pain', findings: ['46: deep caries.', '47: food lodgement'], treatment: ['46: RCT started'],
      prescription: ['Amoxicillin 500 - TDS - 5 days'], advice: ['soft food for a day'], charges: [],
    }))
    expect(text).toBe([
      'Complaint: Pain',
      'Findings:\n- 46: deep caries\n- 47: food lodgement',
      'Treatment done:\n- 46: RCT started',
      'Prescription:\n- Amoxicillin 500 - TDS - 5 days',
      'Advice:\n- Soft food for a day',
    ].join('\n\n'))
    // An older answer with plain text is kept as one point
    expect(notesText(checkSorted({ findings: 'Caries 46' }))).toBe('Findings:\n- Caries 46')
  })

  it('tells Gemini to keep only his corrected words and to spell his own medicines his way', () => {
    const text = smartNotesInstructions(['Augmentin 625', 'Ketorol DT'])
    expect(text).toContain('keep only\n  the corrected version')
    expect(text).toContain('TRANSCRIPT')
    expect(text).toContain('- Augmentin 625\n- Ketorol DT')
  })

  it('marks a medicine the transcript does not have, and lists it to check', () => {
    const sorted = checkAgainstTranscript(checkSorted({
      transcript: 'Amoxicillin five hundred three times a day for five days',
      prescription: ['Amoxicillin 500 mg - three times a day - 5 days', 'Pantoprazole 40 mg - before breakfast - 5 days'],
    }))
    expect(sorted.prescription).toEqual(['Amoxicillin 500 mg - three times a day - 5 days', 'Pantoprazole (?) 40 mg - before breakfast - 5 days'])
    expect(sorted.unclear).toEqual(['Check "Pantoprazole": it isn\'t clearly in the recording'])
    // With no transcript there is nothing to check against
    expect(checkAgainstTranscript(checkSorted({ prescription: ['Pantoprazole 40 mg'] })).prescription).toEqual(['Pantoprazole 40 mg'])
  })
})
