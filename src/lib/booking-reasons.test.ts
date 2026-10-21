import { describe, expect, it } from 'vitest'
import { reasonFromLink } from './booking-reasons'

describe('reasonFromLink', () => {
  it('takes a reason by id or label', () => {
    expect(reasonFromLink('rootcanal')).toBe('rootcanal')
    expect(reasonFromLink('Root canal')).toBe('rootcanal')
    expect(reasonFromLink('unsure')).toBe('unsure')
  })

  it('takes a price-list treatment by slug or by name, as the old treatment pages linked', () => {
    expect(reasonFromLink('root-canal-treatment')).toBe('rootcanal')
    expect(reasonFromLink('Root Canal Treatment')).toBe('rootcanal')
    expect(reasonFromLink('Post and Core Build Up')).toBe('rootcanal')
    expect(reasonFromLink('X-Ray')).toBe('checkup')
    expect(reasonFromLink('Crowns & Bridges (Zirconia/Emax)')).toBe('crown')
  })

  it('picks nothing for anything else', () => {
    expect(reasonFromLink(undefined)).toBeNull()
    expect(reasonFromLink('')).toBeNull()
    expect(reasonFromLink('whitening')).toBeNull()
    expect(reasonFromLink(['cleaning', 'braces'])).toBe('cleaning')
  })
})
