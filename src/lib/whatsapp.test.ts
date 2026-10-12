import { describe, expect, it } from 'vitest'
import { bookingRequestMessage, cancelledMessage, confirmationMessage, declineMessage, movedMessage } from './whatsapp'
import { visitMessage } from './billing'

// Messages to a patient carry the patient's first name and nothing else that identifies them:
// no gender, date of birth, address, phone number or medical alerts.
const FORBIDDEN = /\b(female|male|gender|born|birth|dob|address of|allerg|medical alert)\b/i

const HEADER = '*Smile Dental Clinic*\n_Dr. Rahil Yusuf, BDS_\n\nDear Prakash,\n'
const SIGN_OFF = '\n\nWarm regards,\n*Dr. Rahil Yusuf*\nSmile Dental Clinic, Katapadi'

describe('messages to the patient', () => {
  const starts = '2026-10-15T12:30:00.000Z' // Thu 15 Oct, 6:00 PM in India

  it('confirmation: header, first name only, day and time in bold, address, directions, arrive early', () => {
    const text = confirmationMessage({ name: 'Prakash Shetty', startsAt: starts })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SIGN_OFF)).toBe(true)
    expect(text).toContain('is *confirmed*')
    expect(text).toContain('📅 *Thursday, 15 October*')
    expect(text).toContain('🕗 *6:00 PM*')
    expect(text).toContain('📍 1st Floor, YM Zohara Building')
    expect(text).toContain('Directions: https://maps.app.goo.gl/')
    expect(text).toContain('_Please arrive 5 minutes early._')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('moved says "has been moved to" with the new time in bold, first name only', () => {
    const text = movedMessage({ name: 'Prakash Shetty', startsAt: starts })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SIGN_OFF)).toBe(true)
    expect(text).toContain('has been moved to:')
    expect(text).toContain('📅 *Thursday, 15 October*')
    expect(text).toContain('🕗 *6:00 PM*')
    expect(text).toContain('_Please arrive 5 minutes early._')
    expect(text).not.toContain('confirmed')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('cancelled names the day and time in bold, says how to book again, first name only', () => {
    const text = cancelledMessage({ name: 'Prakash Shetty', startsAt: starts })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SIGN_OFF)).toBe(true)
    expect(text).toContain('has been *cancelled*:')
    expect(text).toContain('📅 *Thursday, 15 October*')
    expect(text).toContain('🕗 *6:00 PM*')
    expect(text).toContain('To book a new time, call or WhatsApp us on')
    // Not a booking: no address block, no "arrive early"
    expect(text).not.toContain('arrive 5 minutes early')
    expect(text).not.toContain('confirmed')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('decline has the same header and sign-off, first name only', () => {
    const text = declineMessage({ name: 'Prakash Shetty' })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SIGN_OFF)).toBe(true)
    expect(text).toContain("couldn't fit the time you asked for")
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('the visit message has the name, the bill and the next visit, and nothing more about the patient', () => {
    const text = visitMessage({
      patientName: 'Prakash Shetty',
      visitDate: '2026-10-11',
      lines: [{ description: 'Root canal treatment (46)', amount: 3500 }],
      payments: [{ amount: 3500, method: 'upi' }],
      summary: { total: 3500, paid: 3500, balance: 0, earlier: 0, due: 0 },
      nextAppointment: { starts_at: starts },
    })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SIGN_OFF)).toBe(true)
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })
})

describe('the website request to the clinic', () => {
  it('stays plain: no clinic header or sign-off', () => {
    const text = bookingRequestMessage({ name: 'Prakash Shetty', phone: '9876543210', startsAt: '2026-10-15T12:30:00.000Z', reason: 'Pain', link: 'https://x/r' })
    expect(text.startsWith('*Appointment request (website)*')).toBe(true)
    expect(text).not.toContain('Warm regards')
    expect(text).toContain('Open in Clinic OS: https://x/r')
  })
})
