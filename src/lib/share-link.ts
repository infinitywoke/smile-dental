// What a visit message's short link shows (share_links.photos), kept when the message is made
// (prepareWhatsapp in src/lib/actions/visits.ts): the typed prescription, which the link's page draws
// on the clinic's letterhead (src/app/r/[token]/page.tsx), each ticked photo with its 30-day file link,
// and the visit's bill as it stood when the message went
export type SharedPhoto = { label: string; url: string }
export type SharedPrescription = {
  kind: 'prescription'
  label: 'Prescription'
  medicines: string[]
  advice: string
  // The patient's name and age, as the prescription carries them (links made before 24 Oct have neither)
  patient?: string
  age?: number | null
}
export type SharedBill = {
  kind: 'bill'
  label: 'Bill'
  lines: { description: string; amount: number }[]
  total: number
  paid: number
  // How it was paid at this visit: "Cash", "UPI"
  methods: string[]
  // From the patient's other visits: owed (more than 0) or held in advance (less than 0)
  earlier: number
  // After this visit, all visits together: owed (more than 0) or held in advance (less than 0)
  due: number
}
export type SharedItem = SharedPhoto | SharedPrescription | SharedBill

export const isSharedPrescription = (item: SharedItem): item is SharedPrescription => 'kind' in item && item.kind === 'prescription'
export const isSharedBill = (item: SharedItem): item is SharedBill => 'kind' in item && item.kind === 'bill'
