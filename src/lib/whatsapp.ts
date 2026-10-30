import { reviewLinkOf, type Clinic, type ClinicContext } from '@/lib/clinic'
import { formatDate } from '@/lib/dates'
import { formatBlock, inIndia, weekday } from '@/lib/schedule'

// WhatsApp links open a chat with the text filled in; the sender taps Send.
function digits(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `91${d}` : d
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`
}

// ---- Clinic -> patient: every message is friendly and short, the same look in each: "Hi Asha," (no
// clinic heading), warm plain words, and the dentist's name with the clinic at the end; no emojis (WhatsApp
// styling only: *bold* for what matters, _italic_ for a note). The patient's first name is the only
// thing about them in any message. Each is written for the clinic it is given (src/lib/clinic.ts): its name,
// town, phone, address and dentist, from the database. The website's own messages are in
// src/lib/website-whatsapp.ts.

// The language of a patient's messages: Kannada or Hindi once it is set on their record (patients.language),
// else English. Website requests are answered in English: who sent one isn't known yet.
export type MessageLanguage = 'en' | 'kn' | 'hi'
export const messageLanguage = (value: string | null | undefined): MessageLanguage => (value === 'kn' || value === 'hi' ? value : 'en')

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

// Only the phone, so the patient's link page (which is told just a few of the clinic's details) can write
// the "any questions" line too
type HasPhone = { clinic: Pick<Clinic, 'phone'> }

const HI_WEEKDAYS = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']
const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']

// "गुरुवार, 15 अक्टूबर"; with the year in place of the day, "15 अक्टूबर 2026"
export function hindiDate(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number)
  return withYear ? `${d} ${HI_MONTHS[m - 1]} ${y}` : `${HI_WEEKDAYS[weekday(date)]}, ${d} ${HI_MONTHS[m - 1]}`
}

// "14:30" -> "दोपहर 2:30"
export function hindiTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const part = h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 20 ? 'शाम' : 'रात'
  return `${part} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`
}

// A date in the language of a patient's messages, on a page the link opens
export const dateIn = (language: MessageLanguage, date: string): string =>
  language === 'kn' ? kannadaDate(date, true) : language === 'hi' ? hindiDate(date, true) : formatDate(date)

// "call or WhatsApp us on +91 …"
const callUsKn = ({ clinic }: HasPhone) => `${clinic.phone} ಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ WhatsApp ಮಾಡಿ`
const callUsHi = ({ clinic }: HasPhone) => `${clinic.phone} पर कॉल या WhatsApp करें`
const APPOINTMENT_KN = 'ಅಪಾಯಿಂಟ್ಮೆಂಟ್'

export const firstName = (name: string) => name.trim().split(/\s+/)[0]

// "Hi Prakash," ("ನಮಸ್ಕಾರ Prakash ಅವರೇ,") and a blank line: no clinic heading, the sign-off says who it is
export function messageHeader(name: string, language: MessageLanguage = 'en'): string[] {
  return [language === 'hi' ? `नमस्ते ${firstName(name)} जी,` : language === 'kn' ? `ನಮಸ್ಕಾರ ${firstName(name)} ಅವರೇ,` : `Hi ${firstName(name)},`, '']
}

// "See you soon," before an appointment, else "Take care,"; then the dentist and the clinic with its town
// (in Kannada when the clinic has the town's Kannada name)
export function messageSignOff({ clinic, dentist }: ClinicContext, language: MessageLanguage = 'en', closing: 'soon' | 'care' = 'care'): string[] {
  return language === 'hi' ? ['', 'शुभकामनाओं सहित,', `*${dentist.name}*`, `${clinic.name}, ${clinic.place}`] : language === 'kn'
    ? ['', 'ಶುಭಾಶಯಗಳೊಂದಿಗೆ,', `*${dentist.name}*`, `${clinic.name}, ${clinic.placeKn ?? clinic.place}`]
    : ['', closing === 'soon' ? 'See you soon,' : 'Take care,', `*${dentist.name}*`, `${clinic.name}, ${clinic.place}`]
}

// "Date: *Thursday, 15 October*" and "Time: *6:00 PM*"
export function appointmentLines(startsAt: string, language: MessageLanguage = 'en'): string[] {
  const { date, time } = inIndia(startsAt)
  return language === 'hi' ? [`तारीख: *${hindiDate(date)}*`, `समय: *${hindiTime(time)}*`] : language === 'kn'
    ? [`ದಿನಾಂಕ: *${kannadaDate(date)}*`, `ಸಮಯ: *${kannadaTime(time)}*`]
    : [`Date: *${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}*`, `Time: *${formatBlock(time)}*`]
}

// The clinic in one short line (the full address goes in confirmations). The address itself is in
// English in every message: it is what the signboard and Google Maps say.
const addressLabel = (language: MessageLanguage) => (language === 'hi' ? 'पता' : language === 'kn' ? 'ವಿಳಾಸ' : 'Address')
export const shortLocation = ({ clinic }: ClinicContext, language: MessageLanguage = 'en') => `${addressLabel(language)}: ${clinic.shortAddress ?? clinic.address}`

export const questionsLine = (ctx: HasPhone, language: MessageLanguage = 'en') =>
  language === 'hi' ? `कोई सवाल हो तो ${callUsHi(ctx)}।` : language === 'kn' ? `ಏನಾದರೂ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ${callUsKn(ctx)}.` : `Any questions? Just call or WhatsApp us on ${ctx.clinic.phone}.`

const arriveEarly = (language: MessageLanguage) => (language === 'hi' ? '_कृपया 5 मिनट पहले आ जाएँ।_' : language === 'kn' ? '_ದಯವಿಟ್ಟು 5 ನಿಮಿಷ ಮುಂಚಿತವಾಗಿ ಬನ್ನಿ._' : '_Please come 5 minutes early if you can._')

// Day, time, address and directions (when the clinic has a Maps link), for a confirmed or moved appointment
function appointmentBlock(ctx: ClinicContext, startsAt: string, language: MessageLanguage): string[] {
  const { clinic } = ctx
  const kn = language === 'kn'
  return [
    '',
    ...appointmentLines(startsAt, language),
    '',
    `${addressLabel(language)}: ${clinic.address}`,
    ...(clinic.mapsLink ? [`${language === 'hi' ? 'रास्ता' : kn ? 'ದಾರಿ' : 'Directions'}: ${clinic.mapsLink}`] : []),
    '',
    arriveEarly(language),
    language === 'hi' ? `समय बदलने या रद्द करने के लिए ${callUsHi(ctx)}।` : kn ? `ಸಮಯ ಬದಲಿಸಲು ಅಥವಾ ರದ್ದುಗೊಳಿಸಲು ${callUsKn(ctx)}.` : `Need to change it? Just call or WhatsApp us on ${clinic.phone}.`,
  ]
}

type To = { name: string; language?: MessageLanguage }

// Clinic -> patient, after the dentist saves
export function confirmationMessage(ctx: ClinicContext, args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  const { clinic } = ctx
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `${clinic.name} में आपकी अपॉइंटमेंट *पक्की हो गई है*।` : language === 'kn'
      ? `${clinic.name} ನಲ್ಲಿ ನಿಮ್ಮ ${APPOINTMENT_KN} *ಖಚಿತವಾಗಿದೆ*.`
      : `Good news, your appointment at ${clinic.name} is *confirmed*.`,
    ...appointmentBlock(ctx, args.startsAt, language),
    ...messageSignOff(ctx, language, 'soon'),
  ].join('\n')
}

// Clinic -> patient, after an appointment is moved
export function movedMessage(ctx: ClinicContext, args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  const { clinic } = ctx
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `${clinic.name} में आपकी अपॉइंटमेंट का समय बदल गया है। नया समय यह है:` : language === 'kn'
      ? `${clinic.name} ನಲ್ಲಿ ನಿಮ್ಮ ${APPOINTMENT_KN} ಅನ್ನು ಈ ಸಮಯಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ:`
      : `Your appointment at ${clinic.name} has moved. Here's the new time:`,
    ...appointmentBlock(ctx, args.startsAt, language),
    ...messageSignOff(ctx, language, 'soon'),
  ].join('\n')
}

// Clinic -> patient, after an appointment is cancelled: which one, and how to book again
export function cancelledMessage(ctx: ClinicContext, args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  const { clinic } = ctx
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `${clinic.name} में आपकी यह अपॉइंटमेंट *रद्द हो गई है*:` : kn ? `${clinic.name} ನಲ್ಲಿ ನಿಮ್ಮ ಈ ${APPOINTMENT_KN} *ರದ್ದಾಗಿದೆ*:` : `Your appointment at ${clinic.name} is *cancelled*:`,
    '',
    ...appointmentLines(args.startsAt, language),
    '',
    language === 'hi' ? `जब भी नया समय चाहें, ${callUsHi(ctx)}।` : kn ? `ಹೊಸ ಸಮಯ ಬುಕ್ ಮಾಡಲು ${callUsKn(ctx)}.` : `Whenever you'd like a new time, just call or WhatsApp us on ${clinic.phone}.`,
    ...messageSignOff(ctx, language),
  ].join('\n')
}

// Clinic -> patient, when the requested time can't be given
export function declineMessage(ctx: ClinicContext, args: To): string {
  const { language = 'en' } = args
  const { clinic } = ctx
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `${clinic.name} से संपर्क करने के लिए धन्यवाद।` : kn ? `${clinic.name} ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.` : `Thank you for getting in touch with ${clinic.name}.`,
    '',
    language === 'hi' ? `माफ़ कीजिए, आपका बताया हुआ समय हम नहीं दे पाए। कृपया ${callUsHi(ctx)}, हम आपके लिए सही समय ढूँढ लेंगे।` : kn
      ? `ಕ್ಷಮಿಸಿ, ನೀವು ಕೇಳಿದ ಸಮಯವನ್ನು ನಮಗೆ ಹೊಂದಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ${callUsKn(ctx)}, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಸಮಯವನ್ನು ಹುಡುಕೋಣ.`
      : `Sorry, we couldn't fit the time you asked for. Just call or WhatsApp us on ${clinic.phone} and we'll find a time that suits you.`,
    ...messageSignOff(ctx, language),
  ].join('\n')
}

// Clinic -> patient, the day before (or before the weekend's Friday): the time, and how to change it
export function reminderMessage(ctx: ClinicContext, args: To & { startsAt: string; tomorrow: boolean }): string {
  const { language = 'en' } = args
  const { clinic } = ctx
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? (args.tomorrow ? 'याद दिलाना था कि कल आपकी अपॉइंटमेंट है:' : 'याद दिलाना था कि आपकी अपॉइंटमेंट आने वाली है:') : kn
      ? (args.tomorrow ? `ನಾಳೆ ನಿಮ್ಮ ${APPOINTMENT_KN} ಇದೆ ಎಂದು ನೆನಪಿಸುತ್ತಿದ್ದೇವೆ:` : `ನಿಮ್ಮ ಮುಂದಿನ ${APPOINTMENT_KN} ಬಗ್ಗೆ ನೆನಪಿಸುತ್ತಿದ್ದೇವೆ:`)
      : `Just a friendly reminder of your appointment ${args.tomorrow ? 'tomorrow' : 'coming up'}:`,
    '',
    ...appointmentLines(args.startsAt, language),
    shortLocation(ctx, language),
    '',
    arriveEarly(language),
    language === 'hi' ? `अगर आप नहीं आ पाएँ तो कृपया ${callUsHi(ctx)}, ताकि वह समय किसी और को दे सकें।` : kn
      ? `ಬರಲು ಆಗದಿದ್ದರೆ ದಯವಿಟ್ಟು ${callUsKn(ctx)}, ಆ ಸಮಯವನ್ನು ಬೇರೆಯವರಿಗೆ ನೀಡುತ್ತೇವೆ.`
      : `If you can't make it, please let us know on ${clinic.phone}, so we can give the time to someone else.`,
    ...messageSignOff(ctx, language, 'soon'),
  ].join('\n')
}

// Clinic -> patient, after a missed appointment: kind, and an easy way back
export function missedMessage(ctx: ClinicContext, args: To & { startsAt: string }): string {
  const { language = 'en' } = args
  const { date } = inIndia(args.startsAt)
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `${hindiDate(date)} को आपकी अपॉइंटमेंट पर आपसे मिलना नहीं हो पाया। उम्मीद है सब ठीक है।` : kn
      ? `${kannadaDate(date)} ರಂದು ನಿಮ್ಮ ${APPOINTMENT_KN} ಸಮಯದಲ್ಲಿ ನಿಮ್ಮನ್ನು ಕಾಣಲಾಗಲಿಲ್ಲ. ಎಲ್ಲವೂ ಚೆನ್ನಾಗಿದೆ ಎಂದು ಆಶಿಸುತ್ತೇವೆ.`
      : `We missed you at your appointment on ${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}. We hope all is well!`,
    '',
    language === 'hi' ? 'इस संदेश का जवाब दें, हम आपके लिए सही नया समय तय कर देंगे।' : kn ? 'ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಹೊಸ ಸಮಯವನ್ನು ನಿಗದಿಪಡಿಸುತ್ತೇವೆ.' : "Just reply to this message and we'll find a new time that suits you.",
    ...messageSignOff(ctx, language),
  ].join('\n')
}

// Clinic -> patient, from the Cockpit's "Running late", to the patients still to come today. The dentist is
// named by their short name ("Dr. Rahil"), else their whole name.
export function runningLateMessage(ctx: ClinicContext, args: To & { startsAt: string; minutes: number }): string {
  const { language = 'en' } = args
  const { clinic, dentist } = ctx
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `${dentist.shortName ?? dentist.name} आज लगभग ${args.minutes} मिनट देर से चल रहे हैं। इंतज़ार के लिए माफ़ कीजिए।` : kn
      ? `${dentist.shortNameKn ?? dentist.shortName ?? dentist.name} ಅವರು ಇಂದು ಸುಮಾರು ${args.minutes} ನಿಮಿಷ ತಡವಾಗಿದ್ದಾರೆ. ಕಾಯಿಸುತ್ತಿರುವುದಕ್ಕೆ ಕ್ಷಮಿಸಿ.`
      : `${dentist.shortName ?? dentist.name} is running about ${args.minutes} minutes late today. Sorry to keep you waiting!`,
    '',
    language === 'hi' ? 'आपकी अपॉइंटमेंट:' : kn ? `ನಿಮ್ಮ ${APPOINTMENT_KN}:` : 'Your appointment:',
    ...appointmentLines(args.startsAt, language),
    '',
    language === 'hi' ? `आप अपने समय से लगभग ${args.minutes} मिनट बाद आ सकते हैं। अगर यह ठीक न लगे तो ${callUsHi(ctx)}।` : kn
      ? `ನಿಮ್ಮ ಸಮಯಕ್ಕಿಂತ ಸುಮಾರು ${args.minutes} ನಿಮಿಷ ತಡವಾಗಿ ಬರಬಹುದು. ಅದು ಅನುಕೂಲವಾಗದಿದ್ದರೆ ${callUsKn(ctx)}.`
      : `Feel free to come about ${args.minutes} minutes after your time. If that doesn't suit you, just call or WhatsApp us on ${clinic.phone}.`,
    ...messageSignOff(ctx, language, 'soon'),
  ].join('\n')
}

// Clinic -> patient, about six months after their last visit
export function recallMessage(ctx: ClinicContext, args: To & { lastVisit: string }): string {
  const { language = 'en' } = args
  const kn = language === 'kn'
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `आपकी पिछली विज़िट (${hindiDate(args.lastVisit, true)}) को लगभग छह महीने हो गए हैं, अब जाँच का समय है।` : kn
      ? `ನಿಮ್ಮ ಕೊನೆಯ ಭೇಟಿಯಿಂದ (${kannadaDate(args.lastVisit, true)}) ಸುಮಾರು ಆರು ತಿಂಗಳಾಗಿದೆ.`
      : `It's been about six months since your last visit (${formatDate(args.lastVisit, { day: 'numeric', month: 'long', year: 'numeric' })}), so it's time for a check-up.`,
    '',
    language === 'hi' ? 'हर छह महीने में जाँच और सफ़ाई से दाँत और मसूड़े स्वस्थ रहते हैं और छोटी समस्याएँ जल्दी पकड़ में आ जाती हैं।' : kn
      ? 'ಪ್ರತಿ ಆರು ತಿಂಗಳಿಗೊಮ್ಮೆ ತಪಾಸಣೆ ಮತ್ತು ಹಲ್ಲು ಸ್ವಚ್ಛಗೊಳಿಸುವುದರಿಂದ ಹಲ್ಲು ಮತ್ತು ಒಸಡುಗಳು ಆರೋಗ್ಯವಾಗಿರುತ್ತವೆ, ಸಣ್ಣ ಸಮಸ್ಯೆಗಳು ಬೇಗನೆ ತಿಳಿಯುತ್ತವೆ.'
      : 'A check-up and cleaning every six months keeps your teeth and gums healthy and catches small problems early.',
    '',
    language === 'hi' ? 'इस संदेश का जवाब दें, हम आपके लिए सही समय बुक कर देंगे।' : kn ? 'ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಸಮಯವನ್ನು ಬುಕ್ ಮಾಡುತ್ತೇವೆ.' : "Just reply to this message and we'll book a time that suits you.",
    ...messageSignOff(ctx, language),
  ].join('\n')
}

// Clinic -> patient: a Google review request, the same words for every patient (Google does not allow
// asking only happy patients, or offering anything in return). The link is the clinic's review link, else its
// Maps page; a clinic with neither has nothing to ask for (Clinic OS doesn't offer it), and the words go alone.
export function reviewMessage(ctx: ClinicContext, args: To): string {
  const { language = 'en' } = args
  const { clinic } = ctx
  const kn = language === 'kn'
  const link = reviewLinkOf(clinic)
  return [
    ...messageHeader(args.name, language),
    language === 'hi' ? `${clinic.name} आने के लिए धन्यवाद।` : kn ? `${clinic.name} ಗೆ ಭೇಟಿ ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.` : `Thank you for visiting ${clinic.name}!`,
    '',
    language === 'hi' ? 'अगर आपके पास एक मिनट हो, तो Google पर एक छोटा सा रिव्यू लिख दें। इससे आस-पास के लोगों को क्लिनिक ढूँढने में मदद मिलती है:' : kn
      ? 'ಒಂದು ನಿಮಿಷ ಸಮಯವಿದ್ದರೆ, Google ನಲ್ಲಿ ಒಂದು ಚಿಕ್ಕ ವಿಮರ್ಶೆ (review) ಬರೆಯಿರಿ. ಇದರಿಂದ ಈ ಭಾಗದ ಇತರರಿಗೆ ಕ್ಲಿನಿಕ್ ಹುಡುಕಲು ಸಹಾಯವಾಗುತ್ತದೆ:'
      : 'If you have a minute, a short Google review helps other people in the area find the clinic:',
    ...(link ? [link] : []),
    ...messageSignOff(ctx, language),
  ].join('\n')
}
