'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ImageIcon, Loader2, MessageCircle } from 'lucide-react'
import { siteConfig } from '@/config/site'
import type { VisitDetail, VisitPhoto } from '@/lib/data/types'
import { markWhatsappSent, prepareWhatsapp, type MessageData } from '@/lib/actions/visits'
import { MAX_PHOTOS_TO_SEND, visitMessage } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import type { PhotoKind } from '@/lib/visit-status'
import { firstName, whatsappLink } from '@/lib/whatsapp'
import type { UploadCounts } from './PhotoGallery'
import { openWhatsApp } from '@/lib/whatsapp-business'

// WhatsApp opens by itself only within this time of the tap: Android keeps a tap's "opened by the
// user" for about 5 seconds, so WhatsApp itself opens. Slower than this, a big button is shown instead.
const TAP_WAIT_MS = 2000
// Still preparing after this long: say so, and let him tap again (server actions run one after
// another and every save is safe to repeat, so a second tap never doubles anything)
const STILL_TRYING_MS = 15_000
// Recording the send waits at most this long before WhatsApp opens, so the tap still counts
const RECORD_WAIT_MS = 3000

const labelOf = (kind: PhotoKind | null) => (kind === 'Prescription' || kind === 'X-ray' ? kind : 'Photo')
const photos = (n: number) => (n === 1 ? '1 photo' : `${n} photos`)

// A wa.me link can only carry text. Phones that can share files (Android Chrome) send the photos
// themselves through the share sheet instead of 30-day links; others (most desktops) get the links.
let shareFilesSupport: boolean | null = null
function canShareFilesNow(): boolean {
  if (shareFilesSupport === null) {
    try {
      shareFilesSupport =
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [new File([new Uint8Array(1)], 'photo.jpg', { type: 'image/jpeg' })] })
    } catch {
      shareFilesSupport = false
    }
  }
  return shareFilesSupport
}
const noSubscribe = () => () => {}
const useCanShareFiles = () => useSyncExternalStore(noSubscribe, canShareFilesNow, () => false)

// A ticked photo, fetched ahead of the tap: Android opens the share sheet only within a few seconds
// of the tap, so the files must be ready before it
type Prepared = { blob: Blob } | { failedUrl: string | null }
const extensionOf = (type: string) => (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg')

type Sending =
  | { state: 'idle' }
  | { state: 'waiting'; slow: boolean }
  | { state: 'ready'; link: string }
  | { state: 'failed'; message: string }

// One message to the patient: bill, payments, balance and next appointment. At the tap it first waits
// for anything still saving (a next visit, charge or payment tapped just before), then the server
// reads the bill and the next appointment fresh, and the message is built from that reply. WhatsApp
// shows the text before it is sent. The ticked photos go one of two ways:
// - phones that can share files: after the message, "Send prescription photo" opens the share sheet
//   with the photos attached (the patient's chat is now at the top of WhatsApp); no links are made;
// - other browsers: a 30-day link to each photo, made by the server at the tap, goes in the text.
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
  // Sent, but a charge or payment changed since (the database sets this): the patient's message is out of date
  const resend = sent && !!visit.resend_needed
  const upToDate = sent && !resend
  const phone = visit.patient.phone
  const canShareFiles = useCanShareFiles()
  const router = useRouter()

  // The ticked photos as files, fetched from their 1-hour display links when the page loads and
  // when ticks change. A failed fetch is tried again when the page brings a fresh link.
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({})
  const fetching = useRef(new Set<string>())
  useEffect(() => {
    if (!canShareFiles) return
    for (const photo of tickedPhotos) {
      const have = prepared[photo.id]
      if (fetching.current.has(photo.id) || (have && ('blob' in have || have.failedUrl === photo.url))) continue
      const url = photo.url
      fetching.current.add(photo.id)
      ;(async () => {
        if (!url) throw new Error('no link')
        const response = await fetch(url)
        if (!response.ok) throw new Error(String(response.status))
        return response.blob()
      })()
        .then((blob) => setPrepared((p) => ({ ...p, [photo.id]: { blob } })))
        .catch(() => setPrepared((p) => ({ ...p, [photo.id]: { failedUrl: url } })))
        .finally(() => fetching.current.delete(photo.id))
    }
  }, [canShareFiles, tickedPhotos, prepared])

  const blobs = tickedPhotos.map((p) => {
    const have = prepared[p.id]
    return have && 'blob' in have ? have.blob : null
  })
  const photosReady = blobs.every(Boolean)
  const photoFailed = tickedPhotos.some((p) => {
    const have = prepared[p.id]
    return !!have && 'failedUrl' in have
  })
  const [shareError, setShareError] = useState<string | null>(null)
  // After the message: the photo button, unless WhatsApp still has to be opened (or is being prepared)
  const showPhotoButton =
    canShareFiles && upToDate && tickedPhotos.length > 0 && tickedPhotos.length <= MAX_PHOTOS_TO_SEND && sending.state !== 'ready' && sending.state !== 'waiting'

  // Straight from the tap, with nothing awaited first, so Android allows the share sheet
  function sharePhotos() {
    if (!photosReady) {
      if (photoFailed) {
        // Fresh display links from the server; the fetch above tries again with them
        setShareError(null)
        router.refresh()
      }
      return
    }
    const labels = tickedPhotos.map((p) => labelOf(kindOf(p)))
    const date = formatDate(visit.visit_date)
    // "Prescription-12-Oct-2026.jpg"; repeats are numbered ("X-ray-2-12-Oct-2026.jpg")
    const seen = new Map<string, number>()
    const files = blobs.map((blob, i) => {
      const n = (seen.get(labels[i]) ?? 0) + 1
      seen.set(labels[i], n)
      const type = blob!.type.startsWith('image/') ? blob!.type : 'image/jpeg'
      const name = `${labels[i]}${n > 1 ? ` ${n}` : ''} ${date}`.replace(/\s+/g, '-')
      return new File([blob!], `${name}.${extensionOf(type)}`, { type })
    })
    // The caption: "Prescription · Smile Dental Clinic · 12 Oct 2026"
    const data: ShareData = { files, text: `${[...new Set(labels)].join(' & ')} · ${siteConfig.name} · ${date}` }
    setShareError(null)
    try {
      if (!navigator.canShare(data)) throw new Error('cannot share')
      navigator.share(data).catch((e: unknown) => {
        // He closed the share sheet: nothing to say
        if (e instanceof DOMException && e.name === 'AbortError') return
        setShareError("Couldn't open sharing. Please tap again.")
      })
    } catch {
      setShareError("This phone couldn't attach the photo. Please tap again.")
    }
  }

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

  // WhatsApp is opening: record the send ("WhatsApp sent", "bill changed" cleared), then open it.
  // A slow reply doesn't hold WhatsApp back (the tap only counts for a few seconds); it is recorded
  // when the reply comes. A refusal from the server is shown instead of opening.
  async function recordAndOpen(link: string, onOpen?: () => void) {
    const recorded = markWhatsappSent(visit.id).then(
      (r) => r.error ?? null,
      () => "Couldn't reach the server. Check the internet and try again.",
    )
    const outcome = await Promise.race([recorded, new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), RECORD_WAIT_MS))])
    if (outcome !== null && outcome !== 'slow') {
      setSending({ state: 'failed', message: outcome })
      return
    }
    setSentNow(true)
    onOpen?.()
    openWhatsApp(link)
  }

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
      // Photos shared as files need no links, so none are made
      const result = await prepareWhatsapp(visit.id, canShareFiles ? [] : tickedPhotos.map((p) => p.id))
      clearTimeout(timer)
      clearTimeout(stillTrying)
      // He tapped again meanwhile: that try's reply is the one used
      if (tries.current !== thisTry) return
      if (result.error || !result.message) {
        setSending({ state: 'failed', message: result.error ?? 'Could not prepare the message. Please try again.' })
        return
      }
      const link = linkWith(result.message, result.message.links)
      // Quick enough: open WhatsApp now, still counted as the doctor's tap. Otherwise "Message ready"
      // waits for his tap, and only that tap records the send.
      if (!tooSlow) {
        // "Preparing…" stays until WhatsApp opens
        await recordAndOpen(link, () => setSending({ state: 'idle' }))
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

      {resend ? (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900 ring-1 ring-amber-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> The bill changed after the WhatsApp was sent.
        </p>
      ) : sent ? (
        <p className="flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-base font-semibold text-green-800 ring-1 ring-green-200">
          <Check className="h-5 w-5" /> WhatsApp sent
        </p>
      ) : null}

      {sending.state === 'ready' && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-base font-semibold text-green-800 ring-1 ring-green-200">
          <MessageCircle className="h-5 w-5" /> Message ready
        </p>
      )}

      {showPhotoButton && (
        <div className="space-y-2">
          <button type="button" onClick={sharePhotos} disabled={!photosReady && !photoFailed}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60">
            {photosReady ? <ImageIcon className="h-6 w-6" /> : photoFailed ? <AlertCircle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
            {photosReady
              ? tickedPhotos.length > 1
                ? `Send ${tickedPhotos.length} photos`
                : `Send ${{ Prescription: 'prescription ', 'X-ray': 'X-ray ', Photo: '' }[labelOf(kindOf(tickedPhotos[0]))]}photo`
              : photoFailed
                ? "Photo didn't load. Tap to try again"
                : tickedPhotos.length > 1 ? 'Preparing photos…' : 'Preparing photo…'}
          </button>
          <p className="text-center text-sm text-gray-600">Then pick {firstName(visit.patient.name)}&apos;s chat, at the top of WhatsApp.</p>
          {shareError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {shareError}
            </p>
          )}
        </div>
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
        <a key="open" href={sending.link}
          onClick={(event) => {
            event.preventDefault()
            void recordAndOpen(sending.link)
          }}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-green-700">
          <MessageCircle className="h-6 w-6" /> Open WhatsApp
        </a>
      ) : (
        // The message is only ever built from the server's reply, so this link has no address of its own.
        // Once the photo button shows, sending the message again is the second choice.
        <a key="send" href="#" onClick={send} aria-disabled={busy || !!hold}
          className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold shadow-sm aria-disabled:opacity-60 ${
            showPhotoButton ? 'bg-white text-green-700 ring-1 ring-green-600 hover:bg-green-50' : 'bg-green-600 text-white hover:bg-green-700'
          }`}>
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <MessageCircle className="h-6 w-6" />}
          {busy ? 'Preparing…' : sending.state === 'waiting' ? 'Try again' : 'Send on WhatsApp'}
        </a>
      )}
    </section>
  )
}
