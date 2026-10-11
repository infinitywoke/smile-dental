'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { AlertCircle, Camera, Images, Loader2, Trash2, X } from 'lucide-react'
import { addVisitPhoto, deleteVisitPhoto } from '@/lib/actions/visits'
import type { VisitPhoto } from '@/lib/data/types'
import { createClient } from '@/lib/supabase/client'
import { resizeImage } from '@/lib/resize-image'
import { PHOTO_KINDS, type PhotoKind } from '@/lib/visit-status'
import { useBackToClose } from './FullScreen'

const PHOTO_BUCKET = 'visit-photos'
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
// Under each one, a tap marks it Prescription, X-ray or Other.
export function PhotoGallery({
  visitId,
  doctorId,
  photos,
  kindOf,
  onKind,
  onUploads,
}: {
  visitId: string
  doctorId: string
  photos: VisitPhoto[]
  kindOf: (photo: VisitPhoto) => PhotoKind | null
  onKind: (photo: VisitPhoto, kind: PhotoKind) => void
  // Told whenever the photos still on their way change, so Send on WhatsApp can wait for them
  onUploads: (counts: UploadCounts) => void
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

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-gray-900">Photos</h2>

      {photos.map((photo, index) => {
        const kind = kindOf(photo)
        const url = urlOf(photo)
        return (
          <div key={photo.id} className="space-y-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200">
            <button type="button" onClick={() => openPhoto(photo)} className="block w-full overflow-hidden rounded-xl bg-gray-100">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed link from private storage
                <img src={url} alt={`Photo ${index + 1}${kind ? `: ${kind}` : ''}`} className="h-44 w-full object-cover"
                  onError={() => photo.url && photo.url !== url && setShown((s) => ({ ...s, [photo.id]: photo.url! }))} />
              ) : (
                <span className="flex h-44 items-center justify-center text-sm text-gray-500">Photo unavailable</span>
              )}
            </button>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Photo ${index + 1} is a`}>
              {PHOTO_KINDS.map((option) => (
                <button key={option} type="button" aria-pressed={kind === option} onClick={() => onKind(photo, option)}
                  className={`h-12 rounded-xl px-1 text-sm font-semibold ring-1 ring-inset transition-colors ${
                    kind === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
                  }`}>
                  {option}
                </button>
              ))}
            </div>
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
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => cameraInput.current?.click()}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 text-base font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700">
          <Camera className="h-5 w-5" /> Take photo
        </button>
        <button type="button" onClick={() => galleryInput.current?.click()}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-3 text-base font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700">
          <Images className="h-5 w-5" /> Gallery
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
          className="flex h-12 w-12 items-center justify-center rounded-full text-white hover:bg-white/10">
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
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button type="button" onClick={remove} disabled={pending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white/10 text-base font-semibold text-red-300 disabled:opacity-60">
          <Trash2 className="h-5 w-5" /> Delete photo
        </button>
      </div>
    </div>
  )
}
