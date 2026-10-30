import { describe, expect, it } from 'vitest'
import { bookingRequestMessage } from './website-whatsapp'

describe('the website request to the clinic', () => {
  it('stays plain: no clinic header or sign-off', () => {
    const text = bookingRequestMessage({ name: 'Prakash Shetty', phone: '9876543210', startsAt: '2026-10-15T12:30:00.000Z', reason: 'Pain', link: 'https://x/r' })
    expect(text.startsWith('*Appointment request (website)*')).toBe(true)
    expect(text).not.toContain('Warm regards')
    expect(text).toContain('Open in Clinic OS: https://x/r')
  })
})
