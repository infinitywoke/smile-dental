import { siteConfig } from '@/config/site'
import { formatDate } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'

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
    ...(args.voiceNote === 'recorded' ? ['🎤 Voice note: open the request to listen'] : []),
    ...(args.voiceNote === 'whatsapp' ? ["🎤 I'll send a voice note about my problem next"] : []),
    '',
    `Open in Clinic OS: ${args.link}`,
  ].join('\n')
}

// ---- Clinic -> patient: every message has the same look (WhatsApp styling: *bold*, _italic_, "- " lists).
// The patient's first name is the only thing about them in any message.

export const firstName = (name: string) => name.trim().split(/\s+/)[0]

// "*Smile Dental Clinic*", "_Dr. Rahil Yusuf, BDS_", then "Dear Prakash,"
export function messageHeader(name: string): string[] {
  const degree = siteConfig.dentist.qualifications.split(',')[0].trim()
  return [`*${siteConfig.name}*`, `_${siteConfig.dentist.name}, ${degree}_`, '', `Dear ${firstName(name)},`]
}

export function messageSignOff(): string[] {
  return ['', 'Warm regards,', `*${siteConfig.dentist.name}*`, `${siteConfig.name}, Katapadi`]
}

// "📅 *Thursday, 15 October*" and "🕗 *6:00 PM*"
export function appointmentLines(startsAt: string): string[] {
  const { date, time } = inIndia(startsAt)
  return [`📅 *${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}*`, `🕗 *${formatBlock(time)}*`]
}

// The clinic in one short line (the full address goes in confirmations)
export const SHORT_LOCATION = '📍 1st Floor, YM Zohara Building, Shirva Road, Katapadi'

export const QUESTIONS_LINE = `For any questions, call or WhatsApp us on ${siteConfig.phone}.`

// Day, time, address and directions, for a confirmed or moved appointment
function appointmentBlock(startsAt: string): string[] {
  return [
    '',
    ...appointmentLines(startsAt),
    '',
    `📍 ${siteConfig.address}`,
    `Directions: ${siteConfig.googleReviewsLink}`,
    '',
    '_Please arrive 5 minutes early._',
    `To change or cancel, call or WhatsApp us on ${siteConfig.phone}.`,
  ]
}

// Clinic -> patient, after Dr. Rahil saves
export function confirmationMessage(args: { name: string; startsAt: string }): string {
  return [
    ...messageHeader(args.name),
    `Your appointment at ${siteConfig.name} is *confirmed*.`,
    ...appointmentBlock(args.startsAt),
    ...messageSignOff(),
  ].join('\n')
}

// Clinic -> patient, after an appointment is moved
export function movedMessage(args: { name: string; startsAt: string }): string {
  return [
    ...messageHeader(args.name),
    `Your appointment at ${siteConfig.name} has been moved to:`,
    ...appointmentBlock(args.startsAt),
    ...messageSignOff(),
  ].join('\n')
}

// Clinic -> patient, after an appointment is cancelled: which one, and how to book again
export function cancelledMessage(args: { name: string; startsAt: string }): string {
  return [
    ...messageHeader(args.name),
    `Your appointment at ${siteConfig.name} has been *cancelled*:`,
    '',
    ...appointmentLines(args.startsAt),
    '',
    `To book a new time, call or WhatsApp us on ${siteConfig.phone}.`,
    ...messageSignOff(),
  ].join('\n')
}

// Clinic -> patient, when the requested time can't be given
export function declineMessage(args: { name: string }): string {
  return [
    ...messageHeader(args.name),
    `Thank you for contacting ${siteConfig.name}.`,
    '',
    `We're sorry, we couldn't fit the time you asked for. Please call or WhatsApp us on ${siteConfig.phone} and we'll find a time that suits you.`,
    ...messageSignOff(),
  ].join('\n')
}

// Clinic -> patient, the day before (or before the weekend's Friday): the time, and how to change it
export function reminderMessage(args: { name: string; startsAt: string; tomorrow: boolean }): string {
  return [
    ...messageHeader(args.name),
    `A reminder of your appointment ${args.tomorrow ? 'tomorrow' : 'coming up'}:`,
    '',
    ...appointmentLines(args.startsAt),
    SHORT_LOCATION,
    '',
    '_Please arrive 5 minutes early._',
    `If you can't make it, please call or WhatsApp us on ${siteConfig.phone}, so we can give the time to someone else.`,
    ...messageSignOff(),
  ].join('\n')
}

// Clinic -> patient, after a missed appointment: kind, and an easy way back
export function missedMessage(args: { name: string; startsAt: string }): string {
  const { date } = inIndia(args.startsAt)
  return [
    ...messageHeader(args.name),
    `We missed you at your appointment on ${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}. We hope all is well.`,
    '',
    'Reply to this message and we will find a new time that suits you.',
    ...messageSignOff(),
  ].join('\n')
}

// Clinic -> patient, about six months after their last visit
export function recallMessage(args: { name: string; lastVisit: string }): string {
  return [
    ...messageHeader(args.name),
    `It has been about six months since your last visit (${formatDate(args.lastVisit, { day: 'numeric', month: 'long', year: 'numeric' })}).`,
    '',
    'A check-up and cleaning every six months keeps your teeth and gums healthy and catches small problems early.',
    '',
    'Reply to this message and we will book a time that suits you.',
    ...messageSignOff(),
  ].join('\n')
}
