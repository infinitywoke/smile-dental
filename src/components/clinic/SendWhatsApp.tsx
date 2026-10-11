'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, MessageCircle } from 'lucide-react'
import type { VisitDetail, VisitPhoto } from '@/lib/data/types'
import type { VisitBill } from '@/lib/data/billing'
import { markWhatsappSent } from '@/lib/actions/visits'
import { visitMessage } from '@/lib/billing'
import type { PhotoKind } from '@/lib/visit-status'
import { whatsappLink } from '@/lib/whatsapp'

// Long enough to record "sent" on a normal connection, short enough to keep Android's
// "opened from a tap" (it lasts about 5 seconds), so WhatsApp itself opens
const MARK_WAIT_MS = 2000

const labelOf = (kind: PhotoKind | null) => (kind === 'Prescription' || kind === 'X-ray' ? kind : 'Photo')

// One message to the patient: bill, payments, balance, next appointment and a 30-day link to each
// ticked photo. The message is ready on the phone, so WhatsApp opens straight from the tap;
// WhatsApp shows the text before it is sent.
export function SendWhatsApp({
  visit,
  bill,
  kindOf,
  beforeAction,
}: {
  visit: VisitDetail
  bill: VisitBill
  kindOf: (photo: VisitPhoto) => PhotoKind | null
  beforeAction: () => Promise<void>
}) {
  // Prescriptions are ticked by default; the doctor can tick any other photo
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [sentNow, setSentNow] = useState(false)
  const ticked = (photo: VisitPhoto) => ticks[photo.id] ?? kindOf(photo) === 'Prescription'
  const sent = sentNow || !!visit.closed_at
  const phone = visit.patient.phone

  const message = visitMessage({
    patientName: visit.patient.name,
    visitDate: visit.visit_date,
    lines: bill.charges,
    payments: bill.payments,
    summary: bill.summary,
    nextAppointment: visit.next_appointment ?? null,
    photos: visit.photos.filter((p) => p.url && ticked(p)).map((p) => ({ label: labelOf(kindOf(p)), url: p.url! })),
  })
  const link = phone ? whatsappLink(phone, message) : null

  async function send(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!link) return
    event.preventDefault()
    setSentNow(true)
    void beforeAction()
    await Promise.race([markWhatsappSent(visit.id).catch(() => {}), new Promise((resolve) => setTimeout(resolve, MARK_WAIT_MS))])
    window.location.assign(link)
  }

  return (
    <section className="space-y-3">
      {visit.photos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Photos to send</h2>
          {visit.photos.map((photo, index) => (
            <label key={photo.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-gray-200">
              <input type="checkbox" checked={ticked(photo)} onChange={(e) => setTicks((t) => ({ ...t, [photo.id]: e.target.checked }))}
                className="h-6 w-6 shrink-0 rounded border-gray-300 text-blue-600" />
              <span className="min-w-0 flex-1 text-base text-gray-900">{labelOf(kindOf(photo))} {index + 1}</span>
            </label>
          ))}
        </div>
      )}

      {sent && (
        <p className="flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-base font-semibold text-green-800 ring-1 ring-green-200">
          <Check className="h-5 w-5" /> WhatsApp sent
        </p>
      )}

      {link ? (
        <a href={link} onClick={send}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700">
          <MessageCircle className="h-6 w-6" /> Send on WhatsApp
        </a>
      ) : (
        <p className="rounded-2xl bg-amber-50 p-4 text-base text-amber-900 ring-1 ring-amber-200">
          No WhatsApp number for this patient.{' '}
          <Link href={`/app/patients/${visit.patient.id}/edit`} className="font-semibold underline">Add it</Link> to send the bill.
        </p>
      )}
    </section>
  )
}
