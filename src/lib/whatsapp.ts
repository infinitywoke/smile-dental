import { siteConfig } from '@/config/site'
import { formatDate } from '@/lib/dates'
import { formatBlock, formatDay, inIndia, weekday } from '@/lib/schedule'

// WhatsApp links open a chat with the text filled in; the sender taps Send.
function digits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `91${d}` : d
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
}

export function clinicWhatsappLink(text: string): string {
  return whatsappLink(siteConfig.whatsapp, text)
}

function when(startsAt: string): string {
  const { date, time } = inIndia(startsAt)
  return `${formatDay(date)} at ${formatBlock(time)}`
}

// Patient -> clinic: short and plain (it is for the clinic), with the private link that opens the
// request in Clinic OS
export function bookingRequestMessage(args: {
  name: string
  phone: string
  startsAt: string
  reason: string
  link: string
  // The voice note test: recorded on the page, or coming next on WhatsApp
  voiceNote?: 'recorded' | 'whatsapp' | null
}): string {
  return [
    '*Appointment request (website)*',
    `Name: ${args.name}`,
    `Phone: ${args.phone}`,
    `Time: ${when(args.startsAt)}`,
    ...(args.reason ? [`Reason: ${args.reason}`] : []),
    ...(args.voiceNote === 'recorded' ? ['Voice note: open the request to listen'] : []),
    ...(args.voiceNote === 'whatsapp' ? ["I'll send a voice note about my problem next."] : []),
    '',
    `Open in Clinic OS: ${args.link}`,
  ].join('\n')
}

// ---- Clinic -> patient: every message has the same plain, professional look, with no emojis (WhatsApp
// styling only: *bold* for what matters, _italic_ for a note, "- " for lists). The patient's first name
// is the only thing about them in any message.

// The language of a patient's messages: Kannada once it is set on their record (patients.language),
// else English. Website requests are answered in English: who sent one isn't known yet.
export type MessageLanguage = 'en' | 'kn'
export const messageLanguage = (value: string | null | undefined): MessageLanguage => (value === 'kn' ? 'kn' : 'en')

const KN_WEEKDAYS = ['ಭಾನುವಾರ', 'ಸೋಮವಾರ', 'ಮಂಗಳವಾರ', 'ಬುಧವಾರ', 'ಗುರುವಾರ', 'ಶುಕ್ರವಾರ', 'ಶನಿವಾರ']
const KN_MONTHS = ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್']

// "ಗುರುವಾರ, 15 ಅಕ್ಟೋಬರ್"; with the year in place of the day, "15 ಅಕ್ಟೋಬರ್ 2026". From the clinic's own
// names, not the phone's, so every phone writes it the same way.
export function kannadaDate(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number)
  return withYear ? `${d} ${KN_MONTHS[m - 1]} ${y}` : `${KN_WEEKDAYS[weekday(date)]}, ${d} ${KN_MONTHS[m - 1]}`
}

// "14:30" -> "ಮಧ್ಯಾಹ್ನ 2:30": morning, afternoon, evening or night, and the time on a 12-hour clock
export function kannadaTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const part = h < 12 ? 'ಬೆಳಿಗ್ಗೆ' : h < 16 ? 'ಮಧ್ಯಾಹ್ನ' : h < 20 ? 'ಸಂಜೆ' : 'ರಾತ್ರಿ'
  return `${part} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`
}

// "call or WhatsApp us on +91 …"
const CALL_US_KN = `${siteConfig.phone} ಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ WhatsApp ಮಾಡಿ`
const APPOINTMENT_KN = 'ಅಪಾಯಿಂಟ್ಮೆಂಟ್'

export const firstName = (name: string) => name.trim().split(/\s+/)[0]

// "*Smile Dental Clinic*", "_Dr. Rahil Yusuf, BDS_", then "Dear Prakash," ("ನಮಸ್ಕಾರ Prakash ಅವರೇ,")
export function messageHeader(name: string, language: MessageLanguage = 'en'): string[] {
  const degree = siteConfig.dentist.qualifications.split(',')[0].trim()
  const greeting = language === 'kn' ? `ನಮಸ್ಕಾರ ${firstName(name)} ಅವರೇ,` : `Dear ${firstName(name)},`
  return [`*${siteConfig.name}*`, `_${siteConfig.dentist.name}, ${degree}_`, '', greeting]
}

export function messageSignOff(language: MessageLanguage = 'en'): string[] {
  return language === 'kn'
    ? ['', 'ಶುಭಾಶಯಗಳೊಂದಿಗೆ,', `*${siteConfig.dentist.name}*`, `${siteConfig.name}, ಕಟಪಾಡಿ`]
    : ['', 'Warm regards,', `*${siteConfig.dentist.name}*`, `${siteConfig.name}, Katapadi`]
}

// "Date: *Thursday, 15 October*" and "Time: *6:00 PM*"
export function appointmentLines(startsAt: string, language: MessageLanguage = 'en'): string[] {
  const { date, time } = inIndia(startsAt)
  return language === 'kn'
    ? [`ದಿನಾಂಕ: *${kannadaDate(date)}*`, `ಸಮಯ: *${kannadaTime(time)}*`]
    : [`Date: *${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}*`, `Time: *${formatBlock(time)}*`]
}

// The clinic in one short line (the full address goes in confirmations). The address itself is in
// English in every message: it is what the signboard and Google Maps say.
const SHORT_ADDRESS = '1st Floor, YM Zohara Building, Shirva Road, Katapadi'
const addressLabel = (language: MessageLanguage) => (language === 'kn' ? 'ವಿಳಾಸ' : 'Address')
export const shortLocation = (language: MessageLanguage = 'en') => `${addressLabel(language)}: ${SHORT_ADDRESS}`

export const QUESTIONS_LINE = `For any questions, call or WhatsApp us on ${siteConfig.phone}.`

export const questionsLine = (language: MessageLanguage = 'en') => (language === 'kn' ? `ಏನಾದರೂ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ${CALL_US_KN}.` : QUESTIONS_LINE)

const arriveEarly = (language: MessageLanguage) => (language === 'kn' ? '_ದಯವಿಟ್ಟು 5 ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ ಬನ್ನಿ._' : '_Please arrive 5 minutes early._')

// Day, time, address and directions, for a confirmed or moved appointment
function appointmentBlock(startsAt: string, language: MessageLanguage): string[] {
  const kn = language === 'kn'
  return [
    '',
    ...appointmentLines(startsAt, language),
    '',
    `${addressLabel(language)}: ${siteConfig.address}`,
    `${kn ? 'ದಾರಿ' : 'Directions'}: ${siteConfig.googleReviewsLink}`,
    '',
    arriveEarly(language),
    kn ? `ಸಮಯ ಬದಲಿಸಲು ಅಥವಾ ರದ್ದುಗೊಳಿಸಲು ${CALL_US_KN}.` : `To change or cancel, call or WhatsApp us on ${siteConfig.phone}.`,
  ]
}

type To = { name: string; language?: MessageLanguage }

// Clinic -> patient, after Dr. Rahil saves
export function confirmationMessage(args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  return [
    ...messageHeader(args.name, language),
    language === 'kn'
      ? `${siteConfig.name} ನಲ್ಲಿ ನಿಮ್ಮ ${APPOINTMENT_KN} *ಖಚಿತವಾಗಿದೆ*.`
      : `Your appointment at ${siteConfig.name} is *confirmed*.`,
    ...appointmentBlock(args.startsAt, language),
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient, after an appointment is moved
export function movedMessage(args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  return [
    ...messageHeader(args.name, language),
    language === 'kn'
      ? `${siteConfig.name} ನಲ್ಲಿ ನಿಮ್ಮ ${APPOINTMENT_KN} ಅನ್ನು ಈ ಸಮಯಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ:`
      : `Your appointment at ${siteConfig.name} has been moved to:`,
    ...appointmentBlock(args.startsAt, language),
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient, after an appointment is cancelled: which one, and how to book again
export function cancelledMessage(args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    kn ? `${siteConfig.name} ನಲ್ಲಿ ನಿಮ್ಮ ಈ ${APPOINTMENT_KN} *ರದ್ದಾಗಿದೆ*:` : `Your appointment at ${siteConfig.name} has been *cancelled*:`,
    '',
    ...appointmentLines(args.startsAt, language),
    '',
    kn ? `ಹೊಸ ಸಮಯ ಬುಕ್ ಮಾಡಲು ${CALL_US_KN}.` : `To book a new time, call or WhatsApp us on ${siteConfig.phone}.`,
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient, when the requested time can't be given
export function declineMessage(args: To): string {
  const { language = 'en' } = args
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    kn ? `${siteConfig.name} ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.` : `Thank you for contacting ${siteConfig.name}.`,
    '',
    kn
      ? `ಕ್ಷಮಿಸಿ, ನೀವು ಕೇಳಿದ ಸಮಯವನ್ನು ನಮಗೆ ಹೊಂದಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ${CALL_US_KN}, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಸಮಯವನ್ನು ಹುಡುಕೋಣ.`
      : `We're sorry, we couldn't fit the time you asked for. Please call or WhatsApp us on ${siteConfig.phone} and we'll find a time that suits you.`,
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient, the day before (or before the weekend's Friday): the time, and how to change it
export function reminderMessage(args: To & { startsAt: string; tomorrow: boolean }): string {
  const { language = 'en' } = args
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    kn
      ? (args.tomorrow ? `ನಾಳೆ ನಿಮ್ಮ ${APPOINTMENT_KN} ಇದೆ ಎಂದು ನೆನಪಿಸುತ್ತಿದ್ದೇವೆ:` : `ನಿಮ್ಮ ಮುಂದಿನ ${APPOINTMENT_KN} ಬಗ್ಗೆ ನೆನಪಿಸುತ್ತಿದ್ದೇವೆ:`)
      : `A reminder of your appointment ${args.tomorrow ? 'tomorrow' : 'coming up'}:`,
    '',
    ...appointmentLines(args.startsAt, language),
    shortLocation(language),
    '',
    arriveEarly(language),
    kn
      ? `ಬರಲು ಆಗದಿದ್ದರೆ ದಯವಿಟ್ಟು ${CALL_US_KN}, ಆ ಸಮಯವನ್ನು ಬೇರೆಯವರಿಗೆ ನೀಡುತ್ತೇವೆ.`
      : `If you can't make it, please call or WhatsApp us on ${siteConfig.phone}, so we can give the time to someone else.`,
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient, after a missed appointment: kind, and an easy way back
export function missedMessage(args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  const { date } = inIndia(args.startsAt)
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    kn
      ? `${kannadaDate(date)} ರಂದು ನಿಮ್ಮ ${APPOINTMENT_KN} ಸಮಯದಲ್ಲಿ ನಿಮ್ಮನ್ನು ಕಾಣಲಾಗಲಿಲ್ಲ. ಎಲ್ಲವೂ ಚೆನ್ನಾಗಿದೆ ಎಂದು ಆಶಿಸುತ್ತೇವೆ.`
      : `We missed you at your appointment on ${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}. We hope all is well.`,
    '',
    kn ? 'ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಹೊಸ ಸಮಯವನ್ನು ನಿಗದಿಪಡಿಸುತ್ತೇವೆ.' : 'Reply to this message and we will find a new time that suits you.',
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient, from the Cockpit's "Running late", to the patients still to come today
export function runningLateMessage(args: To & { startsAt: string; minutes: number }): string {
  const { language = 'en' } = args
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    kn
      ? `ಡಾ. ರಾಹಿಲ್ ಅವರು ಇಂದು ಸುಮಾರು ${args.minutes} ನಿಮಿಷ ತಡವಾಗಿದ್ದಾರೆ. ಕಾಯಿಸುತ್ತಿರುವುದಕ್ಕೆ ಕ್ಷಮಿಸಿ.`
      : `Dr. Rahil is running about ${args.minutes} minutes late today. Sorry to keep you waiting.`,
    '',
    kn ? `ನಿಮ್ಮ ${APPOINTMENT_KN}:` : 'Your appointment:',
    ...appointmentLines(args.startsAt, language),
    '',
    kn
      ? `ನಿಮ್ಮ ಸಮಯಕ್ಕಿಂತ ಸುಮಾರು ${args.minutes} ನಿಮಿಷ ತಡವಾಗಿ ಬರಬಹುದು. ಅದು ಅನುಕೂಲವಾಗದಿದ್ದರೆ ${CALL_US_KN}.`
      : `You can come about ${args.minutes} minutes after your time. If that doesn't suit you, call or WhatsApp us on ${siteConfig.phone}.`,
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient, about six months after their last visit
export function recallMessage(args: To & { lastVisit: string }): string {
  const { language = 'en' } = args
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    kn
      ? `ನಿಮ್ಮ ಕೊನೆಯ ಭೇಟಿಯಿಂದ (${kannadaDate(args.lastVisit, true)}) ಸುಮಾರು ಆರು ತಿಂಗಳಾಗಿದೆ.`
      : `It has been about six months since your last visit (${formatDate(args.lastVisit, { day: 'numeric', month: 'long', year: 'numeric' })}).`,
    '',
    kn
      ? 'ಪ್ರತಿ ಆರು ತಿಂಗಳಿಗೊಮ್ಮೆ ತಪಾಸಣೆ ಮತ್ತು ಹಲ್ಲು ಸ್ವಚ್ಛಗೊಳಿಸುವುದರಿಂದ ಹಲ್ಲು ಮತ್ತು ಒಸಡುಗಳು ಆರೋಗ್ಯವಾಗಿರುತ್ತವೆ, ಸಣ್ಣ ಸಮಸ್ಯೆಗಳು ಬೇಗನೆ ತಿಳಿಯುತ್ತವೆ.'
      : 'A check-up and cleaning every six months keeps your teeth and gums healthy and catches small problems early.',
    '',
    kn ? 'ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಸಮಯವನ್ನು ಬುಕ್ ಮಾಡುತ್ತೇವೆ.' : 'Reply to this message and we will book a time that suits you.',
    ...messageSignOff(language),
  ].join('\n')
}

// Clinic -> patient: a Google review request, the same words for every patient (Google does not allow
// asking only happy patients, or offering anything in return)
export function reviewMessage(args: To): string {
  const { language = 'en' } = args
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    kn ? `${siteConfig.name} ಗೆ ಭೇಟಿ ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.` : `Thank you for visiting ${siteConfig.name}.`,
    '',
    kn
      ? 'ಒಂದು ನಿಮಿಷ ಸಮಯವಿದ್ದರೆ, Google ನಲ್ಲಿ ಒಂದು ಚಿಕ್ಕ ವಿಮರ್ಶೆ (review) ಬರೆಯಿರಿ. ಇದರಿಂದ ಈ ಭಾಗದ ಇತರರಿಗೆ ಕ್ಲಿನಿಕ್ ಹುಡುಕಲು ಸಹಾಯವಾಗುತ್ತದೆ:'
      : 'If you have a minute, a short Google review helps other people in the area find the clinic:',
    siteConfig.reviewRequestLink || siteConfig.googleReviewsLink,
    ...messageSignOff(language),
  ].join('\n')
}
