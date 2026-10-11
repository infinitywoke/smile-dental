'use client'

import { useState, type RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import type { VisitDetail } from '@/lib/data/types'
import type { VisitSummary } from '@/lib/ai/visit-summary'
import { tidyVisitNote } from '@/lib/actions/smart-notes'
import { PhotoGallery } from './PhotoGallery'
import { SmartNoteCard } from './SmartNoteCard'
import { VisitEditor, type EditorHandle } from './VisitEditor'

// Step 1: what happened. Dictate or type, add photos. "Tidy up" lets Claude turn the words into a
// clean note and bill lines for one-tap confirmation; "Next: Bill" skips that and saves as is.
export function VisitNotesStep({
  doctorId,
  visit,
  editorRef,
  onNext,
}: {
  doctorId: string
  visit: VisitDetail
  editorRef: RefObject<EditorHandle | null>
  onNext: () => void
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<VisitSummary | null>(null)

  async function tidy() {
    setError(null)
    setWorking(true)
    try {
      // What was typed a moment ago is saved first; the tidy-up reads the saved note
      if (editorRef.current?.hasChanges() && !(await editorRef.current.save())) return
      const result = await tidyVisitNote(visit.id)
      if (result.error || !result.summary) setError(result.error ?? 'Could not tidy the note. Please try again.')
      else {
        setSummary(result.summary)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setError("Couldn't reach the server. Check the internet connection and try again.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="space-y-5 pb-12">
      {summary && (
        <SmartNoteCard
          visitId={visit.id}
          initial={summary}
          onCancel={() => setSummary(null)}
          onConfirmed={() => {
            setSummary(null)
            onNext()
          }}
        />
      )}

      {/* The editor stays mounted, so nothing typed is lost while the card is open */}
      <div hidden={summary !== null} className="space-y-5">
        <PhotoGallery photos={visit.photos} />
        <button type="button" onClick={tidy} disabled={working}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-violet-50 px-5 py-3 text-base font-semibold text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100 disabled:opacity-60">
          <Sparkles className="h-5 w-5" />
          {working ? 'Tidying up…' : visit.confirmed_at ? 'Tidy up again' : 'Tidy up with AI'}
        </button>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <VisitEditor
          handle={editorRef}
          key={visit.updated_at}
          mode="edit"
          doctorId={doctorId}
          visitId={visit.id}
          notes={visit.notes}
          continueLabel="Next: Bill"
          onContinue={onNext}
        />
      </div>
    </div>
  )
}
