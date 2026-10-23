'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Eye, FileText, Plus, X } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { addPrescriptionLine, adviceText, prescriptionLines, removePrescriptionLine } from '@/lib/prescription'
import { drawPrescription } from '@/lib/prescription-image'
import { firstName } from '@/lib/whatsapp'
import { useUndo } from './UndoBar'

// The typed prescription: its medicines are the "Prescription:" lines of the notes (the smart notes
// write them there; the quick buttons add more), so editing a dose is editing the note. It goes with
// the WhatsApp message, in its short link, drawn on the clinic's letterhead (the same picture as the
// preview here); Download keeps a copy, to print.
export function PrescriptionCard({
  notes,
  edit,
  patientName,
  visitDate,
  medicines,
}: {
  notes: string
  edit: (change: (text: string) => string) => void
  patientName: string
  visitDate: string
  // One-tap medicines: his most used, then a starter list
  medicines: string[]
}) {
  const offerUndo = useUndo()
  const lines = prescriptionLines(notes)
  const advice = adviceText(notes)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState(false)
  const date = formatDate(visitDate)

  // The picture is drawn ahead, for the preview and the download
  const key = JSON.stringify([lines, advice, patientName, date])
  const [image, setImage] = useState<{ key: string; blob: Blob } | null>(null)
  useEffect(() => {
    const [medicinesNow, adviceNow] = JSON.parse(key) as [string[], string]
    if (medicinesNow.length === 0) return
    let stale = false
    drawPrescription({ firstName: firstName(patientName), date, medicines: medicinesNow, advice: adviceNow })
      .then((blob) => {
        if (!stale) setImage({ key, blob })
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [key, patientName, date])
  const blob = image?.key === key ? image.blob : null
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  const fileName = `Prescription-${date.replace(/\s+/g, '-')}.jpg`

  function add(medicine: string) {
    edit((text) => addPrescriptionLine(text, medicine))
  }

  function remove(index: number) {
    const line = lines[index]
    edit((text) => removePrescriptionLine(text, index))
    offerUndo(`Removed ${line.split(' - ')[0]}`, async () => {
      edit((text) => addPrescriptionLine(text, line))
      return {}
    })
  }

  const quick = medicines.filter((m) => !lines.some((l) => l.trim().toLowerCase() === m.trim().toLowerCase()))
  const showAdd = open || lines.length === 0

  if (lines.length === 0 && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-white px-4 text-left text-base font-semibold text-gray-900 ring-1 ring-gray-200 hover:bg-gray-50">
        <FileText className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <span className="flex-1">Write prescription</span>
        <Plus className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
      </button>
    )
  }

  return (
    <section className="space-y-3" aria-label="Prescription">
      <h2 className="hud-heading">Prescription</h2>

      {lines.length > 0 && (
        <ol className="space-y-2">
          {lines.map((line, i) => (
            <li key={`${i}-${line}`} className="flex items-start gap-2 rounded-xl bg-white py-2 pr-1 pl-3 ring-1 ring-gray-200">
              <span className="pt-2.5 text-sm font-bold text-gray-500">{i + 1}.</span>
              <span className="min-w-0 flex-1 py-2 text-base text-gray-900">{line}</span>
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${line}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {showAdd ? (
        <div className="space-y-2 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
          {quick.map((m) => (
            <button key={m} type="button" onClick={() => add(m)}
              className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm text-gray-900 ring-1 ring-gray-200 hover:ring-blue-400">
              <Plus className="h-4 w-4 shrink-0 text-blue-700" /> {m}
            </button>
          ))}
          <form className="flex gap-2" onSubmit={(e) => {
            e.preventDefault()
            if (!typed.trim()) return
            add(typed)
            setTyped('')
          }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a medicine - how often - how long"
              aria-label="Type a medicine"
              className="block min-h-12 min-w-0 flex-1 rounded-xl border-0 px-3 text-base ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600" />
            <button type="submit" className="min-h-12 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white">Add</button>
          </form>
          <p className="text-xs text-gray-500">Change a dose in the notes above. Advice in the notes is printed too.</p>
          {lines.length > 0 && (
            <button type="button" onClick={() => setOpen(false)} className="min-h-12 w-full text-sm font-semibold text-gray-600">Done adding</button>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="flex min-h-12 items-center gap-1.5 text-base font-semibold text-blue-700">
          <Plus className="h-5 w-5" /> Add medicine
        </button>
      )}

      {lines.length > 0 && (
        <div className="space-y-2">
          {preview && url && (
            // eslint-disable-next-line @next/next/no-img-element -- a picture drawn on the phone
            <img src={url} alt="Prescription preview" className="w-full rounded-xl ring-1 ring-gray-200" />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPreview((p) => !p)} disabled={!url}
              className="flex min-h-14 items-center justify-center gap-1.5 rounded-2xl bg-white px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300 disabled:opacity-60">
              <Eye className="h-5 w-5" /> {preview ? 'Hide' : 'Preview'}
            </button>
            <a href={url ?? undefined} download={fileName} aria-disabled={!url}
              className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300 aria-disabled:opacity-60">
              <Download className="h-5 w-5 text-gray-500" /> Download prescription
            </a>
          </div>
          <p className="text-center text-sm text-gray-600">It goes with the WhatsApp message, in its link.</p>
        </div>
      )}
    </section>
  )
}
