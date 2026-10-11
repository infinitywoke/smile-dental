import { siteConfig } from '@/config/site'
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

// Patient -> clinic: short, with the private link that opens the request in Clinic OS
export function bookingRequestMessage(args: { name: string; phone: string; startsAt: string; reason: string; link: string }): string {
  return [
    '*Appointment request (website)*',
    `Name: ${args.name}`,
    `Phone: ${args.phone}`,
    `Time: ${when(args.startsAt)}`,
    ...(args.reason ? [`Reason: ${args.reason}`] : []),
    '',
    `Open in Clinic OS: ${args.link}`,
  ].join('\n')
}

// Clinic -> patient, after Dr. Rahil saves
export function confirmationMessage(args: { name: string; startsAt: string }): string {
  const first = args.name.trim().split(/\s+/)[0]
  return [
    `Hello ${first}, your appointment at ${siteConfig.name}, Katapadi is confirmed ✅`,
    '',
    `📅 ${when(args.startsAt)}`,
    `📍 ${siteConfig.address}`,
    `Directions: ${siteConfig.googleReviewsLink}`,
    '',
    `Please arrive 5 minutes early. To change or cancel, call or WhatsApp ${siteConfig.phone}.`,
    `– ${siteConfig.dentist.name}`,
  ].join('\n')
}

// Clinic -> patient, after an appointment is moved
export function movedMessage(args: { name: string; startsAt: string }): string {
  const first = args.name.trim().split(/\s+/)[0]
  return [
    `Hello ${first}, your appointment at ${siteConfig.name}, Katapadi has been moved to ${when(args.startsAt)} ✅`,
    '',
    `📍 ${siteConfig.address}`,
    `Directions: ${siteConfig.googleReviewsLink}`,
    '',
    `Please arrive 5 minutes early. To change or cancel, call or WhatsApp ${siteConfig.phone}.`,
    `– ${siteConfig.dentist.name}`,
  ].join('\n')
}

// Clinic -> patient, when the requested time can't be given
export function declineMessage(args: { name: string }): string {
  const first = args.name.trim().split(/\s+/)[0]
  return [
    `Hello ${first}, thank you for contacting ${siteConfig.name}.`,
    '',
    `We couldn't fit the time you asked for. Please call or WhatsApp us on ${siteConfig.phone} and we'll find a time that suits you.`,
    `– ${siteConfig.dentist.name}`,
  ].join('\n')
}
