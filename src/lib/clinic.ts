// The clinic Clinic OS is working for, as the database holds it (clinics and dentists, supabase/multi-clinic-3-2026-10.sql):
// the details that go into its messages, prescriptions, UPI code and Tally files, and the dentist they are
// from. Pure and plain data, so a server page can hand it to a client component.
// src/config/site.ts is the Smile Dental website's own content and is never a fallback here: a clinic that is
// missing a detail gets a clear error or a hidden feature, never another clinic's phone.

// What Send to Tally starts from, as the clinic's Tally has it. Any of these may be empty.
export type ClinicTally = {
  // "Tally.ERP 9", "TallyPrime"
  version: string
  // The company's name in Tally: a file goes only into it
  company: string
  cashLedger: string
  bankLedger: string
  // The group the patients' own ledgers sit under
  patientGroup: string
  // Only for "one entry per day"
  incomeLedger: string
}

// The chair's camera monitor, where a clinic has one: its own Wi-Fi, and where its QR codes point
export type ChairMonitor = { name: string; wifi: string; password: string; address: string }

// Who a UPI payment goes to
export type ClinicUpi = { id: string; payee: string }

export type Clinic = {
  id: string
  // Public and stable: what the clinic's website names it by
  slug: string
  name: string
  // The town, in English and in Kannada (the sign-off of a message)
  place: string
  placeKn: string | null
  phone: string
  whatsapp: string | null
  email: string | null
  // In full, and in one line (for a reminder)
  address: string
  shortAddress: string | null
  mapsLink: string | null
  // Where a patient writes a Google review
  reviewLink: string | null
  upi: ClinicUpi | null
  // A public path such as "/images/logo.jpg"
  logo: string | null
  tally: ClinicTally
  chairMonitor: ChairMonitor | null
}

export type ClinicDentist = {
  id: string
  name: string
  // "Dr. Rahil": for "Dr. Rahil is running late", and in Kannada
  shortName: string | null
  shortNameKn: string | null
  qualifications: string | null
  // The registration number printed on a prescription
  registration: string | null
  // A public path to the signature drawn on a prescription
  signature: string | null
}

// The clinic, and the dentist its messages and prescriptions are from
export type ClinicContext = { clinic: Clinic; dentist: ClinicDentist }

// The degree alone: the first part of the qualifications ("BDS, November 2020 - …" is printed as "BDS")
export const degreeOf = (dentist: Pick<ClinicDentist, 'qualifications'>): string => dentist.qualifications?.split(',')[0].trim() ?? ''

// The link a review request carries: the clinic's "write a review" link, else its Maps page (the patient
// then taps Reviews, Write a review). With neither, no review is asked for.
export const reviewLinkOf = (clinic: Pick<Clinic, 'reviewLink' | 'mapsLink'>): string | null => clinic.reviewLink ?? clinic.mapsLink

// A row of public.clinics and of public.dentists, as the database sends them
export type ClinicRow = {
  id: string
  slug: string
  name: string | null
  place: string | null
  place_kn: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  address: string | null
  short_address: string | null
  maps_link: string | null
  review_link: string | null
  upi_id: string | null
  upi_payee: string | null
  logo: string | null
  tally: unknown
  chair_monitor: unknown
}
export type DentistRow = {
  id: string
  name: string | null
  user_id: string | null
  active: boolean
  short_name: string | null
  short_name_kn: string | null
  qualifications: string | null
  registration: string | null
  signature: string | null
}

// A detail as typed: trimmed, and null when it is blank
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

function notSetUp(what: string): never {
  throw new Error(`This clinic isn't set up yet: ${what}`)
}

const tallyOf = (value: unknown): ClinicTally => {
  const tally = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    version: text(tally.version) ?? '',
    company: text(tally.company) ?? '',
    cashLedger: text(tally.cashLedger) ?? '',
    bankLedger: text(tally.bankLedger) ?? '',
    patientGroup: text(tally.patientGroup) ?? '',
    incomeLedger: text(tally.incomeLedger) ?? '',
  }
}

// A monitor with any of its four details missing is no monitor: its screen couldn't tell how to connect
const monitorOf = (value: unknown): ChairMonitor | null => {
  const monitor = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const [name, wifi, password, address] = [monitor.name, monitor.wifi, monitor.password, monitor.address].map(text)
  return name && wifi && password && address ? { name, wifi, password, address } : null
}

// The clinic row and its dentists as the app uses them (camelCase). The dentist is the signed-in person's own
// (their login's row), else the clinic's first active one; `dentists` comes oldest first. A missing name,
// phone, place, address or dentist is an error that says what: the clinic isn't ready to send messages.
export function clinicContext(row: ClinicRow | null, dentists: DentistRow[], userId: string): ClinicContext {
  if (!row) return notSetUp('the clinic was not found')
  const name = text(row.name) ?? notSetUp('name')
  const phone = text(row.phone) ?? notSetUp('phone')
  const place = text(row.place) ?? notSetUp('place')
  const address = text(row.address) ?? notSetUp('address')
  const mine = dentists.find((d) => d.user_id === userId) ?? dentists.find((d) => d.active)
  const dentistName = text(mine?.name)
  if (!mine || !dentistName) return notSetUp('dentist')

  const upiId = text(row.upi_id)
  return {
    clinic: {
      id: row.id,
      slug: row.slug,
      name,
      place,
      placeKn: text(row.place_kn),
      phone,
      whatsapp: text(row.whatsapp),
      email: text(row.email),
      address,
      shortAddress: text(row.short_address),
      mapsLink: text(row.maps_link),
      reviewLink: text(row.review_link),
      // The payee a UPI app shows: the one given, else the clinic's own name
      upi: upiId ? { id: upiId, payee: text(row.upi_payee) ?? name } : null,
      logo: text(row.logo),
      tally: tallyOf(row.tally),
      chairMonitor: monitorOf(row.chair_monitor),
    },
    dentist: {
      id: mine.id,
      name: dentistName,
      shortName: text(mine.short_name),
      shortNameKn: text(mine.short_name_kn),
      qualifications: text(mine.qualifications),
      registration: text(mine.registration),
      signature: text(mine.signature),
    },
  }
}
