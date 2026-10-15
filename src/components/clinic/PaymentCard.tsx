'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { AlertCircle, Banknote, Check, QrCode } from 'lucide-react'
import type { VisitBill } from '@/lib/data/billing'
import { recordPayment, removePayment } from '@/lib/actions/billing'
import { useUndo } from './UndoBar'
import { parseAmount } from '@/lib/billing'
import { formatRupees } from '@/lib/pricing'
import { upiLink } from '@/lib/upi'
import { RemoveButton, useSaveId, type Save } from './BillTools'
import { FullScreen, useBackToClose } from './FullScreen'

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

// One card for the money: total, payments so far, what is still due, and two big buttons.
// "Collect" links (…?step=bill) land here.
export function PaymentCard({
  visitId,
  patientName,
  bill,
  save,
}: {
  visitId: string
  patientName: string
  bill: VisitBill
  save: Save
}) {
  const { charges, payments, summary } = bill
  // What the patient owes, all visits together (one money rule, src/lib/billing.ts): the bottom
  // line and the amount box use it, so the box never asks for more than is owed
  const due = Math.max(summary.due, 0)
  const hasBill = charges.length > 0 || payments.length > 0
  const [amount, setAmount] = useState(due > 0 ? String(due) : '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const qr = useBackToClose()
  const saveId = useSaveId()
  const offerUndo = useUndo()

  const parsed = parseAmount(amount)
  const valid = parsed !== null && parsed > 0

  async function receive(method: 'cash' | 'upi'): Promise<boolean> {
    if (!valid) {
      setError('Please enter the amount received.')
      return false
    }
    setError(null)
    setPending(true)
    // The same amount tapped again after a lost reply keeps its id, so the money is recorded once
    // (also when he then taps the other method)
    const paymentId = saveId.idFor(String(parsed))
    try {
      const result = await save(() => recordPayment(visitId, parsed!, method, paymentId))
      if (result.error) {
        setError(result.error)
        return false
      }
      saveId.done()
      offerUndo(`${formatRupees(parsed!)} ${method === 'upi' ? 'UPI' : 'cash'} recorded`, () => save(() => removePayment(paymentId)))
      return true
    } catch {
      setError("Couldn't reach the server. Check the internet and try again.")
      return false
    } finally {
      setPending(false)
    }
  }

  return (
    <section id="payment" className="scroll-mt-20 space-y-3">
      <h2 className="text-lg font-bold text-gray-900">Payment</h2>
      <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div className="space-y-1 text-base">
          {hasBill && <Row label="Total" value={formatRupees(summary.total)} />}
          {payments.map((payment) => (
            <div key={payment.id} className="-my-1 flex items-center gap-2">
              <p className="min-w-0 flex-1 text-gray-700">
                Paid by {payment.method === 'upi' ? 'UPI' : 'cash'} <span className="text-sm text-gray-400">· {time(payment.received_at)}</span>
              </p>
              <p className="font-semibold tabular-nums text-green-700">{formatRupees(payment.amount)}</p>
              <RemoveButton label={`Remove payment ${formatRupees(payment.amount)}`}
                confirm={`Remove this payment (${formatRupees(payment.amount)})? Only do this to fix a mistake.`}
                onRemove={() => save(() => removePayment(payment.id))} />
            </div>
          ))}
          {/* The patient's other visits, in one line, whichever way it goes */}
          {summary.earlier > 0 ? (
            <Row label="Due from other visits" value={formatRupees(summary.earlier)} muted />
          ) : summary.earlier < 0 ? (
            <Row label="Advance from other visits" value={formatRupees(-summary.earlier)} muted />
          ) : null}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
            {summary.due > 0 ? (
              <>
                <p className="font-semibold text-gray-900">Still due</p>
                <p className="text-xl font-bold tabular-nums text-red-700">{formatRupees(summary.due)}</p>
              </>
            ) : summary.due < 0 ? (
              <>
                <p className="font-semibold text-gray-900">Advance with us</p>
                <p className="text-xl font-bold tabular-nums text-green-700">{formatRupees(-summary.due)}</p>
              </>
            ) : summary.total === 0 && summary.paid === 0 ? (
              <p className="text-lg font-bold text-gray-700">No charge</p>
            ) : (
              <p className="flex items-center gap-1.5 text-lg font-bold text-green-700"><Check className="h-5 w-5" /> Paid in full</p>
            )}
          </div>
        </div>

        {due > 0 && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="payment-amount" className="text-sm font-semibold text-gray-700">Amount (₹)</label>
              <input id="payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off"
                className="block w-full rounded-xl border-0 px-4 py-3 text-xl font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
            </div>
            {error && !qr.open && <ErrorLine message={error} />}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => void receive('cash')} disabled={pending || !valid}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-gray-900 px-3 text-base font-semibold text-white disabled:opacity-50">
                <Banknote className="h-5 w-5" /> Cash received
              </button>
              <button type="button"
                onClick={() => {
                  setError(null)
                  void save(async () => {})
                  qr.show()
                }}
                disabled={pending || !valid}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-green-600 px-3 text-base font-semibold text-white disabled:opacity-50">
                <QrCode className="h-5 w-5" /> UPI
              </button>
            </div>
          </>
        )}
      </div>

      {qr.open && valid && (
        <UpiScreen
          amount={parsed!}
          patientName={patientName}
          pending={pending}
          error={error}
          onReceived={async () => {
            if (await receive('upi')) qr.close()
          }}
          onClose={qr.close}
        />
      )}
    </section>
  )
}

// The QR fills the screen so the patient can scan it; the doctor taps "Payment received" once
// the money shows in his bank or UPI app.
function UpiScreen({
  amount,
  patientName,
  pending,
  error,
  onReceived,
  onClose,
}: {
  amount: number
  patientName: string
  pending: boolean
  error: string | null
  onReceived: () => void
  onClose: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const link = upiLink({ amount, note: `Dental ${patientName.trim().split(/\s+/)[0]}` })

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(link, { margin: 1, width: 720, errorCorrectionLevel: 'M' })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(null))
    return () => {
      cancelled = true
    }
  }, [link])

  return (
    <FullScreen
      title={`UPI ${formatRupees(amount)}`}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <ErrorLine message={error} />}
          <button type="button" onClick={onReceived} disabled={pending}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 text-lg font-semibold text-white disabled:opacity-60">
            <Check className="h-6 w-6" /> {pending ? 'Saving…' : 'Payment received'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 px-6 py-6 text-center">
        <p className="text-4xl font-bold tabular-nums text-gray-900">{formatRupees(amount)}</p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated on the phone
          <img src={qr} alt={`UPI QR for ${formatRupees(amount)}`} className="aspect-square w-full max-w-sm" />
        ) : (
          <div className="aspect-square w-full max-w-sm rounded-xl bg-gray-100" />
        )}
        <p className="text-base text-gray-600">Scan with GPay, PhonePe or Paytm to pay Smile Dental Clinic.</p>
      </div>
    </FullScreen>
  )
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-gray-600' : ''}`}>
      <p>{label}</p>
      <p className="tabular-nums">{value}</p>
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </p>
  )
}
