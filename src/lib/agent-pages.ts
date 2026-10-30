import { CONTENT_SIGNAL } from '@/config/agents'
import { bookingReasons, faqs, siteConfig, type Treatment } from '@/config/site'
import { OPEN_SESSIONS } from '@/lib/clinic-hours'
import { homeServicesFor, toothAreasFor, treatmentGroups } from '@/lib/price-list'
import { formatRupees, parsePrice, priceForPatients } from '@/lib/pricing'
import { formatBlock } from '@/lib/schedule'
import { clinicWhatsappLink } from '@/lib/website-whatsapp'

// The website for AI assistants and agents, in Markdown:
// - /llms.txt says what the site is and where everything is (the llmstxt.org format);
// - /llms-full.txt is all of it in one file;
// - each page has a Markdown copy at its address with .md (/index.md for the homepage), which the page
//   also sends to a request that asks for text/markdown, as agents do (src/config/agents.ts).
// All of it comes from what the pages come from, the clinic's details (src/config/site.ts) and its price
// list, so a copy never says what its page doesn't.

const site = siteConfig.url
const hours = OPEN_SESSIONS.map(([from, until]) => `${formatBlock(from)} – ${formatBlock(until)}`).join(' and ')
const PRICES_NOTE = "The clinic's own prices. Dr. Rahil examines first, and explains the options and the cost before any treatment."

export const markdownPath = (path: string) => (path === '/' ? '/index.md' : `${path}.md`)

// A treatment's Book link picks its heading on the booking card, as its page does
function groupOf(list: Treatment[], slug: string) {
  const group = treatmentGroups(list).find((g) => g.items.some((t) => t.slug === slug))
  return { group, reason: !group || group.id === 'other' ? 'unsure' : group.id }
}

// The price a treatment starts at: its one price, or the lowest of its options
function startingPrice(t: Treatment): string | null {
  const options = t.pricing ?? []
  if (options.length === 1) return priceForPatients(options[0].cost)
  const amounts = options.flatMap(({ cost }) => {
    const price = parsePrice(cost)
    if (price.kind === 'fixed') return [price.amount]
    if (price.kind === 'range') return [price.min]
    if (price.kind === 'formula') return [price.base]
    return []
  })
  return amounts.length > 0 ? `from ${formatRupees(Math.min(...amounts))}` : null
}

const priceLines = (t: Treatment) => (t.pricing ?? []).map((p) => `- ${p.detail}: ${priceForPatients(p.cost)}`)

function visitDetails(): string[] {
  return [
    `- **Dentist:** ${siteConfig.dentist.name}, BDS (Yenepoya Deemed to be University, 2020), with 5 years of practice in India and the Middle East. He sees every patient himself.`,
    `- **Address:** ${siteConfig.address}, Udupi, Karnataka, India ([Google Maps](${siteConfig.directionsLink}))`,
    `- **Open:** ${hours}, every day except Friday (open on Sundays)`,
    `- **Phone and WhatsApp:** ${siteConfig.phone}`,
    `- **Email:** ${siteConfig.email}`,
    '- **Payment:** cash or UPI',
    `- **Book online:** ${site}/book (no account needed; the clinic confirms the time on WhatsApp)`,
  ]
}

function howBookingWorks(): string[] {
  const reasons = bookingReasons.map((r) => r.label.toLowerCase()).join(', ')
  return [
    `1. Open ${site}/book and say what the visit is for: ${reasons}.`,
    "2. Pick a day, then a free time, from Dr. Rahil's own calendar. Online times go four weeks ahead.",
    "3. Give the patient's name and WhatsApp number. Booking for someone else? Use their number: the confirmation goes to it.",
    '4. Send the request. It is saved for the clinic, and WhatsApp opens with it written: send it there too, and Dr. Rahil confirms the time on WhatsApp.',
    '',
    `No time that suits, or online booking paused? WhatsApp or call the clinic on ${siteConfig.phone}, and Dr. Rahil will find a time.`,
  ]
}

// The whole price list under the homepage's headings: each treatment, what it is, every option's price
function priceList(list: Treatment[], level: '##' | '###'): string[] {
  return treatmentGroups(list).flatMap((group) => [
    `${level} ${group.name}`,
    '',
    ...group.items.flatMap((t) => [
      `${level}# [${t.name}](${site}/treatments/${t.slug})`,
      '',
      ...(t.shortDescription ? [t.shortDescription, ''] : []),
      ...priceLines(t),
      '',
    ]),
    `[Book](${site}/book?reason=${group.id === 'other' ? 'unsure' : group.id})`,
    '',
  ])
}

// "Not sure what you need?": what each part of the mouth usually needs, and what it costs
function notSure(list: Treatment[]): string[] {
  return Object.values(toothAreasFor(list)).flatMap((area) => [
    `### ${area.title}`,
    '',
    area.body,
    '',
    ...area.items.map(([what, price]) => `- ${what}: ${price}`),
    '',
    `[${area.cta}](${site}/book?reason=${area.reason})`,
    '',
  ])
}

function dentist(): string[] {
  return [
    `**${siteConfig.dentist.name}, BDS.** He takes the time to understand each patient's needs and explains treatment options in a simple and reassuring way.`,
    '',
    '- BDS from Yenepoya (Deemed to be University), 2020',
    '- 5 years of practice in India and the Middle East',
    '- Sees every patient himself, from the first check-up to the last sitting',
    '',
  ]
}

const questions = () => faqs.filter((f) => f.isVerified).flatMap((f) => [`### ${f.question}`, '', f.answer, ''])

export function homeMarkdown(list: Treatment[]): string {
  return [
    `# ${siteConfig.name}, Katapadi, Udupi`,
    '',
    '> A dentist who takes the time to explain: check-ups, cleaning, fillings, root canals, crowns, braces and dentures on Shirva Road, Katapadi.',
    '',
    ...visitDetails(),
    '',
    '## How booking works',
    '',
    ...howBookingWorks(),
    '',
    '## Treatments and prices',
    '',
    "The clinic's own prices. Some depend on the material chosen or how much work a tooth needs; the full list shows every option.",
    '',
    ...homeServicesFor(list).map((s) => `- **${s.name}**${s.price ? ` (${s.price})` : ''}: ${s.line} [Book](${site}/book?reason=${s.id})`),
    '',
    `[See the full price list](${site}/treatments)`,
    '',
    '## Not sure what you need?',
    '',
    ...notSure(list),
    '## Your dentist',
    '',
    ...dentist(),
    '## Questions',
    '',
    ...questions(),
  ].join('\n')
}

export function bookMarkdown(): string {
  return [
    `# Book an appointment at ${siteConfig.name}, Katapadi`,
    '',
    "> Pick a free time from Dr. Rahil Yusuf's calendar. No account needed; the clinic confirms your time on WhatsApp.",
    '',
    '## How booking works',
    '',
    ...howBookingWorks(),
    '',
    '## Visit',
    '',
    ...visitDetails(),
    '',
  ].join('\n')
}

export function treatmentsMarkdown(list: Treatment[]): string {
  return [
    `# Treatments and prices at ${siteConfig.name}, Katapadi`,
    '',
    `> Every treatment, with the price. ${PRICES_NOTE}`,
    '',
    ...priceList(list, '##'),
  ].join('\n')
}

export function treatmentMarkdown(t: Treatment, list: Treatment[]): string {
  const { group, reason } = groupOf(list, t.slug)
  const related = (group?.items ?? []).filter((r) => r.slug !== t.slug)
  return [
    `# ${t.name}`,
    '',
    ...(t.shortDescription ? [`> ${t.shortDescription}`, ''] : []),
    `At ${siteConfig.name}, Katapadi, Udupi, with ${siteConfig.dentist.name}, BDS.`,
    '',
    '## Prices',
    '',
    ...(t.description ? [t.description, ''] : []),
    ...priceLines(t),
    '',
    PRICES_NOTE,
    '',
    '## Book a visit',
    '',
    `[Book an appointment](${site}/book?reason=${reason}): pick a free time from Dr. Rahil's calendar, and the clinic confirms it on WhatsApp. Or [ask about it on WhatsApp](${clinicWhatsappLink(`Hello, I have a question about ${t.name}.`)}).`,
    ...(related.length > 0 ? ['', '## See also', '', ...related.map((r) => `- [${r.name}](${site}/treatments/${r.slug})`)] : []),
    '',
  ].join('\n')
}

// The Markdown copy of a website page, by the page's path; null for a page with none
export function pageMarkdown(path: string, list: Treatment[]): string | null {
  if (path === '/') return homeMarkdown(list)
  if (path === '/book') return bookMarkdown()
  if (path === '/treatments') return treatmentsMarkdown(list)
  const slug = path.match(/^\/treatments\/([a-z0-9-]+)$/)?.[1]
  const treatment = slug ? list.find((t) => t.slug === slug) : undefined
  return treatment ? treatmentMarkdown(treatment, list) : null
}

export function llmsTxt(list: Treatment[]): string {
  const md = (path: string) => `${site}${markdownPath(path)}`
  return [
    `# ${siteConfig.name}, Katapadi`,
    '',
    `> Dental clinic in Katapadi, Udupi (Karnataka, India), run by ${siteConfig.dentist.name}, BDS. Open ${hours}, every day except Friday. Book online at ${site}/book; the clinic confirms the time on WhatsApp.`,
    '',
    ...visitDetails(),
    '',
    `${PRICES_NOTE} Every page is also in Markdown: add .md to its address (/index.md for the homepage), or ask for text/markdown.`,
    '',
    '## Pages',
    '',
    `- [Home](${md('/')}): the clinic, its treatments and prices, the dentist and common questions`,
    `- [Book an appointment](${md('/book')}): how to book a free time online`,
    `- [Treatments and prices](${md('/treatments')}): every treatment and option, with the price`,
    '',
    '## Treatments',
    '',
    ...list.map((t) => {
      const from = startingPrice(t)
      return `- [${t.name}](${md(`/treatments/${t.slug}`)})${from ? `: ${from}` : ''}${t.shortDescription ? `. ${t.shortDescription}` : ''}`
    }),
    '',
    '## Optional',
    '',
    `- [Everything in one file](${site}/llms-full.txt)`,
    `- [Privacy policy](${site}/privacy): how the clinic handles patients' information`,
    '',
  ].join('\n')
}

export function llmsFullTxt(list: Treatment[]): string {
  return [
    `# ${siteConfig.name}, Katapadi, Udupi`,
    '',
    `> Everything on ${site} in one file: the clinic, how to book, every treatment with its prices, the dentist and common questions.`,
    '',
    ...visitDetails(),
    '',
    '## How booking works',
    '',
    ...howBookingWorks(),
    '',
    '## Treatments and prices',
    '',
    PRICES_NOTE,
    '',
    ...priceList(list, '###'),
    '## Not sure what you need?',
    '',
    ...notSure(list),
    '## Your dentist',
    '',
    ...dentist(),
    '## Questions',
    '',
    ...questions(),
    '## Privacy',
    '',
    `How the clinic handles patients' information: ${site}/privacy`,
    '',
  ].join('\n')
}

// llms.txt and the whole site in one file: plain text, so a browser shows it too
export function textResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Signal': CONTENT_SIGNAL } })
}

// A page's Markdown copy. The page itself is the one to index (canonical), and a cache must not hand
// this copy to a person asking for the same address (Vary).
export function markdownResponse(markdown: string, path: string): Response {
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      Link: `<${site}${path}>; rel="canonical"`,
      'Content-Signal': CONTENT_SIGNAL,
    },
  })
}
