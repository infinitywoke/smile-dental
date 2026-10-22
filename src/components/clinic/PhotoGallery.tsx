'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { AlertCircle, Camera, Images, Loader2, Trash2, X } from 'lucide-react'
import { addVisitPhoto, deleteVisitPhoto } from '@/lib/actions/visits'
import type { VisitPhoto } from '@/lib/data/types'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/resize-image'
import { PHOTO_BUCKET, PHOTO_KINDS, type PhotoKind } from '@/lib/visit-status'
import { useBackToClose } from './FullScreen'

// A photo that failed to upload is tried again this often (and as soon as the phone is back online)
const RETRY_MS = 10_000
// One try may take this long; slower than that it counts as failed, so the retry and Remove take over
const TRY_MS = 45_000

// The upload itself can't be cancelled, so a slow try is left to finish on its own. If it did reach
// the server, the next try finds the file "already there" and the photo is recorded once.
function withinTime<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out')), ms)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

type Uploading = { key: string; file: File; preview: string; failed: boolean }

// Photos not on the visit yet: still uploading, or failed (and being tried again)
export type UploadCounts = { uploading: number; failed: number }

// Photos upload the moment they are taken or picked, and appear on the visit.
// Under each one, a tap marks it Prescription, X-ray or Other (and he can type what an Other one is).
export function PhotoGallery({
  visitId,
  doctorId,
  photos,
  kindOf,
  nameOf,
  onKind,
  onUploads,
  sends,
  onSends,
}: {
  visitId: string
  doctorId: string
  photos: VisitPhoto[]
  kindOf: (photo: VisitPhoto) => PhotoKind | null
  // What a photo is called ("Prescription", or the name he typed for an Other one, else "Photo")
  nameOf: (photo: VisitPhoto) => string
  onKind: (photo: VisitPhoto, kind: PhotoKind, name?: string) => void
  // Told whenever the photos still on their way change, so Send on WhatsApp can wait for them
  onUploads: (counts: UploadCounts) => void
  // Whether a photo goes with the WhatsApp message, and the tick that changes it (none without a number)
  sends?: (photo: VisitPhoto) => boolean
  onSends?: (photo: VisitPhoto, send: boolean) => void
}) {
  const [uploading, setUploading] = useState<Uploading[]>([])
  const [, startTransition] = useTransition()
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const viewer = useBackToClose()
  const [viewing, setViewing] = useState<VisitPhoto | null>(null)

  // The server signs a fresh link on every refresh of the page; keep showing the first one,
  // so saved photos don't reload each time the notes save
  const [shown, setShown] = useState<Record<string, string>>({})
  const missing = photos.filter((p) => p.url && !shown[p.id])
  if (missing.length > 0) setShown((s) => ({ ...s, ...Object.fromEntries(missing.map((p) => [p.id, p.url!])) }))
  const urlOf = (photo: VisitPhoto) => shown[photo.id] ?? photo.url

  // Release preview images when the section closes
  const uploadingRef = useRef(uploading)
  useEffect(() => {
    uploadingRef.current = uploading
  }, [uploading])
  useEffect(() => () => uploadingRef.current.forEach((u) => URL.revokeObjectURL(u.preview)), [])

  // Photos removed by the doctor: a try still on its way must not add them to the visit
  const removed = useRef(new Set<string>())

  const upload = useCallback(async (item: Uploading) => {
    setUploading((list) => list.map((u) => (u.key === item.key ? { ...u, failed: false } : u)))
    const attempt = async () => {
      const blob = await resizeImage(item.file)
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      // A fixed name per photo, so trying again never stores it twice
      const path = `${doctorId}/${visitId}/${item.key}.${extension}`
      const storage = createClient().storage.from(PHOTO_BUCKET)
      const { error } = await storage.upload(path, blob, { contentType: blob.type || 'image/jpeg' })
      // "Already exists" means an earlier try uploaded it but the reply was lost (or it timed out here)
      if (error && !/exist/i.test(error.message)) throw error
      if (removed.current.has(item.key)) {
        await storage.remove([path]).catch(() => {})
        return
      }
      // The visit keeps one row per file, so recording it again is harmless
      const result = await addVisitPhoto(visitId, path)
      if (result.error) throw new Error(result.error)
    }
    try {
      await withinTime(attempt(), TRY_MS)
      startTransition(() => {
        setUploading((list) => list.filter((u) => u.key !== item.key))
      })
      URL.revokeObjectURL(item.preview)
    } catch {
      setUploading((list) => list.map((u) => (u.key === item.key ? { ...u, failed: true } : u)))
    }
  }, [doctorId, visitId])

  // A failed photo is tried again by itself, as the notes are, until it uploads or is removed
  const hasFailed = uploading.some((u) => u.failed)
  useEffect(() => {
    if (!hasFailed) return
    const retry = () => uploadingRef.current.filter((u) => u.failed).forEach((u) => void upload(u))
    const timer = setInterval(retry, RETRY_MS)
    window.addEventListener('online', retry)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', retry)
    }
  }, [hasFailed, upload])

  const uploadingCount = uploading.filter((u) => !u.failed).length
  const failedCount = uploading.length - uploadingCount
  useEffect(() => {
    onUploads({ uploading: uploadingCount, failed: failedCount })
  }, [onUploads, uploadingCount, failedCount])

  const addFiles = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])
    input.value = ''
    const added = files.map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), failed: false }))
    setUploading((list) => [...list, ...added])
    added.forEach((item) => void upload(item))
  }

  const discard = (item: Uploading) => {
    removed.current.add(item.key)
    URL.revokeObjectURL(item.preview)
    setUploading((list) => list.filter((u) => u.key !== item.key))
  }

  const openPhoto = (photo: VisitPhoto) => {
    setViewing(photo)
    viewer.show()
  }

  const empty = photos.length === 0 && uploading.length === 0

  return (
    <section className="space-y-3">
      {!empty && <h2 className="hud-heading">Photos</h2>}

      {photos.map((photo, index) => {
        const kind = kindOf(photo)
        const name = nameOf(photo)
        const url = urlOf(photo)
        return (
          <div key={photo.id} className="space-y-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200">
            <button type="button" onClick={() => openPhoto(photo)} className="block w-full overflow-hidden rounded-xl bg-gray-100">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed link from private storage
                <img src={url} alt={`Photo ${index + 1}${kind ? `: ${name}` : ''}`} className="h-44 w-full object-cover"
                  onError={() => photo.url && photo.url !== url && setShown((s) => ({ ...s, [photo.id]: photo.url! }))} />
              ) : (
                <span className="flex h-44 items-center justify-center text-sm text-gray-500">Photo unavailable</span>
              )}
            </button>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Photo ${index + 1} is a`}>
              {PHOTO_KINDS.map((option) => (
                <button key={option} type="button" aria-pressed={kind === option} onClick={() => kind !== option && onKind(photo, option)}
                  className={`h-12 rounded-xl px-1 text-sm font-semibold ring-1 ring-inset transition-colors ${
                    kind === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
                  }`}>
                  {option}
                </button>
              ))}
            </div>
            {kind === 'Other' && (
              <OtherName key={`${photo.id}-${name}`} index={index} name={name === 'Photo' ? '' : name} onSave={(typed) => onKind(photo, 'Other', typed)} />
            )}
            {sends && onSends && (
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-2">
                <input type="checkbox" checked={sends(photo)} onChange={(e) => onSends(photo, e.target.checked)}
                  className="h-6 w-6 shrink-0 rounded border-gray-300 text-blue-600" />
                <span className="text-base text-gray-900">{name} {index + 1}: send on WhatsApp</span>
              </label>
            )}
          </div>
        )
      })}

      {uploading.map((item) => (
        <div key={item.key} className="flex items-center gap-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview while it uploads */}
          <img src={item.preview} alt="New photo" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
          {item.failed ? (
            <div className="min-w-0 flex-1 space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> Couldn&apos;t upload. Trying again by itself.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void upload(item)}
                  className="h-12 flex-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white">Try again</button>
                <button type="button" onClick={() => discard(item)} aria-label="Remove this photo"
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-gray-500 ring-1 ring-gray-300">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="flex flex-1 items-center gap-2 text-sm font-medium text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </p>
              <button type="button" onClick={() => discard(item)} aria-label="Remove this photo"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-gray-500 ring-1 ring-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Two inputs: Android opens only the gallery (no camera) when several photos may be picked */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target)} />
      <input ref={galleryInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target)} />
      {/* One slim row until there are photos: most visits have none */}
      <div className={`flex items-center gap-2 ${empty ? 'min-h-14 rounded-2xl bg-white py-1.5 pr-1.5 pl-4 ring-1 ring-gray-200' : 'justify-end'}`}>
        {empty && (
          <span className="flex flex-1 items-center gap-3 text-base font-semibold text-gray-900">
            <Camera className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />Photos
          </span>
        )}
        <button type="button" onClick={() => cameraInput.current?.click()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50">
          <Camera className="h-4 w-4" aria-hidden="true" /> Take photo
        </button>
        <button type="button" onClick={() => galleryInput.current?.click()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50">
          <Images className="h-4 w-4" aria-hidden="true" /> Gallery
        </button>
      </div>

      {viewer.open && viewing && <PhotoViewer key={viewing.id} photo={viewing} url={urlOf(viewing)} onClose={viewer.close} />}
    </section>
  )
}

// The photo, full screen. Back (or the X) closes it.
function PhotoViewer({ photo, url, onClose }: { photo: VisitPhoto; url: string | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const remove = () => {
    if (!window.confirm('Delete this photo?')) return
    startTransition(async () => {
      const result = await deleteVisitPhoto(photo.id)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="flex justify-end p-1">
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-12 w-12 items-center justify-center rounded-full text-[#fff] hover:bg-[#fff]/10">
          <X className="h-7 w-7" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-2">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- signed link from private storage
          <img src={url} alt={photo.caption || 'Visit photo'} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="space-y-2 p-4">
        {/* A black viewer in every theme, so its colours are fixed */}
        {error && <p className="text-sm text-[#FCA5A5]">{error}</p>}
        <button type="button" onClick={remove} disabled={pending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#fff]/10 text-base font-semibold text-[#FCA5A5] disabled:opacity-60">
          <Trash2 className="h-5 w-5" /> Delete photo
        </button>
      </div>
    </div>
  )
}

// What an Other photo is, in his words ("Lab slip"); saved with Save or the keyboard's Enter
function OtherName({ index, name, onSave }: { index: number; name: string; onSave: (name: string) => void }) {
  const [text, setText] = useState(name)
  const changed = text.trim() !== name
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (changed) onSave(text) }}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={40} enterKeyHint="done"
        placeholder="What is it? e.g. lab slip" aria-label={`Photo ${index + 1}: what is it?`}
        className="block min-h-12 min-w-0 flex-1 rounded-xl border-0 px-3 text-base ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600" />
      <button type="submit" disabled={!changed}
        className="min-h-12 shrink-0 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white disabled:opacity-40">
        Save
      </button>
    </form>
  )
}
