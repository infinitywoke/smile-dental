'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { VisitBill } from '@/lib/data/billing'
import { formatRupees } from '@/lib/pricing'
import { AddCharge, PaymentPanel, RemoveCharge, RemovePayment } from './BillTools'
import { Card } from './ui'

// Step 2: what to charge and what was received. Add charge and the UPI QR open on tap.
export function VisitBillStep({
  visitId,
  patientName,
  bill,
  onBack,
  onNext,
}: {
  visitId: string
  patientName: string
  bill: VisitBill
  onBack: () => void
  onNext: () => void
}) {
  const { charges, payments, summary } = bill

  return (
    <div className="space-y-5 pb-12">
      <Card className="space-y-1 p-0">
        {charges.length === 0 && <p className="p-4 text-sm text-gray-500">No charges yet. Add what was done.</p>}
        {charges.map((charge) => (
          <div key={charge.id} className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 last:border-0">
            <p className="min-w-0 flex-1 text-sm text-gray-900">{charge.description}</p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatRupees(charge.amount)}</p>
            <RemoveCharge chargeId={charge.id} label={charge.description} />
          </div>
        ))}
        <div className="flex items-center justify-between rounded-b-2xl bg-gray-50 px-4 py-3">
          <p className="font-semibold text-gray-900">Total</p>
          <p className="text-lg font-bold tabular-nums text-gray-900">{formatRupees(summary.total)}</p>
        </div>
      </Card>

      <AddCharge visitId={visitId} />

      {(payments.length > 0 || charges.length > 0) && (
        <Card className="space-y-2 text-sm">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-gray-700">
                Paid by {payment.method === 'upi' ? 'UPI' : 'cash'}
                <span className="text-gray-400">
                  {' · '}
                  {new Date(payment.received_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                </span>
              </p>
              <p className="font-semibold tabular-nums text-green-700">{formatRupees(payment.amount)}</p>
              <RemovePayment paymentId={payment.id} label={formatRupees(payment.amount)} />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
            <p className="font-semibold text-gray-900">{summary.balance < 0 ? 'Advance with us' : 'Balance this visit'}</p>
            <p className={`text-lg font-bold tabular-nums ${summary.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {formatRupees(Math.abs(summary.balance))}
            </p>
          </div>
          {summary.earlier !== 0 && (
            <>
              <div className="flex items-center justify-between text-gray-600">
                <p>{summary.earlier > 0 ? 'Earlier balance' : 'Earlier advance'}</p>
                <p className="tabular-nums">{formatRupees(Math.abs(summary.earlier))}</p>
              </div>
              <div className="flex items-center justify-between font-semibold text-gray-900">
                <p>{summary.due >= 0 ? 'Total due' : 'Advance in total'}</p>
                <p className="tabular-nums">{formatRupees(Math.abs(summary.due))}</p>
              </div>
            </>
          )}
        </Card>
      )}

      <PaymentPanel
        key={`${payments.length}-${summary.balance}`}
        visitId={visitId}
        suggested={Math.max(summary.balance, 0)}
        patientName={patientName}
      />

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-4 py-3 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Notes
        </button>
        <button type="button" onClick={onNext}
          className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700">
          Next: Send <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
