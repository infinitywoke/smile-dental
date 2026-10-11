import { describe, expect, it } from 'vitest'
import { confirmationMessage, declineMessage } from './whatsapp'
import { visitMessage } from './billing'

// Messages to a patient carry the patient's name and nothing else that identifies them:
// no gender, date of birth, address, phone number or medical alerts.
const FORBIDDEN = /\b(female|male|gender|born|birth|dob|address of|allerg|medical alert)\b/i

describe('messages to the patient', () => {
  const starts = '2026-10-15T12:30:00.000Z'

  it('confirmation uses the first name only', () => {
    const text = confirmationMessage({ name: 'Prakash Shetty', startsAt: starts })
    expect(text).toContain('Hello Prakash,')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('decline uses the first name only', () => {
    const text = declineMessage({ name: 'Prakash Shetty' })
    expect(text).toContain('Hello Prakash,')
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
    expect(text).toContain('Hello Prakash,')
    expect(text).not.toMatch(FORBIDDEN)
  })
})
