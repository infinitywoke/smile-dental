'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronRight } from 'lucide-react'
import type { VisitPhoto } from '@/lib/data/types'
import type { VisitBill } from '@/lib/data/billing'
import type { VisitPageData } from '@/lib/data/visits'
import { deleteVisit, setPhotoKind } from '@/lib/actions/visits'
import { paymentsHeldMessage } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { photoKind, type PhotoKind } from '@/lib/visit-status'
import { patientAge } from '@/lib/patient-fields'
import { visitProgress, type VisitStepKey } from '@/lib/visit-progress'
import type { UsualCharge } from '@/lib/usual-charges'
import { ChairReadout, VisitProgress } from './VisitHud'
import { BillSection, type Save } from './BillTools'
import { NextVisit } from './NextVisit'
import { PaymentCard, type PaymentHandle, type SavingPayment } from './PaymentCard'
import { PhotoGallery, type UploadCounts } from './PhotoGallery'
import { SendWhatsApp, type SendHandle } from './SendWhatsApp'
import { NextStepBar, type NextStep } from './NextStepBar'
import { VisitNotes, type NotesHandle } from './VisitNotes'
import { MedicalAlert } from './ui'
import { UndoProvider } from './UndoBar'
import { NoteSuggestions } from './NoteSuggestions'
import { PrescriptionCard } from './PrescriptionCard'
import type { NoteSuggestions as Suggestions } from '@/lib/actions/smart-notes'

// A visit is one page that saves by itself: notes, photos, bill, payment, next visit, WhatsApp.
export function VisitFlow({
  doctorId,
  visit,
  bill,
  medicines,
  usual,
  focus,
}: {
  doctorId: string
  visit: VisitPageData
  bill: VisitBill
  // One-tap medicines for the prescription
  medicines: string[]
  // The price-list items he bills most, one tap each on the bill
  usual: UsualCharge[]
  // "payment": opened from a Collect link, so scroll to the payment card
  focus: 'payment' | null
}) {
  const notesRef = useRef<NotesHandle>(null)
  // What Gemini suggested from a recording (charges, next visit), until tapped or dismissed
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
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

  // Photos still uploading or failed: Send waits for them
  const [uploads, setUploads] = useState<UploadCounts>({ uploading: 0, failed: 0 })

  // A photo's kind shows at once; the server catches up
  const [kinds, setKinds] = useState<Record<string, PhotoKind>>({})
  const [kindError, setKindError] = useState<string | null>(null)
  const kindOf = useCallback((photo: VisitPhoto) => kinds[photo.id] ?? photoKind(photo.caption), [kinds])
  const markKind = async (photo: VisitPhoto, kind: PhotoKind) => {
    const before = kinds[photo.id]
    setKindError(null)
    setKinds((k) => ({ ...k, [photo.id]: kind }))
    try {
      const result = await save(() => setPhotoKind(photo.id, kind))
      if (result.error) throw new Error(result.error)
    } catch {
      setKinds((k) => {
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
  // The progress strip, from what is on the page now (a payment still saving counts)
  const steps = visitProgress({
    notes: notesText,
    charges: bill.charges.length,
    total: bill.summary.total,
    paid: bill.summary.paid + (pendingPayment?.amount ?? 0),
    due: bill.summary.due - (pendingPayment?.amount ?? 0),
    next: !!visit.next_appointment,
    sent: !!visit.closed_at,
    resend: !!visit.resend_needed,
  })
  // Paid scrolls to the payment card when there is one
  const jump = (key: VisitStepKey) => {
    const id = key === 'paid' ? (showPayment ? 'payment' : 'visit-bill') : `visit-${key}`
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
      : visit.patient.phone && hasContent && ((!visit.closed_at && !sentHere) || visit.resend_needed) ? { kind: 'send' }
        : null
  const showSection = (id: string, block: ScrollLogicalPosition) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block })

  return (
    <UndoProvider>
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
          </div>
          <ChairReadout startedAt={visit.created_at} visitDate={visit.visit_date} sentAt={visit.closed_at ?? null} resend={!!visit.resend_needed} />
        </div>
        <MedicalAlert alerts={visit.patient.medical_alerts} />
        <VisitProgress steps={steps} onJump={jump} />
      </div>

      <div id="visit-notes" className="scroll-mt-4">
        <VisitNotes handle={notesRef} visitId={visit.id} initialNotes={visit.notes}
          listed={visit.photos.length > 0 || bill.charges.length > 0 || bill.payments.length > 0}
          onSuggestions={setSuggestions} onText={setNotesText} />
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
                  {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                  {r.seconds ? ` · ${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}` : ''}
                </p>
                {r.url ? <audio src={r.url} controls preload="none" className="w-full" aria-label="Recorded notes" /> : <p className="text-sm text-gray-500">Unavailable</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {suggestions && (
        <NoteSuggestions visitId={visit.id} suggestions={suggestions} hasNextVisit={!!visit.next_appointment}
          save={save} onDismiss={() => setSuggestions(null)} />
      )}

      <PrescriptionCard notes={notesText} edit={editNotes} patientName={visit.patient.name} visitDate={visit.visit_date} medicines={medicines} />

      <div className="space-y-2">
        <PhotoGallery visitId={visit.id} doctorId={doctorId} photos={visit.photos} kindOf={kindOf} onKind={markKind} onUploads={setUploads} />
        {kindError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {kindError}
          </p>
        )}
      </div>

      <div id="visit-bill" className="scroll-mt-4">
        <BillSection visitId={visit.id} charges={bill.charges} total={bill.summary.total} usual={usual} save={save} />
      </div>

      {showPayment && (
        <PaymentCard
          key={`${bill.payments.length}-${bill.summary.due}`}
          visitId={visit.id}
          patientName={visit.patient.name}
          bill={bill}
          save={save}
          onSaving={setSavingPayment}
          handle={paymentRef}
        />
      )}

      <div id="visit-next" className="scroll-mt-4">
        <NextVisit visitId={visit.id} patientName={visit.patient.name} upcoming={visit.next_appointment?.starts_at ?? null}
          upcomingMinutes={visit.next_appointment?.duration_min ?? 40}
          bookedHere={visit.next_booked_here} save={save} />
      </div>

      <div id="visit-sent" className="scroll-mt-4">
        <SendWhatsApp visit={visit} kindOf={kindOf} uploads={uploads} whenSaved={whenSaved} handle={sendRef} onSent={() => setSentHere(true)} />
      </div>

      <DeleteVisit visit={visit} payments={heldPayments} />

      {nextStep && (
        <NextStepBar key={nextStep.kind} step={nextStep} watch={`${bill.payments.length}-${bill.summary.due}-${visit.closed_at ?? ''}`}
          // What is due, as the bar says. A failed save shows on the payment card, so go there
          onCash={() => void paymentRef.current?.cash(dueNow).then((ok) => { if (!ok) showSection('payment', 'start') })}
          onUpi={() => { if (!paymentRef.current?.upi(dueNow)) showSection('payment', 'start') }}
          // WhatsApp opens at once, or the Send part says why it is waiting
          onSend={() => { sendRef.current?.send(); showSection('visit-sent', 'end') }} />
      )}
    </div>
    </UndoProvider>
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
    const next = visit.next_booked_here && visit.next_appointment ? inIndia(visit.next_appointment.starts_at) : null
    const question = [
      'Delete this visit, with its notes, photos and bill?',
      next && `The next visit on ${formatDay(next.date)}, ${formatBlock(next.time)} stays booked.`,
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
