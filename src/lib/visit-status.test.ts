import { describe, expect, it } from 'vitest'
import { visitStatus } from './visit-status'

describe('visitStatus', () => {
  it('is in progress until something is billed', () => {
    expect(visitStatus({ closedAt: null, total: 0, paid: 0 })).toBe('in_progress')
    expect(visitStatus({ closedAt: undefined, total: 0, paid: 500 })).toBe('in_progress')
  })

  it('is billed while money is owed and paid once covered', () => {
    expect(visitStatus({ closedAt: null, total: 1500, paid: 0 })).toBe('billed')
    expect(visitStatus({ closedAt: null, total: 1500, paid: 1000 })).toBe('billed')
    expect(visitStatus({ closedAt: null, total: 1500, paid: 1500 })).toBe('paid')
    expect(visitStatus({ closedAt: null, total: 1500, paid: 2000 })).toBe('paid')
  })

  it('is done once finished, whatever is owed', () => {
    expect(visitStatus({ closedAt: '2026-10-15T10:00:00Z', total: 1500, paid: 0 })).toBe('done')
    expect(visitStatus({ closedAt: '2026-10-15T10:00:00Z', total: 0, paid: 0 })).toBe('done')
  })
})
