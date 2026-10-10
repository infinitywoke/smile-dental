import { siteConfig } from '@/config/site'

// A plain UPI payment link: any UPI app that scans it shows the clinic as payee with the amount filled in.
// There is no payment gateway; the doctor confirms receipt himself.
export function upiLink(args: { amount: number; note?: string }): string {
  const params = new URLSearchParams()
  params.set('pa', siteConfig.payments.upiId)
  params.set('pn', siteConfig.payments.payeeName)
  params.set('am', args.amount.toFixed(2))
  params.set('cu', 'INR')
  // UPI apps accept a short note without special characters
  const note = (args.note ?? '').replace(/[^A-Za-z0-9 .\-]/g, '').trim().slice(0, 40)
  if (note) params.set('tn', note)
  // URLSearchParams writes spaces as "+"; UPI apps want %20
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`
}
