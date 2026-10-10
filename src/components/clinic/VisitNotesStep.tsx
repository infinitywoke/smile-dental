'use client'

import type { Ref } from 'react'
import type { VisitDetail } from '@/lib/data/types'
import { PhotoGallery } from './PhotoGallery'
import { VisitEditor, type EditorHandle } from './VisitEditor'

// Step 1: what happened. Dictate or type, add photos. "Next: Bill" saves anything new first.
export function VisitNotesStep({
  doctorId,
  visit,
  editorRef,
  onNext,
}: {
  doctorId: string
  visit: VisitDetail
  editorRef: Ref<EditorHandle>
  onNext: () => void
}) {
  return (
    <div className="space-y-5 pb-12">
      <PhotoGallery photos={visit.photos} />
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
  )
}
