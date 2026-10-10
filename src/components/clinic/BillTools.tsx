'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import QRCode from 'qrcode'
import { AlertCircle, Banknote, Check, QrCode, Search, Smartphone, Trash2 } from 'lucide-react'
import { addCharge, recordPayment, removeCharge, removePayment } from '@/lib/actions/billing'
import { formatPrice, formatRupees, priceListOptions, type PriceListOption } from '@/lib/pricing'
import { parseAmount } from '@/lib/billing'
import { upiLink } from '@/lib/upi'

const inputClass =
  'block w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  )
}

// Adds a charge: pick from the clinic's price list (fills the fields in) or type any other charge
export function AddCharge({ visitId }: { visitId: string }) {
  const [query, setQuery] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const [hint, setHint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const options = useMemo(() => priceListOptions(), [])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return options
      .filter((o) => `${o.treatment} ${o.detail}`.toLowerCase().includes(q))
      .slice(0, 6)
  }, [options, query])

  function pick(option: PriceListOption) {
    setDescription(option.detail ? `${option.treatment} - ${option.detail}` : option.treatment)
    setSlug(option.slug)
    const { price } = option
    if (price.kind === 'fixed') {
      setAmount(String(price.amount))
      setHint('')
    } else if (price.kind === 'formula') {
      setAmount(String(price.base))
      setHint(`Price list: ${formatPrice(price)}. Adjust for the number of teeth.`)
    } else if (price.kind === 'range') {
      setAmount('')
      setHint(`Price list: ${formatPrice(price)}. Enter the amount agreed.`)
    } else {
      setAmount('')
      setHint(`Price list: ${price.text}`)
    }
    setQuery('')
  }

  function add() {
    const parsed = parseAmount(amount)
    if (parsed === null) {
      setError('Please enter the amount.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await addCharge(visitId, { description, amount: parsed, treatmentSlug: slug })
      if (result.error) {
        setError(result.error)
        return
      }
      setDescription('')
      setAmount('')
      setSlug(null)
      setHint('')
    })
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <p className="font-semibold text-gray-900">Add a charge</p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the price list (scaling, RCT, filling…)"
          className={`${inputClass} pl-11`} aria-label="Search the price list" />
      </div>
      {matches.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl ring-1 ring-gray-200">
          {matches.map((option) => (
            <li key={`${option.slug}-${option.detail}`}>
              <button type="button" onClick={() => pick(option)} className="flex w-full items-center gap-3 bg-white px-3 py-2.5 text-left text-sm hover:bg-blue-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-gray-900">{option.treatment}</span>
                  {option.detail && <span className="block truncate text-xs text-gray-500">{option.detail}</span>}
                </span>
                <span className="shrink-0 text-xs font-semibold text-blue-700">{formatPrice(option.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <label htmlFor="charge-description" className="text-sm font-semibold text-gray-700">What for</label>
        <input id="charge-description" value={description} onChange={(e) => { setDescription(e.target.value); setSlug(null) }}
          placeholder="Scaling, lab charge, medicines…" autoComplete="off" className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="charge-amount" className="text-sm font-semibold text-gray-700">Amount (₹)</label>
        <input id="charge-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="1200" autoComplete="off" className={inputClass} />
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>

      <ErrorLine message={error} />
      <button type="button" onClick={add} disabled={pending || !description.trim() || !amount.trim()}
        className="w-full rounded-full bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
        {pending ? 'Adding…' : 'Add to bill'}
      </button>
    </div>
  )
}

export function RemoveCharge({ chargeId, label }: { chargeId: string; label: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button type="button" disabled={pending} aria-label={`Remove ${label}`}
      onClick={() => {
        if (!window.confirm(`Remove "${label}" from the bill?`)) return
        startTransition(async () => {
          await removeCharge(chargeId)
        })
      }}
      className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

export function RemovePayment({ paymentId, label }: { paymentId: string; label: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button type="button" disabled={pending} aria-label={`Remove payment ${label}`}
      onClick={() => {
        if (!window.confirm(`Remove this payment (${label})? Only do this to fix a mistake.`)) return
        startTransition(async () => {
          await removePayment(paymentId)
        })
      }}
      className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

// Collect money: the amount, a UPI QR for it, and two buttons to confirm what arrived
export function PaymentPanel({ visitId, suggested, patientName }: { visitId: string; suggested: number; patientName: string }) {
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : '')
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const parsed = parseAmount(amount)
  const link = parsed && parsed > 0 ? upiLink({ amount: parsed, note: `Dental ${patientName.split(' ')[0]}` }) : null

  useEffect(() => {
    let cancelled = false
    if (!link) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQr(null)
      return
    }
    QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setQr(url) })
      .catch(() => { if (!cancelled) setQr(null) })
    return () => { cancelled = true }
  }, [link])

  function receive(method: 'upi' | 'cash') {
    if (!parsed || parsed <= 0) {
      setError('Please enter the amount received.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await recordPayment(visitId, parsed, method)
      if (result.error) setError(result.error)
      else setAmount('')
    })
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <p className="font-semibold text-gray-900">Collect payment</p>

      <div className="space-y-1.5">
        <label htmlFor="payment-amount" className="text-sm font-semibold text-gray-700">Amount (₹)</label>
        <input id="payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0" autoComplete="off" className={`${inputClass} text-xl font-semibold`} />
      </div>

      {qr && link ? (
        <div className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`UPI QR for ${formatRupees(parsed!)}`} width={220} height={220}
            className="mx-auto rounded-xl ring-1 ring-gray-200" />
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
            <QrCode className="h-4 w-4" /> Scan with GPay, PhonePe or Paytm: {formatRupees(parsed!)} to Smile Dental Clinic
          </p>
          <a href={link} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700">
            <Smartphone className="h-4 w-4" /> Open in a UPI app on this phone
          </a>
        </div>
      ) : (
        <p className="rounded-xl bg-gray-50 p-3 text-center text-sm text-gray-500">Enter the amount to show the UPI QR.</p>
      )}

      <ErrorLine message={error} />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => receive('upi')} disabled={pending || !parsed}
          className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-3 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50">
          <Check className="h-5 w-5" /> Received (UPI)
        </button>
        <button type="button" onClick={() => receive('cash')} disabled={pending || !parsed}
          className="flex items-center justify-center gap-2 rounded-2xl bg-gray-900 px-3 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50">
          <Banknote className="h-5 w-5" /> Collected cash
        </button>
      </div>
      <p className="text-xs text-gray-500">Tap <b>Received (UPI)</b> only after the payment shows in your bank or UPI app.</p>
    </div>
  )
}
