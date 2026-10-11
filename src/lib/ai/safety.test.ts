import { describe, expect, it } from 'vitest'
import { allWarnings, allergyWarnings, toothSideWarnings } from './safety'
import { prakashVisit1 } from './fixtures'

describe('toothSideWarnings', () => {
  it('is quiet when the tooth is on the side that was said (46 is lower right)', () => {
    expect(toothSideWarnings(prakashVisit1)).toEqual([])
  })

  it('asks when the tooth number is on another side', () => {
    const wrong = {
      ...prakashVisit1,
      teeth: [{ tooth: '24' as const, note: 'caries' }],
      diagnoses: [],
      procedures_done: [],
    }
    const [warning] = toothSideWarnings(wrong)
    expect(warning).toContain('lower right')
    expect(warning).toContain('24')
  })

  it('says nothing when no side was mentioned', () => {
    const noSide = { ...prakashVisit1, complaint: 'Pain', findings: 'Deep caries', teeth: [{ tooth: '24' as const, note: '' }] }
    expect(toothSideWarnings(noSide)).toEqual([])
  })
})

describe('allergyWarnings', () => {
  it('flags amoxicillin for a penicillin allergy', () => {
    const [warning] = allergyWarnings('Allergic to penicillin', prakashVisit1)
    expect(warning).toContain('Amoxicillin')
  })

  it('also reads an allergy mentioned in this very note', () => {
    const summary = { ...prakashVisit1, patient_updates: { medical_alerts_add: ['Penicillin allergy'], preferred_times: '' } }
    expect(allergyWarnings(null, summary)).toHaveLength(1)
  })

  it('is quiet with no alerts or an unrelated one', () => {
    expect(allergyWarnings(null, prakashVisit1)).toEqual([])
    expect(allergyWarnings('Diabetic', prakashVisit1)).toEqual([])
  })
})

describe('allWarnings', () => {
  it('lists each sentence once, model warnings first', () => {
    const summary = { ...prakashVisit1, warnings: ['Check dose'] }
    const warnings = allWarnings('Penicillin allergy', summary)
    expect(warnings[0]).toBe('Check dose')
    expect(warnings).toHaveLength(2)
  })
})
