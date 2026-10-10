import { Suspense } from 'react'
import { MessageCircle } from 'lucide-react'
import { getVisitBill } from '@/lib/data/billing'
import { billMessage } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { whatsappLink } from '@/lib/whatsapp'
import { BackLink, Card, ScreenLoading, TestBadge } from '@/components/clinic/ui'
import { AddCharge, PaymentPanel, RemoveCharge, RemovePayment } from '@/components/clinic/BillTools'

async function BillPageContent({ params }: PageProps<'/app/visits/[id]/bill'>) {
  const { id } = await params
  const bill = await getVisitBill(id)
  const { summary, patient, charges, payments } = bill

  const message = billMessage({
    patientName: patient.name,
    visitDate: bill.visit.visit_date,
    lines: charges,
    payments,
    summary,
  })
  const hasBill = charges.length > 0

  return (
    <div className="space-y-5">
      <BackLink href={`/app/visits/${bill.visit.id}`} label="Visit" />

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
          <span className="truncate">{patient.name}</span>
          {patient.is_test && <TestBadge />}
        </h1>
        <p className="mt-1 text-sm text-gray-500">Bill for {formatDate(bill.visit.visit_date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* The bill */}
      <Card className="space-y-1 p-0">
        {charges.length === 0 && <p className="p-4 text-sm text-gray-500">No charges yet. Add what was done below.</p>}
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

      <AddCharge visitId={bill.visit.id} />

      {/* Payment so far and balance */}
      {(payments.length > 0 || hasBill) && (
        <Card className="space-y-2 text-sm">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-gray-700">
                Paid by {payment.method === 'upi' ? 'UPI' : 'cash'}
                <span className="text-gray-400">
                  {' · '}{new Date(payment.received_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                </span>
              </p>
              <p className="font-semibold tabular-nums text-green-700">{formatRupees(payment.amount)}</p>
              <RemovePayment paymentId={payment.id} label={formatRupees(payment.amount)} />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2">
            <p className="font-semibold text-gray-900">
              {summary.balance < 0 ? 'Advance with us' : 'Balance this visit'}
            </p>
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
        visitId={bill.visit.id}
        suggested={Math.max(summary.balance, 0)}
        patientName={patient.name}
      />

      {hasBill && patient.phone && (
        <a href={whatsappLink(patient.phone, message)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white shadow-sm hover:bg-green-700">
          <MessageCircle className="h-6 w-6" /> Send bill on WhatsApp
        </a>
      )}
      {hasBill && !patient.phone && (
        <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-900 ring-1 ring-amber-200">
          Add the patient&apos;s WhatsApp number to send the bill.
        </p>
      )}
    </div>
  )
}

export default function BillPage(props: PageProps<'/app/visits/[id]/bill'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <BillPageContent {...props} />
    </Suspense>
  )
}
