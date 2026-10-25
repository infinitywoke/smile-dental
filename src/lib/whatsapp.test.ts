import { describe, expect, it } from 'vitest'
import {
  bookingRequestMessage, cancelledMessage, confirmationMessage, declineMessage, kannadaDate, kannadaTime, messageLanguage, missedMessage,
  movedMessage, recallMessage, reminderMessage, reviewMessage, runningLateMessage,
} from './whatsapp'
import { visitMessage } from './billing'

// Messages to a patient carry the patient's first name and nothing else that identifies them:
// no gender, date of birth, address, phone number or medical alerts.
const FORBIDDEN = /\b(female|male|gender|born|birth|dob|address of|allerg|medical alert)\b/i

// Friendly: "Hi" and the first name, no clinic heading; "See you soon," before an appointment, else "Take care,"
const HEADER = 'Hi Prakash,\n\n'
const SEE_YOU = '\n\nSee you soon,\n*Dr. Rahil Yusuf*\nSmile Dental Clinic, Katapadi'
const TAKE_CARE = '\n\nTake care,\n*Dr. Rahil Yusuf*\nSmile Dental Clinic, Katapadi'

describe('messages to the patient', () => {
  const starts = '2026-10-15T12:30:00.000Z' // Thu 15 Oct, 6:00 PM in India

  it('confirmation: friendly, first name only, day and time in bold, address, directions, come early', () => {
    const text = confirmationMessage({ name: 'Prakash Shetty', startsAt: starts })
    expect(text.startsWith(`${HEADER}Good news, your appointment at Smile Dental Clinic is *confirmed*.`)).toBe(true)
    expect(text.endsWith(SEE_YOU)).toBe(true)
    expect(text).toContain('Date: *Thursday, 15 October*')
    expect(text).toContain('Time: *6:00 PM*')
    expect(text).toContain('Address: 1st Floor, YM Zohara Building')
    expect(text).toContain('Directions: https://maps.app.goo.gl/')
    expect(text).toContain('_Please come 5 minutes early if you can._')
    expect(text).toContain('Need to change it? Just call or WhatsApp us on')
    expect(text).not.toContain('BDS')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('running late: how late, their time in bold, first name only', () => {
    const text = runningLateMessage({ name: 'Prakash Shetty', startsAt: starts, minutes: 15 })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SEE_YOU)).toBe(true)
    expect(text).toContain('running about 15 minutes late today. Sorry to keep you waiting!')
    expect(text).toContain('Time: *6:00 PM*')
    expect(text).toContain('Feel free to come about 15 minutes after your time')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('moved gives the new time in bold, first name only', () => {
    const text = movedMessage({ name: 'Prakash Shetty', startsAt: starts })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(SEE_YOU)).toBe(true)
    expect(text).toContain("has moved. Here's the new time:")
    expect(text).toContain('Date: *Thursday, 15 October*')
    expect(text).toContain('Time: *6:00 PM*')
    expect(text).toContain('_Please come 5 minutes early if you can._')
    expect(text).not.toContain('confirmed')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('cancelled names the day and time in bold, says how to book again, first name only', () => {
    const text = cancelledMessage({ name: 'Prakash Shetty', startsAt: starts })
    expect(text.startsWith(HEADER)).toBe(true)
    expect(text.endsWith(TAKE_CARE)).toBe(true)
    expect(text).toContain('is *cancelled*:')
    expect(text).toContain('Date: *Thursday, 15 October*')
    expect(text).toContain('Time: *6:00 PM*')
    expect(text).toContain("Whenever you'd like a new time, just call or WhatsApp us on")
    // Not a booking: no address block, no "come early"
    expect(text).not.toContain('5 minutes early')
    expect(text).not.toContain('confirmed')
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('every message to a patient is friendly: "Hi", no clinic heading, a warm sign-off', () => {
    const name = 'Prakash Shetty'
    for (const text of [
      confirmationMessage({ name, startsAt: starts }), movedMessage({ name, startsAt: starts }), cancelledMessage({ name, startsAt: starts }),
      declineMessage({ name }), reminderMessage({ name, startsAt: starts, tomorrow: true }), missedMessage({ name, startsAt: starts }),
      runningLateMessage({ name, startsAt: starts, minutes: 15 }), recallMessage({ name, lastVisit: '2026-04-11' }), reviewMessage({ name }),
      visitMessage({ patientName: name, visitDate: '2026-10-11', nextAppointment: { starts_at: starts } }),
    ]) {
      expect(text.startsWith(HEADER)).toBe(true)
      expect(text).not.toContain('*Smile Dental Clinic*')
      expect(text).not.toContain('BDS')
      expect(text).not.toContain('Dear ')
      expect(text).not.toContain('Warm regards')
      expect(text.endsWith(SEE_YOU) || text.endsWith(TAKE_CARE)).toBe(true)
    }
    expect(reminderMessage({ name, startsAt: starts, tomorrow: true })).toContain('Just a friendly reminder of your appointment tomorrow:')
    expect(missedMessage({ name, startsAt: starts })).toContain("Just reply to this message and we'll find a new time")
    expect(recallMessage({ name, lastVisit: '2026-04-11' })).toContain("so it's time for a check-up.")
  })

  it('decline has the same greeting and sign-off, first name only', () => {
    const text = declineMessage({ name: 'Prakash Shetty' })
    expect(text.startsWith(`${HEADER}Thank you for getting in touch with Smile Dental Clinic.`)).toBe(true)
    expect(text.endsWith(TAKE_CARE)).toBe(true)
    expect(text).toContain("couldn't fit the time you asked for")
    expect(text).not.toContain('Shetty')
    expect(text).not.toMatch(FORBIDDEN)
  })

  it('the visit message is friendly: no clinic heading, the first name, the link and the next visit, nothing more about the patient', () => {
    const text = visitMessage({
      patientName: 'Prakash Shetty',
      visitDate: '2026-10-11',
      nextAppointment: { starts_at: starts },
      photoLink: { url: 'https://x/r/code', labels: ['Bill'] },
    })
    expect(text.startsWith('Hi Prakash,\n')).toBe(true)
    expect(text).not.toContain('*Smile Dental Clinic*')
    expect(text).not.toContain('BDS')
    expect(text.endsWith('\n\nTake care,\n*Dr. Rahil Yusuf*\nSmile Dental Clinic, Katapadi')).toBe(true)
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
  const KN_HEADER = 'ನಮಸ್ಕಾರ Prakash ಅವರೇ,\n\n'
  const KN_SIGN_OFF = '\n\nಶುಭಾಶಯಗಳೊಂದಿಗೆ,\n*Dr. Rahil Yusuf*\nSmile Dental Clinic, ಕಟಪಾಡಿ'
  // English words left in a Kannada message, apart from names, WhatsApp, Google, UPI, the address and links
  const englishLeft = (text: string) =>
    text.split('\n')
      .filter((line) => !line.startsWith('ವಿಳಾಸ:') && !line.startsWith('- ') && !/https?:\/\//.test(line))
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

  it('the confirmation: Kannada greeting (no clinic heading), day and time, first name only', () => {
    const text = confirmationMessage({ name: 'Prakash Shetty', startsAt: starts, language: 'kn' })
    expect(text.startsWith(KN_HEADER)).toBe(true)
    expect(text.endsWith(KN_SIGN_OFF)).toBe(true)
    expect(text).toContain('*ಖಚಿತವಾಗಿದೆ*')
    expect(text).toContain('ದಿನಾಂಕ: *ಗುರುವಾರ, 15 ಅಕ್ಟೋಬರ್*')
    expect(text).toContain('ಸಮಯ: *ಸಂಜೆ 6:00*')
    expect(text).toContain('ವಿಳಾಸ: 1st Floor, YM Zohara Building')
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
    ]
    for (const text of messages) {
      expect(text.startsWith(KN_HEADER)).toBe(true)
      expect(text.endsWith(KN_SIGN_OFF)).toBe(true)
      expect(englishLeft(text)).toEqual([])
      expect(text).not.toContain('Shetty')
      expect(text).not.toMatch(FORBIDDEN)
    }
    // After a visit: the same greeting, the money on the link's page only
    const visit = visitMessage({
      patientName: name,
      visitDate: '2026-10-11',
      today: '2026-10-12',
      nextAppointment: { starts_at: starts },
      photoLink: { url: 'https://example.com/r/AbCdEfGhIjKlMnOpQrStUvWxYz012345', labels: ['Prescription', 'X-ray', 'Bill'] },
      language: 'kn',
    })
    expect(visit.startsWith('ನಮಸ್ಕಾರ Prakash ಅವರೇ,\n\n11 ಅಕ್ಟೋಬರ್ 2026 ರಂದು ನಮ್ಮಲ್ಲಿಗೆ ಬಂದಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.')).toBe(true)
    expect(visit).toContain('ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್, ಫೋಟೋ ಮತ್ತು ಬಿಲ್ ಈ ಲಿಂಕ್‌ನಲ್ಲಿ ನೋಡಿ _(ಲಿಂಕ್ 30 ದಿನ ಕೆಲಸ ಮಾಡುತ್ತದೆ)_:\nhttps://example.com/r/')
    expect(visit.endsWith(KN_SIGN_OFF)).toBe(true)
    expect(englishLeft(visit)).toEqual([])
    expect(visit).not.toContain('₹')
    expect(visitMessage({ patientName: name, visitDate: '2026-10-11', today: '2026-10-11', language: 'kn' })).toContain('\nಇಂದು ನಮ್ಮಲ್ಲಿಗೆ ಬಂದಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.')
    messages.push(visit)
    // Plain and professional: no emojis in any message, in either language
    for (const text of messages) expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
    for (const text of [
      confirmationMessage({ name, startsAt: starts }), movedMessage({ name, startsAt: starts }), cancelledMessage({ name, startsAt: starts }),
      declineMessage({ name }), reminderMessage({ name, startsAt: starts, tomorrow: true }), missedMessage({ name, startsAt: starts }),
      runningLateMessage({ name, startsAt: starts, minutes: 15 }), recallMessage({ name, lastVisit: '2026-04-11' }), reviewMessage({ name }),
      visitMessage({ patientName: name, visitDate: '2026-10-11', nextAppointment: { starts_at: starts }, photoLink: { url: 'https://x/r/code', labels: ['Prescription'] } }),
    ]) expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
    expect(messages[8]).toContain('(11 ಏಪ್ರಿಲ್ 2026)')
  })
})
