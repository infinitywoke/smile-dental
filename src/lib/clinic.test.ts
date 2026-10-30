import { describe, expect, it } from 'vitest'
import { visitMessage } from './billing'
import { clinicContext, degreeOf, reviewLinkOf, type ClinicRow, type DentistRow } from './clinic'
import { letterheadText } from './prescription-image'
import { hindiDate, hindiTime, messageLanguage, questionsLine, shortLocation, cancelledMessage, confirmationMessage, declineMessage, messageSignOff, missedMessage, movedMessage, recallMessage, reminderMessage, reviewMessage, runningLateMessage, type MessageLanguage } from './whatsapp'
import { tallyXml } from './tally'
import { OTHER_CLINIC, SMILE_DENTAL } from './test-clinic'
import { upiLink } from './upi'

const row: ClinicRow = {
  id: 'c1', slug: 'brightside-manipal', name: 'Brightside Dental', place: 'Manipal', place_kn: null, phone: '+91 9000000001',
  whatsapp: null, email: null, address: 'Lakeview Arcade, Manipal', short_address: null, maps_link: null, review_link: null,
  upi_id: null, upi_payee: null, logo: null, tally: {}, chair_monitor: null, languages: ['en', 'kn'],
}
const dentist: DentistRow = {
  id: 'd1', name: 'Dr. Kavya Shenoy', user_id: null, active: true, short_name: null, short_name_kn: null,
  qualifications: null, registration: null, signature: null,
}

describe("a clinic's details from the database", () => {
  it('the dentist is the person signed in, else the first active one', () => {
    const mine = { ...dentist, id: 'd2', user_id: 'u2' }
    const away = { ...dentist, id: 'd0', active: false }
    expect(clinicContext(row, [away, dentist, mine], 'u2').dentist.id).toBe('d2')
    expect(clinicContext(row, [away, dentist, mine], 'someone else').dentist.id).toBe('d1')
  })

  it("says what is missing, and never fills it in: another clinic's phone would be worse", () => {
    expect(() => clinicContext(null, [dentist], 'u')).toThrow("This clinic isn't set up yet: the clinic was not found")
    for (const [key, what] of [['name', 'name'], ['phone', 'phone'], ['place', 'place'], ['address', 'address']] as const) {
      expect(() => clinicContext({ ...row, [key]: ' ' }, [dentist], 'u')).toThrow(`This clinic isn't set up yet: ${what}`)
    }
    expect(() => clinicContext(row, [{ ...dentist, active: false }], 'u')).toThrow("This clinic isn't set up yet: dentist")
  })

  it("has no UPI without an ID, and the payee defaults to the clinic's own name", () => {
    expect(clinicContext(row, [dentist], 'u').clinic.upi).toBeNull()
    expect(clinicContext({ ...row, upi_id: 'a@b' }, [dentist], 'u').clinic.upi).toEqual({ id: 'a@b', payee: 'Brightside Dental' })
  })

  it('a chair monitor with a detail missing is no monitor', () => {
    const monitor = { name: 'Cam', wifi: 'w', password: 'p', address: 'http://x' }
    expect(clinicContext({ ...row, chair_monitor: monitor }, [dentist], 'u').clinic.chairMonitor).toEqual(monitor)
    expect(clinicContext({ ...row, chair_monitor: { ...monitor, wifi: '' } }, [dentist], 'u').clinic.chairMonitor).toBeNull()
  })

  it('the degree is the first part of the qualifications; the review link falls back to Maps', () => {
    expect(degreeOf(SMILE_DENTAL.dentist)).toBe('BDS')
    expect(degreeOf({ qualifications: null })).toBe('')
    expect(reviewLinkOf({ reviewLink: null, mapsLink: 'https://m' })).toBe('https://m')
    expect(reviewLinkOf({ reviewLink: null, mapsLink: null })).toBeNull()
  })
})

const starts = '2026-10-15T12:30:00.000Z'
const to = (language: MessageLanguage) => ({ name: 'Prakash Shetty', language })
const messages = (language: MessageLanguage): [string, string][] => [
  ['confirmation', confirmationMessage(OTHER_CLINIC, { ...to(language), startsAt: starts })],
  ['moved', movedMessage(OTHER_CLINIC, { ...to(language), startsAt: starts })],
  ['cancelled', cancelledMessage(OTHER_CLINIC, { ...to(language), startsAt: starts })],
  ['declined', declineMessage(OTHER_CLINIC, to(language))],
  ['reminder', reminderMessage(OTHER_CLINIC, { ...to(language), startsAt: starts, tomorrow: true })],
  ['missed', missedMessage(OTHER_CLINIC, { ...to(language), startsAt: starts })],
  ['running late', runningLateMessage(OTHER_CLINIC, { ...to(language), startsAt: starts, minutes: 20 })],
  ['recall', recallMessage(OTHER_CLINIC, { ...to(language), lastVisit: '2026-04-15' })],
  ['review', reviewMessage(OTHER_CLINIC, to(language))],
  ['after a visit', visitMessage(OTHER_CLINIC, { patientName: 'Prakash Shetty', visitDate: '2026-10-15', language, review: true, nextAppointment: { starts_at: starts } })],
]
const ANOTHER_CLINIC = /Smile Dental|6361816711|Rahil|Katapadi|ರಾಹಿಲ್|ಕಟಪಾಡಿ|Zohara|Shirva/

describe("another clinic's messages", () => {
  for (const language of ['en', 'kn', 'hi'] as const) {
    it.each(messages(language))(`%s (${language}) names that clinic and its dentist, and nothing of Smile Dental's`, (_, text) => {
      expect(text).not.toMatch(ANOTHER_CLINIC)
      expect(text).toContain('*Dr. Kavya Shenoy*')
      expect(text).toContain(`Brightside Dental, ${language === 'kn' ? 'ಮಣಿಪಾಲ' : 'Manipal'}`)
      if (language === 'hi') expect(text).toMatch(/^नमस्ते Prakash जी,\n/)
    })
  }

  it('use its phone, address, directions and review link', () => {
    const [confirmed, reminder, late, visit] = [messages('en')[0][1], messages('en')[4][1], messages('en')[6][1], messages('en')[9][1]]
    expect(confirmed).toContain('Address: 2nd Floor, Lakeview Arcade, End Point Road, Manipal - 576104')
    expect(confirmed).toContain('Directions: https://maps.app.goo.gl/BrightsideManipal')
    expect(confirmed).toContain('+91 9000000001')
    expect(reminder).toContain('Address: 2nd Floor, Lakeview Arcade, End Point Road, Manipal\n')
    expect(late).toContain('Dr. Kavya is running about 20 minutes late')
    expect(messages('kn')[6][1]).toContain('ಡಾ. ಕಾವ್ಯಾ ಅವರು ಇಂದು')
    expect(visit).toContain('https://g.page/r/BrightsideManipal/review')
  })

  it('leave out what a clinic has not given: no Directions line, no review link', () => {
    const bare = { ...OTHER_CLINIC, clinic: { ...OTHER_CLINIC.clinic, mapsLink: null, reviewLink: null, shortAddress: null, placeKn: null } }
    expect(confirmationMessage(bare, { name: 'Prakash', startsAt: starts })).not.toContain('Directions')
    expect(visitMessage(bare, { patientName: 'Prakash', visitDate: '2026-10-15', review: true })).not.toContain('Google review')
    expect(shortLocation(bare)).toBe(`Address: ${bare.clinic.address}`)
    // Its town in English when its Kannada name isn't known, rather than a blank
    expect(messageSignOff(bare, 'kn').join('\n')).toContain('Brightside Dental, Manipal')
  })

  it('the patient link page can write the questions line from just the phone', () => {
    expect(questionsLine({ clinic: { phone: '+91 9000000001' } })).toBe('Any questions? Just call or WhatsApp us on +91 9000000001.')
  })
})

describe("another clinic's prescription, UPI code and Tally file", () => {
  it('the letterhead is its own', () => {
    const head = letterheadText(OTHER_CLINIC)
    expect(head).toEqual({
      clinic: 'Brightside Dental',
      doctor: 'Dr. Kavya Shenoy, BDS',
      registration: 'Reg. No. 12345-A',
      phone: 'Phone / WhatsApp: +91 9000000001',
      signedBy: 'Dr. Kavya Shenoy',
      degree: 'BDS',
      address: '2nd Floor, Lakeview Arcade, End Point Road, Manipal - 576104',
    })
    expect(letterheadText({ clinic: OTHER_CLINIC.clinic, dentist: { ...OTHER_CLINIC.dentist, qualifications: null, registration: null } }))
      .toMatchObject({ doctor: 'Dr. Kavya Shenoy', registration: null, degree: '' })
  })

  it('the UPI code pays it', () => {
    const link = upiLink(OTHER_CLINIC.clinic.upi!, { amount: 500 })
    expect(link).toContain('pa=brightside.manipal%40okaxis')
    expect(link).toContain('pn=Brightside%20Dental')
    expect(link).not.toMatch(/rahil|Smile/i)
  })

  it('the Tally file goes into its company, with new ledgers under its group', () => {
    const { clinic } = OTHER_CLINIC
    const file = tallyXml(
      [{ id: 'a', amount: 700, method: 'upi', receivedAt: '2026-10-18T13:30:00Z', patientName: 'Prakash', visitDate: '2026-10-18', ledger: { name: 'Prakash 40 Manipal', create: true } }],
      { cash: clinic.tally.cashLedger, bank: clinic.tally.bankLedger, income: clinic.tally.incomeLedger, patientGroup: clinic.tally.patientGroup },
      'payment', clinic.name, clinic.tally.company)
    expect(file).toContain('<SVCURRENTCOMPANY>BRIGHTSIDE DENTAL</SVCURRENTCOMPANY>')
    expect(file).toContain('<PARENT>Sundry Debtors</PARENT>')
    expect(file).not.toMatch(/SMILE|Direct Incomes/i)
  })
})

describe('messages in Hindi', () => {
  it('a patient set to Hindi gets Hindi, and anything unknown English', () => {
    expect(messageLanguage('hi')).toBe('hi')
    expect(messageLanguage('kn')).toBe('kn')
    expect(messageLanguage('ta')).toBe('en')
    expect(messageLanguage(null)).toBe('en')
  })

  it('writes the date and time the same way on every phone', () => {
    expect(hindiDate('2026-10-15')).toBe('गुरुवार, 15 अक्टूबर')
    expect(hindiDate('2026-10-15', true)).toBe('15 अक्टूबर 2026')
    expect(hindiTime('09:30')).toBe('सुबह 9:30')
    expect(hindiTime('14:30')).toBe('दोपहर 2:30')
    expect(hindiTime('18:00')).toBe('शाम 6:00')
    expect(hindiTime('20:00')).toBe('रात 8:00')
    expect(hindiTime('12:00')).toBe('दोपहर 12:00')
  })

  it('reads in Hindi from the greeting to the sign-off, with the address as the signboard has it', () => {
    const text = confirmationMessage(OTHER_CLINIC, { name: 'Prakash Shetty', startsAt: starts, language: 'hi' })
    expect(text).toContain('Brightside Dental में आपकी अपॉइंटमेंट *पक्की हो गई है*।')
    expect(text).toContain('तारीख: *गुरुवार, 15 अक्टूबर*')
    expect(text).toContain('समय: *शाम 6:00*')
    expect(text).toContain('पता: 2nd Floor, Lakeview Arcade')
    expect(text).toContain('रास्ता: https://maps.app.goo.gl/BrightsideManipal')
    expect(text).toContain('+91 9000000001 पर कॉल या WhatsApp करें')
    expect(text).toContain('शुभकामनाओं सहित,')
    expect(text).not.toMatch(/Hi |Take care|See you soon|[\u0C80-\u0CFF]/)
  })

  it('the bill link and review ask are in Hindi too', () => {
    const text = visitMessage(OTHER_CLINIC, { patientName: 'Prakash', visitDate: '2026-10-15', today: '2026-10-15', language: 'hi', review: true, photoLink: { url: 'https://x/r/a', labels: ['Prescription', 'X-ray', 'Bill'] } })
    expect(text).toContain('आज आने के लिए धन्यवाद।')
    expect(text).toContain('प्रिस्क्रिप्शन, फ़ोटो और बिल इस लिंक पर देखें')
    expect(text).toContain('रिव्यू')
    expect(text).not.toMatch(/Thank you|[\u0C80-\u0CFF]/)
  })
})
