'use client'

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, Loader2, MessageCircle } from 'lucide-react'
import type { VisitDetail, VisitPhoto } from '@/lib/data/types'
import { prepareWhatsapp, type MessageData } from '@/lib/actions/visits'
import { MAX_PHOTOS_TO_SEND, visitMessage } from '@/lib/billing'
import type { ShownBill } from '@/lib/offline/apply'
import { isNetworkError, readOutbox } from '@/lib/offline/outbox'
import { messageLanguage, whatsappLink } from '@/lib/whatsapp'
import type { UploadCounts } from './PhotoGallery'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { useSaves } from './Outbox'
import { ReviewRequest } from './ReviewRequest'

// WhatsApp opens by itself only within this time of the tap: Android keeps a tap's "opened by the
// user" for about 5 seconds, so WhatsApp itself opens. Slower than this, a big button is shown instead.
const TAP_WAIT_MS = 2000
// Still preparing after this long: say so, and let him tap again (server actions run one after
// another and every save is safe to repeat, so a second tap never doubles anything)
const STILL_TRYING_MS = 15_000
// Recording the send waits at most this long before WhatsApp opens, so the tap still counts
const RECORD_WAIT_MS = 3000
// Opening by itself straight after preparing (which may take up to TAP_WAIT_MS): wait less, so WhatsApp
// still opens within the few seconds Android allows after the tap. The record carries on in the background.
const RECORD_WAIT_AFTER_PREPARE_MS = 1500

const photos = (n: number) => (n === 1 ? '1 photo' : `${n} photos`)

type Sending =
  | { state: 'idle' }
  | { state: 'waiting'; slow: boolean }
  | { state: 'ready'; link: string }
  | { state: 'failed'; message: string }

// What the visit page can ask of Send from anywhere: the same Send as the button here (the next-step bar),
// and to forget a message made ready before the photos to send changed
export type SendHandle = { send: () => void; reset: () => void }

// One message to the patient: bill, payments, balance, next appointment and the ticked photos, in one
// tap. At the tap it first waits for anything still saving (a next visit, charge or payment tapped just
// before), then the server reads the bill and the next appointment fresh and makes one short link to
// the ticked photos (a page that shows them for 30 days: src/app/r/[token]/page.tsx), and the message is
// built from that reply. WhatsApp shows the text before it is sent.
// With no signal (or saves still waiting on the phone, which the server doesn't have yet) the message
// is made on the phone from the bill and next visit on show; WhatsApp sends it once it has signal, and
// "WhatsApp sent" is recorded when the app has signal again. The photo link needs the server, so then
// the photos wait (or he unticks them).
export function SendWhatsApp({
  visit,
  bill,
  nextAppointment,
  sentWaiting,
  nameOf,
  uploads,
  whenSaved,
  handle,
  onSent,
  sends,
}: {
  visit: VisitDetail
  // The bill on show, with any charges and payments still waiting on the phone
  bill: ShownBill
  // The next visit on show (an ISO moment), perhaps still waiting on the phone
  nextAppointment: string | null
  // "WhatsApp sent" was recorded on this phone and is waiting to be saved
  sentWaiting: boolean
  // What a photo is called in the message ("Prescription", the name he typed, "Photo")
  nameOf: (photo: VisitPhoto) => string
  // Photos not on the visit yet: Send waits for them (or for him to remove them)
  uploads: UploadCounts
  // Resolves once every save tapped before Send has reached the server
  whenSaved: () => Promise<void>
  handle?: Ref<SendHandle>
  // WhatsApp is opening with the message (the page learns it was sent a moment later)
  onSent?: () => void
  // The photos ticked to go with the message (ticked on each photo, in Photos)
  sends: (photo: VisitPhoto) => boolean
}) {
  const [sentNow, setSentNow] = useState(false)
  const [sending, setSending] = useState<Sending>({ state: 'idle' })
  // Each tap is one try; only the latest try's reply is used
  const tries = useRef(0)
  // Waiting, and not yet long enough to offer another tap
  const busy = sending.state === 'waiting' && !sending.slow
  const tickedPhotos = visit.photos.filter(sends)
  const sent = sentNow || !!visit.closed_at || sentWaiting
  const saves = useSaves()
  // Sent, but a charge or payment changed since (the database sets this): the patient's message is out of date
  const resend = sent && !!visit.resend_needed
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

  const linkWith = (data: Omit<MessageData, 'photoLink'>, photoLink: string | null) =>
    whatsappLink(
      phone!,
      visitMessage({
        patientName: visit.patient.name,
        visitDate: visit.visit_date,
        lines: data.charges,
        payments: data.payments,
        summary: data.summary,
        nextAppointment: data.nextAppointment,
        photoLink: photoLink ? { url: photoLink, labels: tickedPhotos.map((p) => nameOf(p)) } : null,
        language: messageLanguage(visit.patient.language),
      }),
    )

  // The message made here, from the bill and next visit on show. The link to the photos needs the
  // server, so with photos ticked it can't be made this way (null).
  const linkHere = () =>
    tickedPhotos.length > 0
      ? null
      : linkWith({ charges: bill.charges, payments: bill.payments, summary: bill.summary, nextAppointment: nextAppointment ? { starts_at: nextAppointment } : null }, null)

  // WhatsApp is opening: record the send ("WhatsApp sent", "bill changed" cleared), then open it.
  // A slow reply doesn't hold WhatsApp back (the tap only counts for a few seconds); it is recorded
  // when the reply comes, and with no signal once it is back. A refusal from the server is shown
  // instead of opening.
  async function recordAndOpen(link: string, onOpen?: () => void, waitMs = RECORD_WAIT_MS) {
    const recorded = saves.markWhatsappSent(visit.id).then(
      (r) => r.error ?? null,
      () => "Couldn't reach the server. Check the internet and try again.",
    )
    const outcome = await Promise.race([recorded, new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), waitMs))])
    if (outcome !== null && outcome !== 'slow') {
      setSending({ state: 'failed', message: outcome })
      return
    }
    setSentNow(true)
    onSent?.()
    onOpen?.()
    openWhatsApp(link)
  }

  async function send(event?: React.MouseEvent<HTMLAnchorElement>) {
    event?.preventDefault()
    if (!phone || hold || busy) return
    const thisTry = ++tries.current
    // Set once the tap's window has passed: WhatsApp must then be opened by a second tap
    let tooSlow = false
    const timer = setTimeout(() => { tooSlow = true }, TAP_WAIT_MS)
    const stillTrying = setTimeout(() => {
      if (tries.current === thisTry) setSending({ state: 'waiting', slow: true })
    }, STILL_TRYING_MS)
    setSending({ state: 'waiting', slow: false })
    const fail = (message: string) => {
      clearTimeout(timer)
      clearTimeout(stillTrying)
      if (tries.current === thisTry) setSending({ state: 'failed', message })
    }
    let link: string | null
    try {
      await whenSaved()
      if (navigator.onLine === false || readOutbox().some((i) => !i.error && i.visitId === visit.id)) link = linkHere()
      else {
        const result = await prepareWhatsapp(visit.id, tickedPhotos.map((p) => p.id))
        if (result.error || !result.message) return fail(result.error ?? 'Could not prepare the message. Please try again.')
        link = linkWith(result.message, result.message.photoLink)
      }
    } catch (e) {
      if (!isNetworkError(e)) return fail("Couldn't reach the server. Check the internet and try again.")
      // The server couldn't be reached: the message is made here instead
      link = linkHere()
    }
    clearTimeout(timer)
    clearTimeout(stillTrying)
    // He tapped again meanwhile: that try's reply is the one used
    if (tries.current !== thisTry) return
    if (!link) {
      setSending({ state: 'failed', message: "No signal, so the link to the photos can't be made. Untick the photos to send the message without them, or wait for the signal." })
      return
    }
    // Quick enough: open WhatsApp now, still counted as the doctor's tap. Otherwise "Message ready"
    // waits for his tap, and only that tap records the send.
    if (!tooSlow) {
      // "Preparing…" stays until WhatsApp opens
      await recordAndOpen(link, () => setSending({ state: 'idle' }), RECORD_WAIT_AFTER_PREPARE_MS)
    } else {
      setSending({ state: 'ready', link })
    }
  }

  // A message made ready (a slow reply) is built again when the photos to send change; not while one is being made
  useImperativeHandle(handle, () => ({ send: () => void send(), reset: () => setSending((s) => (s.state === 'waiting' ? s : { state: 'idle' })) }))

  return (
    <section className="space-y-3">
      {resend ? (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900 ring-1 ring-amber-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> The bill changed after the WhatsApp was sent.
        </p>
      ) : sent ? (
        <p className="flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-base font-semibold text-green-800 ring-1 ring-green-200">
          <Check className="h-5 w-5" /> WhatsApp sent
        </p>
      ) : null}

      {sent && phone && (
        <ReviewRequest patientId={visit.patient.id} name={visit.patient.name} phone={phone} askedAt={visit.patient.review_asked_at ?? null} language={messageLanguage(visit.patient.language)} />
      )}

      {sending.state === 'ready' && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-base font-semibold text-green-800 ring-1 ring-green-200">
          <MessageCircle className="h-5 w-5" /> Message ready
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
        // The server took a while: "Message ready", and WhatsApp opens on the doctor's own tap, which is
        // also when the send is recorded. It stays, so coming back he can tap again.
        <a key="open" id="send-action" href={sending.link}
          onClick={(event) => {
            event.preventDefault()
            void recordAndOpen(sending.link)
          }}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-lg font-extrabold text-white shadow-sm hover:bg-blue-700">
          <MessageCircle className="h-6 w-6" /> Open WhatsApp
        </a>
      ) : (
        // The message is only ever built from the server's reply, so this link has no address of its own
        <a key="send" id="send-action" href="#" onClick={send} aria-disabled={busy || !!hold}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-lg font-extrabold text-white shadow-sm hover:bg-blue-700 aria-disabled:opacity-60">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <MessageCircle className="h-6 w-6" />}
          {busy ? 'Preparing…' : sending.state === 'waiting' ? 'Try again' : 'Send on WhatsApp'}
        </a>
      )}
    </section>
  )
}
