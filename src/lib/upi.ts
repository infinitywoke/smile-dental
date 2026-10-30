import type { ClinicUpi } from '@/lib/clinic'

// A plain UPI payment link: any UPI app that scans it shows the clinic as payee with the amount filled in.
// There is no payment gateway; the doctor confirms receipt himself. The payee is the clinic's own (a clinic
// with none set up gets no UPI code: Clinic OS doesn't offer it).
export function upiLink(upi: ClinicUpi, args: { amount: number; note?: string }): string {
  const params = new URLSearchParams()
  params.set('pa', upi.id)
  params.set('pn', upi.payee)
  params.set('am', args.amount.toFixed(2))
  params.set('cu', 'INR')
  // UPI apps accept a short note without special characters
  const note = (args.note ?? '').replace(/[^A-Za-z0-9 .\-]/g, '').trim().slice(0, 40)
  if (note) params.set('tn', note)
  // URLSearchParams writes spaces as "+"; UPI apps want %20
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`
}
