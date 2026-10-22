'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, FileText, X } from 'lucide-react'
import { addCost } from '@/lib/actions/costs'
import { BILL_BUCKET, COST_CATEGORIES, PAID_BY, type CostCategory, type PaidBy } from '@/lib/costs'
import { resizeImage } from '@/lib/resize-image'
import { createClient } from '@/lib/supabase/client'

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'text-sm font-semibold text-gray-700'
const chip = (on: boolean) =>
  `min-h-11 rounded-full px-4 text-base font-medium ring-1 ring-inset transition-colors ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'}`
const MAX_FILE = 5 * 1024 * 1024

// A cost he paid: how much, what for, to whom and how, with a photo of the bill if he has one.
// The photo uploads when he saves, under the cost's own id, so trying again never stores it twice.
export function CostForm({ doctorId, today }: { doctorId: string; today: string }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<CostCategory>('stock')
  const [payee, setPayee] = useState('')
  const [paidBy, setPaidBy] = useState<PaidBy>('upi')
  const [spentOn, setSpentOn] = useState(today)
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const id = useRef<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function pick(chosen: File | undefined) {
    if (!chosen) return
    if (chosen.type === 'application/pdf' && chosen.size > MAX_FILE) return setError('That file is over 5 MB. A photo of the bill works too.')
    setError('')
    setFile(chosen)
    setPreview(chosen.type.startsWith('image/') ? URL.createObjectURL(chosen) : null)
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
    if (picker.current) picker.current.value = ''
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      id.current ??= crypto.randomUUID()
      let billPath: string | null = null
      if (file) {
        const blob = file.type === 'application/pdf' ? file : await resizeImage(file)
        const extension = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
        billPath = `${doctorId}/${id.current}.${extension}`
        const { error: uploadError } = await createClient().storage.from(BILL_BUCKET).upload(billPath, blob, { contentType: blob.type || 'image/jpeg' })
        // "Already exists": an earlier try uploaded it
        if (uploadError && !/exist/i.test(uploadError.message)) return setError('The bill photo didn’t upload. Try again, or remove the photo to save without it.')
      }
      const result = await addCost({ id: id.current, amount, category, spentOn, paidBy, payee, note, billPath })
      if (!result.ok) return setError(result.error)
      navigator.vibrate?.(10)
      // The screen may be kept for later: the next cost starts empty, with an id of its own
      id.current = null
      setAmount('')
      setPayee('')
      setNote('')
      clearFile()
      router.replace(`/app/costs?m=${spentOn.slice(0, 7)}`)
    })
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="cost-amount" className={labelClass}>Amount (₹)</label>
        <input id="cost-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="1200" className={inputClass} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className={labelClass}>What for</legend>
        <div className="flex flex-wrap gap-2 pt-1.5">
          {COST_CATEGORIES.map((c) => (
            <button key={c.value} type="button" aria-pressed={category === c.value} onClick={() => setCategory(c.value)} className={chip(category === c.value)}>{c.label}</button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="cost-payee" className={labelClass}>Paid to</label>
        <input id="cost-payee" value={payee} onChange={(e) => setPayee(e.target.value)} autoComplete="off" autoCapitalize="words" placeholder="Supplier, lab or shop" className={inputClass} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className={labelClass}>Paid by</legend>
        <div className="flex flex-wrap gap-2 pt-1.5">
          {PAID_BY.map((p) => (
            <button key={p.value} type="button" aria-pressed={paidBy === p.value} onClick={() => setPaidBy(p.value)} className={chip(paidBy === p.value)}>{p.label}</button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="cost-date" className={labelClass}>Paid on</label>
        <input id="cost-date" type="date" value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} className={inputClass} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cost-note" className={labelClass}>Note</label>
        <input id="cost-note" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" maxLength={300} placeholder="Optional" className={inputClass} />
      </div>

      <div className="space-y-2">
        <input ref={picker} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1} aria-label="Photo of the bill"
          onChange={(e) => pick(e.target.files?.[0])} />
        {file ? (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-gray-200">
            {preview
              // eslint-disable-next-line @next/next/no-img-element -- local preview before upload
              ? <img src={preview} alt="The bill" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              : <FileText className="h-10 w-10 shrink-0 text-gray-500" aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{preview ? 'Bill photo' : file.name}</span>
            <button type="button" onClick={clearFile} aria-label="Remove the bill photo" className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => picker.current?.click()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-base font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50">
            <Camera className="h-5 w-5" aria-hidden="true" /> Add a photo of the bill
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}

      <button type="submit" disabled={pending || !amount.trim()}
        className="min-h-14 w-full rounded-full bg-blue-600 px-5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500">
        {pending ? 'Saving…' : 'Save cost'}
      </button>
    </form>
  )
}
