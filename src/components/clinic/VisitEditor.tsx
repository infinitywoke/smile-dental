'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Camera, Images, X } from 'lucide-react'
import { MicButton } from './MicButton'
import { appendDictation } from '@/lib/dictation'
import { useResetOnHide } from './useResetOnHide'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/resize-image'
import { addVisitPhotos, createVisit, saveVisitChanges } from '@/lib/actions/visits'

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
// For a new visit that was created but not fully saved (e.g. a photo failed), remember its id,
// so a retry after the tab reloads adds to the same visit instead of creating a second one
function pendingVisitKey(props: Props) {
  return props.mode === 'create' ? `visit-pending:${props.patientId}` : null
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
  const [listening, setListening] = useState(false)
  const key = draftKey(props)
  // Set on the first save attempt, so retries reuse the same visit and photo names
  const visitIdRef = useRef<string | null>(props.mode === 'edit' ? props.visitId : null)
  const visitCreatedRef = useRef(props.mode === 'edit')
  const uploadedRef = useRef(new Map<string, string>()) // photo key -> storage path
  const savingRef = useRef(false)
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
    const pendingKey = pendingVisitKey(props)
    const pendingId = pendingKey ? readDraft(pendingKey) : null
    if (pendingId) {
      visitIdRef.current = pendingId
      visitCreatedRef.current = true
    }
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
  const hasChanges = props.mode === 'create' ? notes.trim().length > 0 || photos.length > 0 : notesChanged || photos.length > 0
  const canSave = !saving && !listening && hasChanges

  // Uploads every photo not uploaded yet. Paths are fixed per photo, so a retry never duplicates a file.
  const uploadPhotos = async (visitId: string) => {
    const supabase = createClient()
    let failed = 0
    for (const [index, photo] of photos.entries()) {
      if (uploadedRef.current.has(photo.key)) continue
      setStatus(`Uploading photo ${index + 1} of ${photos.length}…`)
      const blob = await resizeImage(photo.file)
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${props.doctorId}/${visitId}/${photo.key}.${extension}`
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' })
      // "Already exists" means an earlier attempt uploaded it but the reply was lost
      if (!uploadError || /exist/i.test(uploadError.message)) uploadedRef.current.set(photo.key, path)
      else failed++
    }
    const records = photos
      .filter((p) => uploadedRef.current.has(p.key))
      .map((p) => ({ key: p.key, path: uploadedRef.current.get(p.key)!, caption: p.caption }))
    return { records, failed }
  }

  // Removes photos that are now saved to the visit from the on-screen list
  const dropSavedPhotos = (keys: string[]) => {
    setPhotos((current) => {
      current.filter((p) => keys.includes(p.key)).forEach((p) => URL.revokeObjectURL(p.preview))
      return current.filter((p) => !keys.includes(p.key))
    })
    keys.forEach((k) => uploadedRef.current.delete(k))
  }

  const save = async () => {
    if (savingRef.current) return // ignore a second tap while saving
    savingRef.current = true
    setError(null)
    setStatus('Saving…')
    let finished = false
    try {
      if (!visitIdRef.current) visitIdRef.current = crypto.randomUUID()
      const visitId = visitIdRef.current

      if (props.mode === 'create' && !visitCreatedRef.current) {
        const result = await createVisit(visitId, props.patientId, notes)
        if (result.error) {
          setError(result.error)
          return
        }
        visitCreatedRef.current = true
        const pendingKey = pendingVisitKey(props)
        if (pendingKey) writeDraft(pendingKey, visitId)
      }

      const { records, failed } = await uploadPhotos(visitId)
      const recorded = records.map(({ path, caption }) => ({ path, caption }))

      if (failed > 0) {
        // Keep what worked, leave the failed photos on screen for a retry
        if (recorded.length > 0) {
          const result = await addVisitPhotos(visitId, recorded)
          if (!result.error) dropSavedPhotos(records.map((r) => r.key))
        }
        setError(`${failed} photo${failed === 1 ? '' : 's'} couldn’t upload. Check the connection and tap Save again.`)
        return
      }

      setStatus('Saving…')
      // New visit: always send the current notes, so anything typed during a retry is kept
      const notesToSave = props.mode === 'create' || notesChanged ? notes : null
      const result = await saveVisitChanges(visitId, notesToSave, recorded)
      if (result.error) {
        setError(result.error)
        return
      }
      writeDraft(key, null)
      const pendingKey = pendingVisitKey(props)
      if (pendingKey) writeDraft(pendingKey, null)
      finished = true

      if (props.mode === 'create') {
        setStatus('Opening visit…')
        router.replace(`/app/visits/${visitId}`)
      } else {
        dropSavedPhotos(records.map((r) => r.key))
        setRestored(false)
        setStatus(null)
      }
    } catch {
      setError('Something went wrong. Check the connection and tap Save again.')
    } finally {
      savingRef.current = false
      // On success in create mode the button stays disabled until the visit page opens
      if (!finished) setStatus(null)
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
          <MicButton onText={(t) => changeNotes((v) => appendDictation(v, t))} onInterim={setHearing} onListeningChange={setListening} disabled={saving} />
        </div>
        {listening && (
          <p className="min-h-10 rounded-lg bg-blue-50 px-3 py-2 text-sm italic text-blue-900" aria-live="polite">
            {hearing ? `${hearing}…` : 'Listening…'}
          </p>
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
        {status ?? (listening ? 'Stop dictation to save' : props.mode === 'create' ? 'Save visit' : 'Save changes')}
      </button>
    </div>
  )
}
