'use client'

import { useEffect, useImperativeHandle, useState, type Ref } from 'react'
import QRCode from 'qrcode'
import { AlertCircle, Banknote, Check, QrCode } from 'lucide-react'
import type { ClinicUpi } from '@/lib/clinic'
import type { ShownBill } from '@/lib/offline/apply'
import { useUndo } from './UndoBar'
import { useSaves } from './Outbox'
import { parseAmount } from '@/lib/billing'
import { formatRupees } from '@/lib/pricing'
import { upiLink } from '@/lib/upi'
import { formatTimeOf } from '@/lib/schedule'
import { RemoveButton, useSaveId, type Save } from './BillTools'
import { FullScreen, useBackToClose } from './FullScreen'

// The payment, in the bill's card: payments so far, what is still due, and two big buttons.
// "Collect" links (…?step=bill) land here.
export type SavingPayment = { id: string; amount: number; method: 'cash' | 'upi' }

// What the visit's next-step bar can do from anywhere on the page: the card's own Cash received and UPI,
// for the amount the bar shows (what is due), whatever is in the box
export type PaymentHandle = { cash: (amount: number) => Promise<boolean>; upi: (amount: number) => boolean }

export function PaymentCard({
  visitId,
  patientName,
  bill,
  upi,
  save,
  onSaving,
  handle,
}: {
  visitId: string
  patientName: string
  // With any payment still waiting on the phone to be saved (pending)
  bill: ShownBill
  // Who the clinic's UPI QR pays; none, and there is no UPI button
  upi: ClinicUpi | null
  save: Save
  // Told about a payment tapped here that the page doesn't have yet, so Delete visit counts it at once
  onSaving?: (payment: SavingPayment | null) => void
  handle?: Ref<PaymentHandle>
}) {
  const { payments, summary } = bill
  // A payment just tapped shows at once, marked as saving, and comes off what is due; the server's
  // copy (same id) then takes its place. If the save fails, it goes again.
  const [saving, setSaving] = useState<SavingPayment | null>(null)
  const savingShown = saving && !payments.some((p) => p.id === saving.id) ? saving : null
  useEffect(() => onSaving?.(savingShown), [savingShown, onSaving])
  const owed = Math.round((summary.due - (savingShown?.amount ?? 0)) * 100) / 100
  // What the patient owes, all visits together (one money rule, src/lib/billing.ts): the bottom
  // line and the amount box use it, so the box never asks for more than is owed
  const due = Math.max(owed, 0)
  const paid = summary.paid + (savingShown?.amount ?? 0)
  const [amount, setAmount] = useState(due > 0 ? String(due) : '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const qr = useBackToClose()
  const saveId = useSaveId()
  const offerUndo = useUndo()
  const saves = useSaves()

  const parsed = parseAmount(amount)
  const valid = parsed !== null && parsed > 0

  // Taking a payment back: the saving row must not come back with it
  const takeBack = (paymentId: string) => {
    setSaving(null)
    return saves.removePayment(paymentId)
  }

  // The full-screen UPI QR for the amount in the box, or the one given (typed notes are sent first)
  function openQr(value: number | null = parsed): boolean {
    if (!upi) return false
    if (value === null || value <= 0) {
      setError('Please enter the amount received.')
      return false
    }
    setError(null)
    if (value !== parsed) setAmount(String(value))
    void save(async () => {})
    qr.show()
    return true
  }

  useImperativeHandle(handle, () => ({ cash: (value) => receive('cash', value), upi: (value) => openQr(value) }))

  async function receive(method: 'cash' | 'upi', value: number | null = parsed): Promise<boolean> {
    if (value === null || value <= 0) {
      setError('Please enter the amount received.')
      return false
    }
    setError(null)
    setPending(true)
    // The same amount tapped again after a lost reply keeps its id, so the money is recorded once
    // (also when he then taps the other method)
    const paymentId = saveId.idFor(String(value))
    setSaving({ id: paymentId, amount: value, method })
    navigator.vibrate?.(10)
    try {
      const result = await saves.recordPayment(visitId, value, method, paymentId)
      if (result.error) {
        setSaving(null)
        setError(result.error)
        return false
      }
      saveId.done()
      offerUndo(`${formatRupees(value)} ${method === 'upi' ? 'UPI' : 'cash'} recorded`, () => takeBack(paymentId))
      return true
    } catch {
      setSaving(null)
      setError("Couldn't reach the server. Check the internet and try again.")
      return false
    } finally {
      setPending(false)
    }
  }

  return (
    // The lower part of the bill's card (BillSection), under its total: what was paid, what is still due, how to pay
    <section id="payment" aria-label="Payment" className="scroll-mt-20">
      <div className="space-y-4 p-4">
        <div className="space-y-1 text-base">
          {payments.map((payment) => (
            <div key={payment.id} className="-my-1 flex items-center gap-2">
              <p className="min-w-0 flex-1 text-gray-700">
                Paid by {payment.method === 'upi' ? 'UPI' : 'cash'} <span className="text-sm text-gray-400">· {payment.pending ? 'waiting to save' : formatTimeOf(payment.received_at)}</span>
              </p>
              <p className="font-semibold tabular-nums text-green-700">{formatRupees(payment.amount)}</p>
              <RemoveButton label={`Remove payment ${formatRupees(payment.amount)}`}
                confirm={`Remove this payment (${formatRupees(payment.amount)})? Only do this to fix a mistake.`}
                onRemove={() => takeBack(payment.id)} />
            </div>
          ))}
          {savingShown && (
            <div className="-my-1 flex items-center gap-2" role="status">
              <p className="min-w-0 flex-1 text-gray-700">
                Paid by {savingShown.method === 'upi' ? 'UPI' : 'cash'} <span className="text-sm text-gray-400">· Saving…</span>
              </p>
              <p className="font-semibold tabular-nums text-green-700 opacity-70">{formatRupees(savingShown.amount)}</p>
              <span className="h-12 w-12 shrink-0" aria-hidden="true" />
            </div>
          )}
          {/* The patient's other visits, in one line, whichever way it goes */}
          {summary.earlier > 0 ? (
            <Row label="Due from other visits" value={formatRupees(summary.earlier)} muted />
          ) : summary.earlier < 0 ? (
            <Row label="Advance from other visits" value={formatRupees(-summary.earlier)} muted />
          ) : null}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
            {owed > 0 ? (
              <>
                <p className="font-semibold text-gray-900">Still due</p>
                <p className="hud-mono text-2xl font-bold text-[var(--hud-amber-text)]">{formatRupees(owed)}</p>
              </>
            ) : owed < 0 ? (
              <>
                <p className="font-semibold text-gray-900">Advance with us</p>
                <p className="hud-mono text-2xl font-bold text-[var(--hud-green-text)]">{formatRupees(-owed)}</p>
              </>
            ) : summary.total === 0 && paid === 0 ? (
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
            <div id="payment-actions" className={`grid gap-3 ${upi ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button type="button" onClick={() => void receive('cash')} disabled={pending || !valid}
                className="flex min-h-14 items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-2 text-[15px] font-bold text-white disabled:opacity-50">
                <Banknote className="h-5 w-5 shrink-0" /> Cash received
              </button>
              {upi && (
                <button type="button" onClick={() => openQr()}
                  disabled={pending || !valid}
                  className="flex min-h-14 items-center justify-center gap-1.5 rounded-2xl bg-white px-2 text-[15px] font-bold text-gray-900 ring-1 ring-inset ring-gray-300 disabled:opacity-50">
                  <QrCode className="h-5 w-5 shrink-0" /> UPI
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {qr.open && valid && upi && (
        <UpiScreen
          upi={upi}
          amount={parsed!}
          patientName={patientName}
          pending={pending}
          error={error}
          onReceived={() => {
            // The payment shows on the card at once; a failed save shows its error there
            qr.close()
            void receive('upi')
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
  upi,
  amount,
  patientName,
  pending,
  error,
  onReceived,
  onClose,
}: {
  upi: ClinicUpi
  amount: number
  patientName: string
  pending: boolean
  error: string | null
  onReceived: () => void
  onClose: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const link = upiLink(upi, { amount, note: `Dental ${patientName.trim().split(/\s+/)[0]}` })

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
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-lg font-bold text-white disabled:opacity-60">
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
        <p className="text-base text-gray-600">Scan with GPay, PhonePe or Paytm to pay {upi.payee}.</p>
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
