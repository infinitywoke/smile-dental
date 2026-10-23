// What a visit message's short link shows (share_links.photos), kept when the message is made
// (prepareWhatsapp in src/lib/actions/visits.ts): each ticked photo with its 30-day file link, and the
// typed prescription, which the link's page draws on the clinic's letterhead (src/app/r/[token]/page.tsx)
export type SharedPhoto = { label: string; url: string }
export type SharedPrescription = { kind: 'prescription'; label: 'Prescription'; medicines: string[]; advice: string }
export type SharedItem = SharedPhoto | SharedPrescription

export const isSharedPrescription = (item: SharedItem): item is SharedPrescription => 'kind' in item && item.kind === 'prescription'
