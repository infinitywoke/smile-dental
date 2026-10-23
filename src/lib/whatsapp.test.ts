import { describe, expect, it } from 'vitest'
import {
  bookingRequestMessage, cancelledMessage, confirmationMessage, declineMessage, kannadaDate, kannadaTime, messageLanguage, missedMessage,
  movedMessage, recallMessage, reminderMessage, reviewMessage, runningLateMessage,
} from './whatsapp'
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

  it('running late: how late, their time in bold, first name only', () => {
    const text = runningLateMessage({ name: 'Prakash Shetty', startsAt: starts, minutes: 15 })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SIGN_OFF)).toBe(true)
    expect(text).toContain('running about 15 minutes late today')
    expect(text).toContain('🕗 *6:00 PM*')
    expect(text).toContain('come about 15 minutes after your time')
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

describe('messages in Kannada', () => {
  const starts = '2026-10-15T12:30:00.000Z' // Thu 15 Oct, 6:00 PM in India
  const KN_HEADER = '*Smile Dental Clinic*\n_Dr. Rahil Yusuf, BDS_\n\nನಮಸ್ಕಾರ Prakash ಅವರೇ,\n'
  const KN_SIGN_OFF = '\n\nಶುಭಾಶಯಗಳೊಂದಿಗೆ,\n*Dr. Rahil Yusuf*\nSmile Dental Clinic, ಕಟಪಾಡಿ'
  // English words left in a Kannada message, apart from names, WhatsApp, Google, UPI, the address and links
  const englishLeft = (text: string) =>
    text.split('\n')
      .filter((line) => !line.startsWith('📍') && !line.startsWith('- ') && !/https?:\/\//.test(line))
      .join('\n')
      .replace(/Smile Dental Clinic|Dr\. Rahil Yusuf|BDS|Prakash|WhatsApp|Google|\(review\)|UPI/g, '')
      .match(/[A-Za-z]{2,}/g) ?? []

  it('only for a patient set to Kannada', () => {
    expect(messageLanguage('kn')).toBe('kn')
    expect(messageLanguage(null)).toBe('en')
    expect(messageLanguage(undefined)).toBe('en')
    expect(messageLanguage('fr')).toBe('en')
    expect(confirmationMessage({ name: 'Prakash Shetty', startsAt: starts })).toBe(confirmationMessage({ name: 'Prakash Shetty', startsAt: starts, language: 'en' }))
  })

  it.each([
    ['2026-10-15', false, 'ಗುರುವಾರ, 15 ಅಕ್ಟೋಬರ್'],
    ['2026-11-01', false, 'ಭಾನುವಾರ, 1 ನವೆಂಬರ್'],
    ['2026-10-15', true, '15 ಅಕ್ಟೋಬರ್ 2026'],
    ['2027-01-09', true, '9 ಜನವರಿ 2027'],
  ])('writes %s (with the year: %s) as %j', (date, withYear, expected) => {
    expect(kannadaDate(date, withYear)).toBe(expected)
  })

  it.each([
    ['08:30', 'ಬೆಳಿಗ್ಗೆ 8:30'],
    ['11:45', 'ಬೆಳಿಗ್ಗೆ 11:45'],
    ['12:00', 'ಮಧ್ಯಾಹ್ನ 12:00'],
    ['14:30', 'ಮಧ್ಯಾಹ್ನ 2:30'],
    ['16:00', 'ಸಂಜೆ 4:00'],
    ['19:00', 'ಸಂಜೆ 7:00'],
    ['20:30', 'ರಾತ್ರಿ 8:30'],
  ])('writes %s as %j', (time, expected) => {
    expect(kannadaTime(time)).toBe(expected)
  })

  it('the confirmation: Kannada header, day and time, first name only', () => {
    const text = confirmationMessage({ name: 'Prakash Shetty', startsAt: starts, language: 'kn' })
    expect(text.startsWith(KN_HEADER)).toBe(true)
    expect(text.endsWith(KN_SIGN_OFF)).toBe(true)
    expect(text).toContain('*ಖಚಿತವಾಗಿದೆ*')
    expect(text).toContain('📅 *ಗುರುವಾರ, 15 ಅಕ್ಟೋಬರ್*')
    expect(text).toContain('🕗 *ಸಂಜೆ 6:00*')
    expect(text).toContain('📍 1st Floor, YM Zohara Building')
    expect(text).not.toContain('Shetty')
  })

  it('every message is in Kannada all through, with the same look as the English one', () => {
    const name = 'Prakash Shetty'
    const messages = [
      confirmationMessage({ name, startsAt: starts, language: 'kn' }),
      movedMessage({ name, startsAt: starts, language: 'kn' }),
      cancelledMessage({ name, startsAt: starts, language: 'kn' }),
      declineMessage({ name, language: 'kn' }),
      reminderMessage({ name, startsAt: starts, tomorrow: true, language: 'kn' }),
      reminderMessage({ name, startsAt: starts, tomorrow: false, language: 'kn' }),
      missedMessage({ name, startsAt: starts, language: 'kn' }),
      runningLateMessage({ name, startsAt: starts, minutes: 15, language: 'kn' }),
      recallMessage({ name, lastVisit: '2026-04-11', language: 'kn' }),
      reviewMessage({ name, language: 'kn' }),
      visitMessage({
        patientName: name,
        visitDate: '2026-10-11',
        lines: [{ description: 'Root canal treatment (46)', amount: 3500 }, { description: '', amount: 200 }],
        payments: [{ amount: 1000, method: 'upi' }, { amount: 500, method: 'cash' }],
        summary: { total: 3700, paid: 1500, balance: 2200, earlier: 300, due: 2500 },
        nextAppointment: { starts_at: starts },
        photos: [{ label: 'X-ray', url: 'https://example.com/x.jpg' }],
        language: 'kn',
      }),
    ]
    for (const text of messages) {
      expect(text.startsWith(KN_HEADER)).toBe(true)
      expect(text.endsWith(KN_SIGN_OFF)).toBe(true)
      expect(englishLeft(text)).toEqual([])
      expect(text).not.toContain('Shetty')
      expect(text).not.toMatch(FORBIDDEN)
    }
    expect(messages[10]).toContain('- ಶುಲ್ಕ: ₹200')
    expect(messages[10]).toContain('ಪಾವತಿಸಿದ್ದು: ₹1,500 (UPI + ನಗದು)')
    expect(messages[10]).toContain('ಇತರ ಭೇಟಿಗಳ ಬಾಕಿ: ₹300')
    expect(messages[10]).toContain('*ಬಾಕಿ ಮೊತ್ತ: ₹2,500*')
    expect(messages[10]).toContain('11 ಅಕ್ಟೋಬರ್ 2026 ರಂದು')
    expect(messages[8]).toContain('(11 ಏಪ್ರಿಲ್ 2026)')
  })
})
