'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Trash2 } from 'lucide-react'
import { forgetPhoto, givePhotos, sharedPhotos } from '@/lib/offline/photo-store'

type Shown = { key: string; url: string }

// The photos shared to Clinic OS, and today's visits to give them to. The visit uploads them as it opens
// (PhotoGallery), as it does a photo taken with no signal; Discard deletes them from the phone.
export function SharedPhotos({ visits }: { visits: { id: string; name: string; at: string }[] }) {
  const router = useRouter()
  const [photos, setPhotos] = useState<Shown[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let shown: Shown[] = []
    void sharedPhotos().then((kept) => {
      shown = kept.map((photo) => ({ key: photo.key, url: URL.createObjectURL(photo.blob) }))
      setPhotos(shown)
    })
    return () => shown.forEach((photo) => URL.revokeObjectURL(photo.url))
  }, [])

  async function give(visitId: string) {
    if (!photos || busy) return
    setBusy(true)
    await givePhotos(photos.map((p) => p.key), visitId)
    router.push(`/app/visits/${visitId}`)
  }

  async function discard() {
    if (!photos || busy) return
    setBusy(true)
    await Promise.all(photos.map((p) => forgetPhoto(p.key)))
    router.push('/app')
  }

  if (photos === null) return <p className="text-base text-gray-500">Getting the photos…</p>
  if (photos.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-base text-gray-700">No photos waiting. Share a photo from the gallery or WhatsApp, and choose Clinic OS.</p>
        <Link href="/app" className="font-semibold text-blue-700">Go to Today</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ul aria-label="Shared photos" className="grid grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- a photo on the phone, shown before it uploads
          <li key={photo.key}><img src={photo.url} alt={`Shared photo ${i + 1}`} className="aspect-square w-full rounded-xl object-cover ring-1 ring-gray-200" /></li>
        ))}
      </ul>

      <section className="space-y-2">
        <h2 className="hud-heading">Today&apos;s visits</h2>
        {visits.length === 0 ? (
          <p className="text-base text-gray-700">No visits today yet. Open the patient and start the visit, then share the photos again.</p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
            {visits.map((visit) => (
              <li key={visit.id}>
                <button type="button" onClick={() => void give(visit.id)} disabled={busy}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-gray-900">{visit.name}</span>
                    <span className="hud-mono text-sm text-gray-500">{visit.at}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" onClick={() => void discard()} disabled={busy}
        className="flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Discard {photos.length === 1 ? 'the photo' : `the ${photos.length} photos`}
      </button>
    </div>
  )
}
