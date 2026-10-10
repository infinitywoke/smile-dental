'use client'

import { useEffect, useState, useTransition } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { deleteVisitPhoto, updatePhotoCaption } from '@/lib/actions/visits'
import type { VisitPhoto } from '@/lib/data/types'

export function PhotoGallery({ photos }: { photos: VisitPhoto[] }) {
  const [open, setOpen] = useState<VisitPhoto | null>(null)

  // Opening a photo adds a history entry, so Android's Back button closes the viewer
  // instead of leaving the visit
  useEffect(() => {
    if (!open) return
    const onBack = () => setOpen(null)
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [open])

  const openPhoto = (photo: VisitPhoto) => {
    window.history.pushState(window.history.state, '')
    setOpen(photo)
  }
  const closePhoto = () => window.history.back()

  if (photos.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {photos.map((photo) => (
          <button key={photo.id} type="button" onClick={() => openPhoto(photo)}
            className="overflow-hidden rounded-xl bg-white text-left ring-1 ring-gray-200">
            {photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link from private storage
              <img src={photo.url} alt={photo.caption || 'Visit photo'} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-gray-100 text-xs text-gray-500">Unavailable</div>
            )}
            <p className="truncate px-3 py-2 text-sm text-gray-700">{photo.caption || <span className="text-gray-400">No caption</span>}</p>
          </button>
        ))}
      </div>
      {open && <PhotoViewer key={open.id} photo={open} onClose={closePhoto} />}
    </>
  )
}

function PhotoViewer({ photo, onClose }: { photo: VisitPhoto; onClose: () => void }) {
  const [caption, setCaption] = useState(photo.caption)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const saveCaption = () =>
    startTransition(async () => {
      const result = await updatePhotoCaption(photo.id, caption)
      if (result.error) setError(result.error)
      else setEditing(false)
    })

  const remove = () => {
    if (!confirm('Delete this photo?')) return
    startTransition(async () => {
      const result = await deleteVisitPhoto(photo.id)
      if (result.error) setError(result.error)
      else onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex items-center justify-end p-3">
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white hover:bg-white/10" aria-label="Close">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto px-2">
        {photo.url && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link from private storage
          <img src={photo.url} alt={caption || 'Visit photo'} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="space-y-3 bg-white p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {editing ? (
          <div className="flex gap-2">
            <input value={caption} onChange={(e) => setCaption(e.target.value)} autoFocus placeholder="What is this?"
              className="block w-full rounded-lg border-0 px-3 py-2 text-base text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
            <button type="button" onClick={saveCaption} disabled={pending}
              className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">Save</button>
          </div>
        ) : (
          <p className="text-base text-gray-900">{caption || <span className="text-gray-400">No caption</span>}</p>
        )}
        <div className="flex gap-3">
          {!editing && (
            <button type="button" onClick={() => setEditing(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gray-100 py-2.5 text-sm font-semibold text-gray-700">
              <Pencil className="h-4 w-4" /> Edit caption
            </button>
          )}
          <button type="button" onClick={remove} disabled={pending}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-50 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-60">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}
