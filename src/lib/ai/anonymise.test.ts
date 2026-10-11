import { describe, expect, it } from 'vitest'
import { anonymise, createAnonymiser, restoreDeep } from './anonymise'

const identity = { name: 'Prakash Shetty', address: 'Near Church Road, Pangala, Udupi', phone: '9845021763' }

describe('anonymise', () => {
  it('hides the name, in any case, and gives it back', () => {
    const { text, restore } = anonymise('prakash shetty has pain. SHETTY says it is worse at night.', identity)
    expect(text).toBe('[PATIENT] has pain. [PATIENT] says it is worse at night.')
    expect(restore('[PATIENT] needs RCT')).toBe('Prakash Shetty needs RCT')
  })

  it('hides address words but keeps ordinary words like Road', () => {
    const { text } = anonymise('Lives in Pangala near the Church Road, Udupi side. Road is noisy.', identity)
    expect(text).not.toContain('Pangala')
    expect(text).not.toContain('Udupi')
    expect(text).toContain('Road')
    expect(text).toContain('[ADDRESS]')
  })

  it('hides phone numbers however they are written, and email addresses', () => {
    const note = 'Call 98450 21763 or +91-9845021763 or 09845021763, mail prakash@example.com. Tooth 46, 3500 rupees.'
    const { text } = anonymise(note, { name: null, address: null, phone: null })
    expect(text).toBe('Call [PHONE] or [PHONE] or [PHONE], mail [EMAIL]. Tooth 46, 3500 rupees.')
  })

  it('does not hide part of a longer word, or tooth numbers and prices', () => {
    const { text } = anonymise('Shettyvalli road. Amounts 4200, 3500; teeth 46 and 36.', { name: 'Shetty', address: null, phone: null })
    expect(text).toBe('Shettyvalli road. Amounts 4200, 3500; teeth 46 and 36.')
  })

  it('collapses first name and last name into one placeholder', () => {
    const { text } = anonymise('Prakash Shetty, 38, male', identity)
    expect(text).toBe('[PATIENT], 38, male')
  })

  it('leaves a note alone when there is nothing to hide', () => {
    const { text } = anonymise('Deep caries on 46.', { name: null, address: null, phone: null })
    expect(text).toBe('Deep caries on 46.')
  })
})

describe('restoreDeep', () => {
  it('restores inside nested objects and arrays, leaving numbers alone', () => {
    const { restore } = anonymise('x', identity)
    const value = { tidy_note: 'Complaint: [PATIENT] has pain', teeth: [{ tooth: '46', note: '[PATIENT]' }], n: 5, none: null }
    expect(restoreDeep(value, restore)).toEqual({
      tidy_note: 'Complaint: Prakash Shetty has pain',
      teeth: [{ tooth: '46', note: 'Prakash Shetty' }],
      n: 5,
      none: null,
    })
  })
})

describe('other names in the note', () => {
  it('masks a capitalised name in the middle of a sentence, with a way back', () => {
    const { text, restore } = anonymise('Wife Sunita and Dr Hegde advised RCT. Thursday visit.', { name: null, address: null, phone: null })
    expect(text).toBe('Wife [NAME1] and Dr [NAME2] advised RCT. Thursday visit.')
    expect(restore('[NAME1] will bring him; refer to [NAME2]')).toBe('Sunita will bring him; refer to Hegde')
  })

  it('leaves medicines, days, months and sentence starts alone', () => {
    const { text } = anonymise('Prescribed Amoxicillin on Saturday in October. Augmentin if needed. Sunita called.', { name: null, address: null, phone: null })
    expect(text).toBe('Prescribed Amoxicillin on Saturday in October. Augmentin if needed. Sunita called.')
  })

  it('gives the same person the same placeholder across texts', () => {
    const a = createAnonymiser({ name: null, address: null, phone: null })
    expect(a.text('Came with Sunita')).toBe('Came with [NAME1]')
    expect(a.text('Allergy told by Sunita and Ramesh')).toBe('Allergy told by [NAME1] and [NAME2]')
    expect(a.restore('[NAME2] and [NAME1]')).toBe('Ramesh and Sunita')
  })
})
