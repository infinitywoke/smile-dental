'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, Loader2, MessageCircle } from 'lucide-react'
import type { VisitDetail, VisitPhoto } from '@/lib/data/types'
import { markWhatsappSent, type MessageData } from '@/lib/actions/visits'
import { MAX_PHOTOS_TO_SEND, visitMessage } from '@/lib/billing'
import type { PhotoKind } from '@/lib/visit-status'
import { whatsappLink } from '@/lib/whatsapp'
import type { UploadCounts } from './PhotoGallery'

// WhatsApp opens by itself only within this time of the tap: Android keeps a tap's "opened by the
// user" for about 5 seconds, so WhatsApp itself opens. Slower than this, a big button is shown instead.
const TAP_WAIT_MS = 2000
// Still preparing after this long: say so, and let him tap again (server actions run one after
// another and every save is safe to repeat, so a second tap never doubles anything)
const STILL_TRYING_MS = 15_000

const labelOf = (kind: PhotoKind | null) => (kind === 'Prescription' || kind === 'X-ray' ? kind : 'Photo')
const photos = (n: number) => (n === 1 ? '1 photo' : `${n} photos`)

type Sending =
  | { state: 'idle' }
  | { state: 'waiting'; slow: boolean }
  | { state: 'ready'; link: string }
  | { state: 'failed'; message: string }

// One message to the patient: bill, payments, balance, next appointment and a 30-day link to each
// ticked photo. At the tap it first waits for anything still saving (a next visit, charge or payment
// tapped just before), then the server reads the bill and the next appointment fresh and makes the
// photo links, and the message is built from that reply. WhatsApp shows the text before it is sent.
export function SendWhatsApp({
  visit,
  kindOf,
  uploads,
  whenSaved,
}: {
  visit: VisitDetail
  kindOf: (photo: VisitPhoto) => PhotoKind | null
  // Photos not on the visit yet: Send waits for them (or for him to remove them)
  uploads: UploadCounts
  // Resolves once every save tapped before Send has reached the server
  whenSaved: () => Promise<void>
}) {
  // Prescriptions are ticked by default; the doctor can tick any other photo
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [sentNow, setSentNow] = useState(false)
  const [sending, setSending] = useState<Sending>({ state: 'idle' })
  // Each tap is one try; only the latest try's reply is used
  const tries = useRef(0)
  // Waiting, and not yet long enough to offer another tap
  const busy = sending.state === 'waiting' && !sending.slow
  const ticked = (photo: VisitPhoto) => ticks[photo.id] ?? kindOf(photo) === 'Prescription'
  const tickedPhotos = visit.photos.filter(ticked)
  const sent = sentNow || !!visit.closed_at
  const phone = visit.patient.phone

  // Back from WhatsApp: the next Send builds a fresh message (he may change something first)
  const ready = sending.state === 'ready'
  useEffect(() => {
    if (!ready) return
    const onShow = () => {
      if (document.visibilityState === 'visible') setSending({ state: 'idle' })
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [ready])

  // Why Send can't go yet, said above the button
  const hold =
    uploads.uploading > 0
      ? `${photos(uploads.uploading)} still uploading…`
      : uploads.failed > 0
        ? `${photos(uploads.failed)} failed to upload and ${uploads.failed === 1 ? 'is' : 'are'} being tried again. Remove ${uploads.failed === 1 ? 'it' : 'them'} to send without.`
        : tickedPhotos.length > MAX_PHOTOS_TO_SEND
          ? `You can send up to ${MAX_PHOTOS_TO_SEND} photos at a time.`
          : null

  const linkWith = (data: Omit<MessageData, 'links'>, photoLinks: Record<string, string>) =>
    whatsappLink(
      phone!,
      visitMessage({
        patientName: visit.patient.name,
        visitDate: visit.visit_date,
        lines: data.charges,
        payments: data.payments,
        summary: data.summary,
        nextAppointment: data.nextAppointment,
        photos: tickedPhotos.flatMap((p) => (photoLinks[p.id] ? [{ label: labelOf(kindOf(p)), url: photoLinks[p.id] }] : [])),
      }),
    )

  async function send(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (!phone || hold || busy) return
    const thisTry = ++tries.current
    // Set once the tap's window has passed: WhatsApp must then be opened by a second tap
    let tooSlow = false
    const timer = setTimeout(() => { tooSlow = true }, TAP_WAIT_MS)
    const stillTrying = setTimeout(() => {
      if (tries.current === thisTry) setSending({ state: 'waiting', slow: true })
    }, STILL_TRYING_MS)
    setSending({ state: 'waiting', slow: false })
    try {
      await whenSaved()
      const result = await markWhatsappSent(visit.id, tickedPhotos.map((p) => p.id))
      clearTimeout(timer)
      clearTimeout(stillTrying)
      // He tapped again meanwhile: that try's reply is the one used
      if (tries.current !== thisTry) return
      if (result.error || !result.message) {
        setSending({ state: 'failed', message: result.error ?? 'Could not prepare the message. Please try again.' })
        return
      }
      setSentNow(true)
      const link = linkWith(result.message, result.message.links)
      // Quick enough: open WhatsApp now, still counted as the doctor's tap. Otherwise wait for his tap.
      if (!tooSlow) {
        setSending({ state: 'idle' })
        window.location.assign(link)
      } else {
        setSending({ state: 'ready', link })
      }
    } catch {
      clearTimeout(timer)
      clearTimeout(stillTrying)
      if (tries.current !== thisTry) return
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

      {sending.state === 'waiting' && sending.slow && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> Still trying… Check the internet.
        </p>
      )}

      {phone && hold && sending.state !== 'ready' && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {uploads.uploading > 0 ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          {hold}
        </p>
      )}

      {!phone ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-base text-amber-900 ring-1 ring-amber-200">
          No WhatsApp number for this patient.{' '}
          <Link href={`/app/patients/${visit.patient.id}/edit`} className="font-semibold underline">Add it</Link> to send the bill.
        </p>
      ) : sending.state === 'ready' ? (
        // The server took a while: a real link, opened by the doctor's own tap. It stays (no state change on
        // the tap, which would swap the link before the browser follows it), so coming back he can tap again.
        <a key="open" href={sending.link}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700">
          <MessageCircle className="h-6 w-6" /> Open WhatsApp
        </a>
      ) : (
        // The message is only ever built from the server's reply, so this link has no address of its own
        <a key="send" href="#" onClick={send} aria-disabled={busy || !!hold}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 aria-disabled:opacity-60">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <MessageCircle className="h-6 w-6" />}
          {busy ? 'Preparing…' : sending.state === 'waiting' ? 'Try again' : 'Send on WhatsApp'}
        </a>
      )}
    </section>
  )
}
