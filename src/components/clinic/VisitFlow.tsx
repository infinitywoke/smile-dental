'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronRight } from 'lucide-react'
import type { VisitPhoto } from '@/lib/data/types'
import type { VisitBill } from '@/lib/data/billing'
import type { VisitPageData } from '@/lib/data/visits'
import { deleteVisit, setPhotoKind } from '@/lib/actions/visits'
import { formatDate } from '@/lib/dates'
import { photoKind, type PhotoKind } from '@/lib/visit-status'
import { BillSection, type Save } from './BillTools'
import { NextVisit } from './NextVisit'
import { PaymentCard } from './PaymentCard'
import { PhotoGallery, type UploadCounts } from './PhotoGallery'
import { SendWhatsApp } from './SendWhatsApp'
import { VisitNotes, type NotesHandle } from './VisitNotes'
import { MedicalAlert } from './ui'

// A visit is one page that saves by itself: notes, photos, bill, payment, next visit, WhatsApp.
export function VisitFlow({
  doctorId,
  visit,
  bill,
  focus,
}: {
  doctorId: string
  visit: VisitPageData
  bill: VisitBill
  // "payment": opened from a Collect link, so scroll to the payment card
  focus: 'payment' | null
}) {
  const notesRef = useRef<NotesHandle>(null)
  // Every other button first saves what was typed in the notes
  const beforeAction = useCallback(async () => {
    await notesRef.current?.flush()
  }, [])

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

  const hasBill = bill.charges.length > 0 || bill.payments.length > 0

  return (
    <div className="space-y-7 pb-4">
      <div className="space-y-3">
        <div>
          <Link href={`/app/patients/${visit.patient.id}`} className="flex min-h-12 items-center gap-1 text-2xl font-bold tracking-tight text-gray-900">
            <h1 className="truncate">{visit.patient.name}</h1>
            <ChevronRight className="h-6 w-6 shrink-0 text-gray-400" aria-hidden="true" />
          </Link>
          <p className="mt-1 text-base text-gray-500">{formatDate(visit.visit_date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <MedicalAlert alerts={visit.patient.medical_alerts} />
      </div>

      <VisitNotes handle={notesRef} visitId={visit.id} initialNotes={visit.notes}
        listed={visit.photos.length > 0 || bill.charges.length > 0 || bill.payments.length > 0} />

      <div className="space-y-2">
        <PhotoGallery visitId={visit.id} doctorId={doctorId} photos={visit.photos} kindOf={kindOf} onKind={markKind} onUploads={setUploads} />
        {kindError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {kindError}
          </p>
        )}
      </div>

      <BillSection visitId={visit.id} charges={bill.charges} total={bill.summary.total} beforeAction={beforeAction} save={save} />

      {hasBill && (
        <PaymentCard
          key={`${bill.payments.length}-${bill.summary.balance}`}
          visitId={visit.id}
          patientName={visit.patient.name}
          bill={bill}
          beforeAction={beforeAction}
          save={save}
        />
      )}

      <NextVisit visitId={visit.id} patientName={visit.patient.name} upcoming={visit.next_appointment?.starts_at ?? null}
        bookedHere={visit.next_booked_here} save={save} />

      <SendWhatsApp visit={visit} kindOf={kindOf} uploads={uploads} whenSaved={whenSaved} />

      <DeleteVisit visitId={visit.id} />
    </div>
  )
}

// Rare, so small and at the very bottom
function DeleteVisit({ visitId }: { visitId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function remove() {
    if (!window.confirm('Delete this whole visit, with its notes, photos, bill and payments? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deleteVisit(visitId)
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
