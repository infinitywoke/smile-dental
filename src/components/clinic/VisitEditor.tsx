'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Camera, Images, X } from 'lucide-react'
import { MicButton, appendDictation } from './MicButton'
import { useResetOnHide } from './useResetOnHide'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/resize-image'
import { addVisitPhotos, createVisit, updateVisitNotes } from '@/lib/actions/visits'

const PHOTO_BUCKET = 'visit-photos'

type Props =
  | { mode: 'create'; doctorId: string; patientId: string }
  | { mode: 'edit'; doctorId: string; visitId: string; notes: string }

type NewPhoto = { key: string; file: File; preview: string; caption: string }

// Unsaved notes are kept on the phone, so they survive Android closing the tab
// while the camera app is open. Storage can be unavailable (private mode), so never throw.
function draftKey(props: Props) {
  return props.mode === 'create' ? `visit-draft:new:${props.patientId}` : `visit-draft:${props.visitId}`
}
function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeDraft(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not critical: the draft is only a safety net
  }
}

export function VisitEditor(props: Props) {
  const resetKey = useResetOnHide()
  return <Editor key={resetKey} {...props} />
}

function Editor(props: Props) {
  const router = useRouter()
  const initialNotes = props.mode === 'edit' ? props.notes : ''
  const [notes, setNotes] = useState(initialNotes)
  const [photos, setPhotos] = useState<NewPhoto[]>([])
  const [hearing, setHearing] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const key = draftKey(props)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const saving = status !== null

  // Release preview images when they are removed or the editor closes
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  // Bring back notes that were never saved (e.g. the tab reloaded after taking a photo)
  useEffect(() => {
    const draft = readDraft(key)
    if (draft && draft.trim() !== initialNotes.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft lives in browser storage, only readable after mount
      setNotes(draft)
      setRestored(true)
    }
    // Only on mount: later edits are written to the draft below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeNotes = (update: (current: string) => string) => {
    setNotes((current) => {
      const next = update(current)
      writeDraft(key, next.trim() === initialNotes.trim() ? null : next)
      return next
    })
  }

  const addFiles = (input: HTMLInputElement) => {
    if (!input.files) return
    const added = Array.from(input.files).map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), caption: '' }))
    setPhotos((current) => [...current, ...added])
    input.value = ''
  }

  const removePhoto = (key: string) => {
    setPhotos((current) => {
      const photo = current.find((p) => p.key === key)
      if (photo) URL.revokeObjectURL(photo.preview)
      return current.filter((p) => p.key !== key)
    })
  }

  const setCaption = (key: string, caption: string) =>
    setPhotos((current) => current.map((p) => (p.key === key ? { ...p, caption } : p)))

  const notesChanged = notes.trim() !== initialNotes.trim()
  const canSave = !saving && (props.mode === 'create' ? notes.trim().length > 0 || photos.length > 0 : notesChanged || photos.length > 0)

  const uploadPhotos = async (visitId: string) => {
    if (photos.length === 0) return true
    const supabase = createClient()
    const uploaded: { path: string; caption: string }[] = []
    for (const [index, photo] of photos.entries()) {
      setStatus(`Uploading photo ${index + 1} of ${photos.length}…`)
      const blob = await resizeImage(photo.file)
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${props.doctorId}/${visitId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' })
      if (uploadError) {
        setError(`Photo ${index + 1} could not be uploaded. Check the connection and try again.`)
        break
      }
      uploaded.push({ path, caption: photo.caption })
    }
    if (uploaded.length > 0) {
      const result = await addVisitPhotos(visitId, uploaded)
      if (result.error) {
        setError(result.error)
        return false
      }
      const uploadedCount = uploaded.length
      setPhotos((current) => {
        current.slice(0, uploadedCount).forEach((p) => URL.revokeObjectURL(p.preview))
        return current.slice(uploadedCount)
      })
    }
    return uploaded.length === photos.length
  }

  const save = async () => {
    setError(null)
    setStatus('Saving…')
    try {
      if (props.mode === 'create') {
        const result = await createVisit(props.patientId, notes)
        if (result.error || !result.visitId) {
          setError(result.error ?? 'Could not save the visit.')
          return
        }
        writeDraft(key, null)
        const allUploaded = await uploadPhotos(result.visitId)
        // Open the saved visit; any photo that failed can be added again there
        router.push(`/app/visits/${result.visitId}${allUploaded ? '' : '?photos=failed'}`)
      } else {
        if (notesChanged) {
          const result = await updateVisitNotes(props.visitId, notes)
          if (result.error) {
            setError(result.error)
            return
          }
          writeDraft(key, null)
        }
        await uploadPhotos(props.visitId)
      }
    } catch {
      setError('Something went wrong. Check the connection and try again.')
    } finally {
      setStatus(null)
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="notes" className="text-sm font-semibold text-gray-700">Notes</label>
          <MicButton onText={(t) => changeNotes((v) => appendDictation(v, t))} onInterim={setHearing} />
        </div>
        {hearing && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm italic text-blue-900" aria-live="polite">{hearing}…</p>
        )}
        {restored && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Restored notes you hadn&apos;t saved yet.
          </p>
        )}
        <textarea id="notes" rows={9} value={notes} onChange={(e) => { const value = e.target.value; changeNotes(() => value) }} disabled={saving}
          placeholder="Complaint, findings, diagnosis, treatment done, plan, medicines, next visit…"
          className="block w-full rounded-xl border-0 px-4 py-3 text-base leading-relaxed text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700">{props.mode === 'edit' ? 'Add photos' : 'Photos'}</p>
        {photos.map((photo, index) => (
          <div key={photo.key} className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an unsaved photo */}
            <img src={photo.preview} alt={`New photo ${index + 1}`} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
            <div className="flex-1 space-y-2">
              <input value={photo.caption} onChange={(e) => setCaption(photo.key, e.target.value)} disabled={saving}
                placeholder="What is this? e.g. Prescription, CT scan"
                className="block w-full rounded-lg border-0 px-3 py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
              <button type="button" onClick={() => removePhoto(photo.key)} disabled={saving}
                className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-red-600">
                <X className="h-4 w-4" /> Remove
              </button>
            </div>
          </div>
        ))}
        {/* Two inputs: Android opens the gallery (no camera) when multiple selection is allowed */}
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target)} />
        <input ref={galleryInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target)} />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => cameraInput.current?.click()} disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 py-4 text-base font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700">
            <Camera className="h-5 w-5" /> Take photo
          </button>
          <button type="button" onClick={() => galleryInput.current?.click()} disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 py-4 text-base font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700">
            <Images className="h-5 w-5" /> Gallery
          </button>
        </div>
      </div>

      <button type="button" onClick={save} disabled={!canSave}
        className="w-full rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
        {status ?? (props.mode === 'create' ? 'Save visit' : 'Save changes')}
      </button>
    </div>
  )
}
