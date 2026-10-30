'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { drawPrescription, type Letterhead, type PrescriptionSheet } from '@/lib/prescription-image'

// The typed prescription on a visit link's page (src/app/r/[token]/page.tsx): drawn here, in the
// patient's browser, from what the link keeps, on the same letterhead the dentist previews, with Save.
// The letterhead is the link's clinic and dentist (what shared_photos tells the page).
export function SharedPrescription({ sheet, letterhead, alt, fileName, saveLabel }: { sheet: PrescriptionSheet; letterhead: Letterhead; alt: string; fileName: string; saveLabel: string }) {
  const key = JSON.stringify([sheet, letterhead])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let made: string | null = null
    let stale = false
    const [sheetNow, letterheadNow] = JSON.parse(key) as [PrescriptionSheet, Letterhead]
    drawPrescription(sheetNow, letterheadNow)
      .then((blob) => {
        if (stale) return
        made = URL.createObjectURL(blob)
        setUrl(made)
      })
      .catch(() => {})
    return () => {
      stale = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [key])

  if (!url) return <div aria-hidden="true" className="aspect-[1080/1528] w-full animate-pulse rounded-xl bg-gray-100" />
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn in the browser */}
      <img src={url} alt={alt} className="w-full rounded-xl ring-1 ring-gray-200" />
      <a href={url} download={fileName}
        className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
        <Download className="h-5 w-5" aria-hidden="true" /> {saveLabel}
      </a>
    </>
  )
}
