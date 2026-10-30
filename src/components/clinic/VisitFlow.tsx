'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, Cake, ChevronRight } from 'lucide-react'
import type { ClinicContext } from '@/lib/clinic'
import type { VisitPhoto } from '@/lib/data/types'
import type { VisitBill } from '@/lib/data/billing'
import type { VisitPageData } from '@/lib/data/visits'
import { deleteVisit } from '@/lib/actions/visits'
import { recordConsent } from '@/lib/actions/patients'
import { applyOutbox, sentWaiting as sentWaitingIn, shownNextVisit } from '@/lib/offline/apply'
import { paymentsHeldMessage } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import { DEFAULT_LENGTH, formatTimeOf, formatWhen } from '@/lib/schedule'
import { otherName, photoCaption, photoKind, photoLabel, type PhotoKind } from '@/lib/visit-status'
import { isBirthday, patientAge } from '@/lib/patient-fields'
import type { UsualCharge } from '@/lib/usual-charges'
import type { PriceListOption } from '@/lib/pricing'
import { ChairReadout } from './VisitHud'
import { BillSection, type Save } from './BillTools'
import { NextVisit } from './NextVisit'
import { PaymentCard, type PaymentHandle, type SavingPayment } from './PaymentCard'
import { PhotoGallery, type UploadCounts } from './PhotoGallery'
import { SendWhatsApp, type SendHandle } from './SendWhatsApp'
import { NextStepBar, type NextStep } from './NextStepBar'
import { VisitNotes, type NotesHandle } from './VisitNotes'
import { MedicalAlert } from './ui'
import { UndoProvider } from './UndoBar'
import { NoteCharges, NoteUnclear } from './NoteSuggestions'
import { PrescriptionCard } from './PrescriptionCard'
import { prescriptionLines } from '@/lib/prescription'
import { SavesProvider, useOutbox, useQueuedSaves } from './Outbox'
import type { NoteSuggestions as Suggestions } from '@/lib/actions/smart-notes'

// A visit is one page that saves by itself: notes, photos, bill, payment, next visit, WhatsApp.
export function VisitFlow({
  clinic,
  folder,
  visit,
  bill: serverBill,
  medicines,
  usual,
  priceList,
  focus,
}: {
  // The clinic and its dentist: the letterhead, messages, UPI QR and chair monitor on this page are theirs
  clinic: ClinicContext
  // The clinic's folder, where the visit's photos go
  folder: string
  visit: VisitPageData
  bill: VisitBill
  // One-tap medicines for the prescription
  medicines: string[]
  // The price-list items he bills most, one tap each on the bill
  usual: UsualCharge[]
  // The clinic's price list (src/lib/data/price-list.ts), for Add charge
  priceList: PriceListOption[]
  // "payment": opened from a Collect link, so scroll to the payment card
  focus: 'payment' | null
}) {
  const notesRef = useRef<NotesHandle>(null)
  // What Gemini heard in a recording, each part where it belongs until used or dismissed: the charges in
  // the Bill, the next visit in Next visit, the words it couldn't make out under the notes
  const [noteCharges, setNoteCharges] = useState<(Pick<Suggestions, 'charges' | 'notOnList'> & { round: number }) | null>(null)
  const [noteNext, setNoteNext] = useState<{ instant: string; minutes: number; why: string } | null>(null)
  const [noteUnclear, setNoteUnclear] = useState<string[]>([])
  const takeSuggestions = useCallback((s: Suggestions) => {
    setNoteCharges((before) => (s.charges.length > 0 || s.notOnList.length > 0
      ? { charges: s.charges, notOnList: s.notOnList, round: (before?.round ?? 0) + 1 }
      : null))
    setNoteNext(s.nextVisit?.instant ? { instant: s.nextVisit.instant, minutes: s.nextVisit.minutes, why: s.nextVisit.why } : null)
    setNoteUnclear(s.unclear)
  }, [])
  // The notes as typed (the prescription card reads its medicines from them)
  const [notesText, setNotesText] = useState(visit.notes ?? '')
  const editNotes = useCallback((change: (text: string) => string) => notesRef.current?.edit(change), [])
  // Saves still on their way (a charge, a payment, the next visit, a photo's kind). Send on WhatsApp
  // waits for them, so the message always includes what was tapped just before.
  const pendingSaves = useRef(new Set<Promise<unknown>>())
  const save: Save = useCallback(<T,>(action: () => Promise<T>) => {
    const run = (async () => {
      await notesRef.current?.flush()
      return action()
    })()
    const saves = pendingSaves.current
    saves.add(run)
    run.then(() => saves.delete(run), () => saves.delete(run))
    return run
  }, [])
  const whenSaved = useCallback(async () => {
    await notesRef.current?.flush()
    while (pendingSaves.current.size > 0) await Promise.allSettled([...pendingSaves.current])
  }, [])

  // With no signal, charges, payments and photo kinds wait on the phone and save when it is back
  // (src/lib/offline); the page shows the bill with them, marked as waiting
  const saves = useQueuedSaves(visit.id, save)
  const outbox = useOutbox()
  const bill = useMemo(() => applyOutbox(serverBill, outbox), [serverBill, outbox])
  // The next visit and "WhatsApp sent" too: booked or sent with no signal, they show at once
  const next = shownNextVisit(visit.id, visit.next_appointment ?? null, outbox)
  const sentWaiting = sentWaitingIn(visit.id, outbox)

  // Photos still uploading or failed: Send waits for them
  const [uploads, setUploads] = useState<UploadCounts>({ uploading: 0, failed: 0 })

  // A photo's kind (and the name he typed for an "Other" one) shows at once; the server catches up
  const [captions, setCaptions] = useState<Record<string, string>>({})
  const [kindError, setKindError] = useState<string | null>(null)
  const kindOf = useCallback((photo: VisitPhoto) => photoKind(captions[photo.id] ?? photo.caption), [captions])
  const nameOf = useCallback((photo: VisitPhoto) => photoLabel(kindOf(photo), otherName(captions[photo.id] ?? photo.caption)), [captions, kindOf])
  // Which photos go with the WhatsApp message: prescriptions unless he unticks them, any other he ticks
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const sends = useCallback((photo: VisitPhoto) => ticks[photo.id] ?? kindOf(photo) === 'Prescription', [ticks, kindOf])
  const markKind = async (photo: VisitPhoto, kind: PhotoKind, name?: string) => {
    const before = captions[photo.id]
    setKindError(null)
    setCaptions((c) => ({ ...c, [photo.id]: photoCaption(kind, name) }))
    try {
      const result = await saves.setPhotoKind(photo.id, kind, name)
      if (result.error) throw new Error(result.error)
    } catch {
      setCaptions((k) => {
        const copy = { ...k }
        if (before) copy[photo.id] = before
        else delete copy[photo.id]
        return copy
      })
      setKindError("Couldn't save that. Check the internet and tap again.")
    }
  }

  useEffect(() => {
    if (focus !== 'payment') return
    const timer = setTimeout(() => document.getElementById('payment')?.scrollIntoView({ block: 'start' }), 100)
    return () => clearTimeout(timer)
  }, [focus])

  // The payment card shows with a bill on this visit, or whenever the patient owes something
  const showPayment = bill.charges.length > 0 || bill.payments.length > 0 || bill.summary.due > 0
  // A payment tapped a moment ago, before the page has the server's copy: Delete visit counts it too
  const [savingPayment, setSavingPayment] = useState<SavingPayment | null>(null)
  const pendingPayment = savingPayment && !bill.payments.some((p) => p.id === savingPayment.id) ? savingPayment : null
  const heldPayments = pendingPayment ? [...bill.payments, pendingPayment] : bill.payments

  const age = patientAge(visit.patient)

  // The next step, kept in reach above the bottom bar: collect what is due, then send (when there is
  // something to send and a number to send it to). Once something is paid on this visit (perhaps a
  // part, the rest another day), the next step is sending; the card still shows what is due.
  const paymentRef = useRef<PaymentHandle>(null)
  const sendRef = useRef<SendHandle>(null)
  const [sentHere, setSentHere] = useState(false)
  const dueNow = Math.round((bill.summary.due - (pendingPayment?.amount ?? 0)) * 100) / 100
  const paidHere = bill.payments.length > 0 || pendingPayment !== null
  const hasContent = bill.charges.length > 0 || notesText.trim() !== ''
  const nextStep: NextStep | null =
    showPayment && dueNow > 0 && !paidHere ? { kind: 'collect', due: dueNow }
      : visit.patient.phone && hasContent && ((!visit.closed_at && !sentHere && !sentWaiting) || visit.resend_needed) ? { kind: 'send' }
        : null
  const showSection = (id: string, block: ScrollLogicalPosition) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block })

  return (
    <UndoProvider>
    <SavesProvider value={saves}>
    <div className="space-y-7 pb-4">
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/app/patients/${visit.patient.id}`} className="flex min-h-12 items-center gap-1 text-[26px] font-extrabold tracking-tight text-gray-900">
              <h1 className="truncate">{visit.patient.name}</h1>
              <ChevronRight className="h-6 w-6 shrink-0 text-gray-400" aria-hidden="true" />
            </Link>
            <p className="text-sm text-gray-500">
              {[age !== null && `${age} yrs`, `Visit ${visit.number}`, formatDate(visit.visit_date, { weekday: 'short', day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
            </p>
            {isBirthday(visit.patient.birth_date) && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <Cake className="h-4 w-4 text-[var(--hud-gold)]" aria-hidden="true" /> Birthday today
              </p>
            )}
          </div>
          <ChairReadout startedAt={visit.created_at} visitDate={visit.visit_date} sentAt={visit.closed_at ?? null} resend={!!visit.resend_needed} />
        </div>
        <MedicalAlert alerts={visit.patient.medical_alerts} />
        {!visit.patient.consent_at && <AskConsent patientId={visit.patient.id} />}
      </div>

      <div id="visit-notes" className="scroll-mt-4">
        <VisitNotes handle={notesRef} visitId={visit.id} initialNotes={visit.notes}
          listed={visit.photos.length > 0 || bill.charges.length > 0 || bill.payments.length > 0}
          onSuggestions={takeSuggestions} onText={setNotesText} />
        {noteUnclear.length > 0 && <div className="mt-3"><NoteUnclear items={noteUnclear} onDismiss={() => setNoteUnclear([])} /></div>}
      </div>
      {(visit.recordings ?? []).length > 0 && (
        <details className="rounded-xl bg-white px-3 py-1 ring-1 ring-gray-200">
          <summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold text-gray-700">
            🎙 Recordings ({(visit.recordings ?? []).length})
          </summary>
          <ul className="space-y-2 pb-2">
            {(visit.recordings ?? []).map((r) => (
              <li key={r.id} className="space-y-1">
                <p className="text-xs text-gray-500">
                  {formatTimeOf(r.created_at)}
                  {r.seconds ? ` · ${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}` : ''}
                </p>
                {r.url ? <audio src={r.url} controls preload="none" className="w-full" aria-label="Recorded notes" /> : <p className="text-sm text-gray-500">Unavailable</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <PrescriptionCard notes={notesText} edit={editNotes} letterhead={clinic} patientName={visit.patient.name} age={age} visitDate={visit.visit_date} medicines={medicines} />

      <div className="space-y-2">
        <PhotoGallery visitId={visit.id} folder={folder} monitor={clinic.clinic.chairMonitor} photos={visit.photos} kindOf={kindOf} nameOf={nameOf} onKind={markKind} onUploads={setUploads}
          sends={visit.patient.phone ? sends : undefined}
          onSends={(photo, send) => { setTicks((t) => ({ ...t, [photo.id]: send })); sendRef.current?.reset() }} />
        {kindError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {kindError}
          </p>
        )}
      </div>

      {/* One card for the money: the bill's lines and total, then what was paid and what is still due */}
      <div id="visit-bill" className="scroll-mt-4">
        <BillSection visitId={visit.id} charges={bill.charges} total={bill.summary.total} usual={usual} priceList={priceList} save={save}
          fromNotes={noteCharges && (
            <NoteCharges key={noteCharges.round} visitId={visit.id} charges={noteCharges.charges} notOnList={noteCharges.notOnList}
              onDismiss={() => setNoteCharges(null)} />
          )}>
          {showPayment && (
            <PaymentCard
              key={`${bill.payments.length}-${bill.summary.due}`}
              visitId={visit.id}
              patientName={visit.patient.name}
              bill={bill}
              upi={clinic.clinic.upi}
              save={save}
              onSaving={setSavingPayment}
              handle={paymentRef}
            />
          )}
        </BillSection>
      </div>

      <div id="visit-next" className="scroll-mt-4">
        {/* A new suggestion from a recording starts the card afresh, with its length */}
        <NextVisit key={noteNext?.instant ?? 'worked-out'} visitId={visit.id} patientName={visit.patient.name}
          upcoming={next?.startsAt ?? null}
          upcomingMinutes={next?.minutes ?? DEFAULT_LENGTH}
          bookedHere={visit.next_booked_here || !!next?.pending} waiting={!!next?.pending} fromNotes={noteNext} />
      </div>

      <div id="visit-sent" className="scroll-mt-4">
        <SendWhatsApp clinic={clinic} visit={visit} bill={bill} nextAppointment={next?.startsAt ?? null} sentWaiting={sentWaiting}
          prescription={prescriptionLines(notesText).length > 0} uploads={uploads} whenSaved={whenSaved} handle={sendRef} onSent={() => setSentHere(true)} sends={sends} />
      </div>

      <DeleteVisit visit={visit} payments={heldPayments} />

      {nextStep && (
        <NextStepBar key={nextStep.kind} step={nextStep} watch={`${bill.payments.length}-${bill.summary.due}-${visit.closed_at ?? ''}`}
          // What is due, as the bar says. A failed save shows on the payment card, so go there
          onCash={() => void paymentRef.current?.cash(dueNow).then((ok) => { if (!ok) showSection('payment', 'start') })}
          onUpi={clinic.clinic.upi ? () => { if (!paymentRef.current?.upi(dueNow)) showSection('payment', 'start') } : undefined}
          // WhatsApp opens at once, or the Send part says why it is waiting
          onSend={() => { sendRef.current?.send(); showSection('visit-sent', 'end') }} />
      )}
    </div>
    </SavesProvider>
    </UndoProvider>
  )
}

// Patients added before the New patient form asked (or booked from the website or by phone) are asked
// at their next visit, once: the tap saves it and the question goes
function AskConsent({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  if (agreed) return null

  function agree() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await recordConsent(patientId)
        if (result.error) setError(result.error)
        else setAgreed(true)
      } catch {
        setError('No signal: tap again when it’s back.')
      }
    })
  }

  return (
    <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-gray-200">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-gray-700">
          <span className="font-semibold text-gray-900">Ask once:</span> may the clinic keep their details and treatment notes, for their care?
        </p>
        <button type="button" onClick={agree} disabled={pending}
          className="min-h-12 shrink-0 rounded-full px-4 text-base font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50 disabled:opacity-60">
          {pending ? 'Saving…' : 'They agree'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

// Rare, so small and at the very bottom. A visit that holds payments can't be deleted (the money is
// removed one payment at a time, on purpose); the question says what stays.
function DeleteVisit({ visit, payments }: { visit: VisitPageData; payments: Pick<VisitBill['payments'][number], 'amount' | 'method'>[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function remove() {
    setError(null)
    if (payments.length > 0) {
      setError(paymentsHeldMessage(payments))
      return
    }
    const next = visit.next_booked_here && visit.next_appointment ? visit.next_appointment.starts_at : null
    const question = [
      'Delete this visit, with its notes, photos and bill?',
      next && `The next visit on ${formatWhen(next)} stays booked.`,
      visit.closed_at && 'This bill was sent on WhatsApp.',
    ].filter(Boolean).join('\n\n')
    if (!window.confirm(question)) return
    startTransition(async () => {
      // On success this opens the patient page
      const result = await deleteVisit(visit.id, visit.patient.id)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="border-t border-gray-200 pt-4 text-center">
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={remove} disabled={pending}
        className="min-h-12 rounded-full px-5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
        {pending ? 'Deleting…' : 'Delete visit'}
      </button>
    </div>
  )
}
