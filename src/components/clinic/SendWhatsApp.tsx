'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, Loader2, MessageCircle } from 'lucide-react'
import type { VisitDetail, VisitPhoto } from '@/lib/data/types'
import type { VisitBill } from '@/lib/data/billing'
import { markWhatsappSent } from '@/lib/actions/visits'
import { visitMessage } from '@/lib/billing'
import type { PhotoKind } from '@/lib/visit-status'
import { whatsappLink } from '@/lib/whatsapp'

// WhatsApp opens by itself only within this time of the tap: Android keeps a tap's "opened by the
// user" for about 5 seconds, so WhatsApp itself opens. Slower than this, a big button is shown instead.
const TAP_WAIT_MS = 2000

const labelOf = (kind: PhotoKind | null) => (kind === 'Prescription' || kind === 'X-ray' ? kind : 'Photo')

type Sending = { state: 'idle' } | { state: 'waiting' } | { state: 'ready'; link: string } | { state: 'failed'; message: string }

// One message to the patient: bill, payments, balance, next appointment and a 30-day link to each
// ticked photo. The photo links are made on the server at the tap (only then, only for ticked photos);
// without photos the message is ready on the phone. WhatsApp shows the text before it is sent.
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
  const [sending, setSending] = useState<Sending>({ state: 'idle' })
  const ticked = (photo: VisitPhoto) => ticks[photo.id] ?? kindOf(photo) === 'Prescription'
  const tickedPhotos = visit.photos.filter(ticked)
  const sent = sentNow || !!visit.closed_at
  const phone = visit.patient.phone

  const linkWith = (photoLinks: Record<string, string>) =>
    whatsappLink(
      phone!,
      visitMessage({
        patientName: visit.patient.name,
        visitDate: visit.visit_date,
        lines: bill.charges,
        payments: bill.payments,
        summary: bill.summary,
        nextAppointment: visit.next_appointment ?? null,
        photos: tickedPhotos.flatMap((p) => (photoLinks[p.id] ? [{ label: labelOf(kindOf(p)), url: photoLinks[p.id] }] : [])),
      }),
    )

  async function send(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (!phone || sending.state === 'waiting') return
    void beforeAction()
    // Set once the tap's window has passed: WhatsApp must then be opened by a second tap
    let tooSlow = false
    const timer = setTimeout(() => { tooSlow = true }, TAP_WAIT_MS)
    const ids = tickedPhotos.map((p) => p.id)

    // No photos: the message is ready, so WhatsApp opens from the tap; "sent" is recorded meanwhile
    if (ids.length === 0) {
      clearTimeout(timer)
      setSentNow(true)
      await Promise.race([markWhatsappSent(visit.id, []).catch(() => {}), new Promise((resolve) => setTimeout(resolve, TAP_WAIT_MS))])
      window.location.assign(linkWith({}))
      return
    }

    setSending({ state: 'waiting' })
    try {
      const result = await markWhatsappSent(visit.id, ids)
      clearTimeout(timer)
      if (result.error || !result.links) {
        setSending({ state: 'failed', message: result.error ?? 'Could not prepare the photo links. Please try again.' })
        return
      }
      setSentNow(true)
      const link = linkWith(result.links)
      // Quick enough: open WhatsApp now, still counted as the doctor's tap. Otherwise wait for his tap.
      if (!tooSlow) {
        setSending({ state: 'idle' })
        window.location.assign(link)
      } else {
        setSending({ state: 'ready', link })
      }
    } catch {
      clearTimeout(timer)
      setSending({ state: 'failed', message: "Couldn't reach the server. Check the internet and try again." })
    }
  }

  return (
    <section className="space-y-3">
      {visit.photos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Photos to send</h2>
          {visit.photos.map((photo, index) => (
            <label key={photo.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-gray-200">
              <input type="checkbox" checked={ticked(photo)} disabled={sending.state === 'waiting'}
                onChange={(e) => {
                  setTicks((t) => ({ ...t, [photo.id]: e.target.checked }))
                  setSending({ state: 'idle' })
                }}
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

      {sending.state === 'failed' && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {sending.message}
        </p>
      )}

      {!phone ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-base text-amber-900 ring-1 ring-amber-200">
          No WhatsApp number for this patient.{' '}
          <Link href={`/app/patients/${visit.patient.id}/edit`} className="font-semibold underline">Add it</Link> to send the bill.
        </p>
      ) : sending.state === 'ready' ? (
        // The links took a while: a real link, opened by the doctor's own tap
        <a href={sending.link} onClick={() => setSending({ state: 'idle' })}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700">
          <MessageCircle className="h-6 w-6" /> Open WhatsApp
        </a>
      ) : (
        <a href={linkWith({})} onClick={send} aria-disabled={sending.state === 'waiting'}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 aria-disabled:opacity-70">
          {sending.state === 'waiting' ? <Loader2 className="h-6 w-6 animate-spin" /> : <MessageCircle className="h-6 w-6" />}
          {sending.state === 'waiting' ? 'Preparing…' : 'Send on WhatsApp'}
        </a>
      )}
    </section>
  )
}
