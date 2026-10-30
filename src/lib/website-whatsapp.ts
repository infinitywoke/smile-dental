import { siteConfig } from '@/config/site'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { whatsappLink } from '@/lib/whatsapp'

// The website's own WhatsApp messages: a visitor writing to Smile Dental Clinic, so they read the website's
// content (src/config/site.ts). Clinic OS's messages to patients are in src/lib/whatsapp.ts and read the
// signed-in clinic's details from the database instead.

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
