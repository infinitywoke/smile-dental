'use client'

import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { VisitDetail } from '@/lib/data/types'
import type { VisitBill } from '@/lib/data/billing'
import { formatDate } from '@/lib/dates'
import { visitStatus } from '@/lib/visit-status'
import type { EditorHandle } from './VisitEditor'
import { VisitNotesStep } from './VisitNotesStep'
import { VisitBillStep } from './VisitBillStep'
import { VisitSendStep } from './VisitSendStep'
import { VisitMenu } from './VisitMenu'
import { VisitStatusBadge } from './VisitStatusBadge'
import { MedicalAlert, TestBadge } from './ui'

type Step = 'notes' | 'bill' | 'send'

const STEPS: { id: Step; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'bill', label: 'Bill' },
  { id: 'send', label: 'Send' },
]

// A visit is three steps: Notes, Bill, Send. Each ends in one forward button.
export function VisitFlow({
  doctor,
  visit,
  bill,
  suggestion,
  initialStep = 'notes',
}: {
  doctor: { id: string }
  visit: VisitDetail
  bill: VisitBill
  suggestion: string | null
  initialStep?: Step
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const editorRef = useRef<EditorHandle>(null)

  // Leaving Notes never leaves unsaved words behind: they are saved first, and we stay if that fails
  async function goTo(next: Step) {
    if (next === step) return
    if (step === 'notes' && editorRef.current?.hasChanges()) {
      const saved = await editorRef.current.save()
      if (!saved) return
    }
    setStep(next)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('step', next)
      window.history.replaceState({}, '', url.toString())
    } catch {
      // The address bar is a nicety only
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const status = visitStatus({ closedAt: visit.closed_at, total: bill.summary.total, paid: bill.summary.paid })
  const complete: Record<Step, boolean> = {
    notes: visit.notes.trim().length > 0 || visit.photos.length > 0,
    bill: bill.charges.length > 0,
    send: !!visit.closed_at,
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
            <span className="truncate">{visit.patient.name}</span>
            {visit.patient.is_test && <TestBadge />}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            {formatDate(visit.visit_date, { weekday: 'long', day: 'numeric', month: 'long' })}
            <VisitStatusBadge status={status} />
          </p>
        </div>
        <VisitMenu visitId={visit.id} />
      </div>

      <MedicalAlert alerts={visit.patient.medical_alerts} />

      <nav aria-label="Visit steps" className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1 text-sm font-semibold">
        {STEPS.map(({ id, label }, index) => (
          <button key={id} type="button" onClick={() => goTo(id)} aria-current={step === id ? 'step' : undefined}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
              step === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {complete[id] && step !== id ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${step === id ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-700'}`}>
                {index + 1}
              </span>
            )}
            {label}
          </button>
        ))}
      </nav>

      {/* Notes stays mounted, so typing is never lost when looking at another step */}
      <div hidden={step !== 'notes'}>
        <VisitNotesStep doctorId={doctor.id} visit={visit} editorRef={editorRef} onNext={() => goTo('bill')} />
      </div>
      {step === 'bill' && (
        <VisitBillStep
          visitId={visit.id}
          patientName={visit.patient.name}
          bill={bill}
          onBack={() => goTo('notes')}
          onNext={() => goTo('send')}
        />
      )}
      {step === 'send' && <VisitSendStep visit={visit} bill={bill} suggestion={suggestion} onBack={() => goTo('bill')} />}
    </div>
  )
}
