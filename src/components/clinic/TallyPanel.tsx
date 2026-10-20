'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Download, Loader2 } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { saveTallySettings } from '@/lib/actions/tally'
import type { TallyOverview, TallySettings } from '@/lib/data/tally'
import { formatDate } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { inIndia } from '@/lib/schedule'

const when = (iso: string) =>
  `${formatDate(inIndia(iso).date)}, ${new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`
const monthName = (month: string) => formatDate(`${month}-01`, { month: 'long', year: 'numeric' })
const input = 'block min-h-12 w-full rounded-xl border-0 px-3 text-base text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600'
const button = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold disabled:opacity-60'

// Send to Tally: his ledger names once, then a file Tally imports in one step (Tally.ERP 9: Import of
// Data → Vouchers; TallyPrime: Import → Transactions).
// "New payments" holds only what no earlier file had, so nothing is imported twice.
export function TallyPanel({ settings, overview }: { settings: TallySettings | null; overview: TallyOverview }) {
  const router = useRouter()
  const [editing, setEditing] = useState(!settings)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [from, setFrom] = useState(overview.firstDay ?? '')
  const [month, setMonth] = useState(overview.months[0] ?? '')

  async function save(formData: FormData) {
    setSaving(true)
    setError(null)
    const result = await saveTallySettings(formData)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditing(false)
    router.refresh()
  }

  async function download(batch: 'new' | 'again' | 'month') {
    setBusy(batch)
    setError(null)
    setDone(null)
    const body = new FormData()
    body.set('batch', batch)
    if (batch === 'new' && !settings?.sent_until && from) body.set('from', from)
    if (batch === 'month') body.set('month', month)
    try {
      const response = await fetch('/app/tally/file', { method: 'POST', body })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Could not make the file. Please try again.')
        return
      }
      const blob = await response.blob()
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Tally.xml'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      const count = Number(response.headers.get('X-Tally-Count') ?? 0)
      setDone(`Downloaded ${count} payment${count === 1 ? '' : 's'}: ${formatRupees(Number(response.headers.get('X-Tally-Cash') ?? 0))} cash, ${formatRupees(Number(response.headers.get('X-Tally-Upi') ?? 0))} UPI. After importing, check that Tally shows the same totals.`)
      router.refresh()
    } catch {
      setError("Couldn't reach the server. Check the internet and try again.")
    } finally {
      setBusy(null)
    }
  }

  const fresh = overview.fresh
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Send to Tally</h1>
        <p className="mt-1 text-base text-gray-600">
          A file Tally imports in one step, so payments are not typed twice. Download it on the computer with Tally (open Clinic OS there), then in Tally.ERP 9: Gateway of Tally → Import of Data → Vouchers, and give the file&apos;s location (usually the Downloads folder).
        </p>
      </div>

      {editing ? (
        <form action={save} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200" aria-label="Tally ledger names">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Your Tally ledger names</h2>
            <p className="text-sm text-gray-600">Type them exactly as they are in Tally, or Tally will refuse the file.</p>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-gray-700">Cash ledger</span>
            <input name="cash" defaultValue={settings?.cash_ledger ?? (siteConfig.tally.cashLedger || 'Cash')} className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-gray-700">Bank ledger (where UPI payments arrive)</span>
            <input name="bank" defaultValue={settings?.bank_ledger ?? siteConfig.tally.bankLedger} placeholder="For example: Bank of Baroda" className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-gray-700">Income ledger (treatment fees)</span>
            <input name="income" defaultValue={settings?.income_ledger ?? siteConfig.tally.incomeLedger} placeholder="For example: Professional Fees" className={input} />
            <span className="block text-xs text-gray-500">The ledger inside Direct Incomes that fees go to, not Direct Incomes itself (that is a group).</span>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-gray-700">Entries in Tally</legend>
            {([['payment', 'One for each payment (with the patient\'s name)'], ['day', 'One per day for cash, one for UPI']] as const).map(([value, text]) => (
              <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl px-3 ring-1 ring-gray-200">
                <input type="radio" name="entries" value={value} defaultChecked={(settings?.entries ?? 'payment') === value} className="h-5 w-5" />
                <span className="text-base text-gray-900">{text}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={saving} className={`${button} bg-blue-600 text-white`}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Save
          </button>
        </form>
      ) : settings && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
          <span>Ledgers: {settings.cash_ledger} · {settings.bank_ledger} · {settings.income_ledger} ({settings.entries === 'day' ? 'one per day' : 'each payment'})</span>
          <button type="button" onClick={() => setEditing(true)} className="min-h-12 font-semibold text-blue-700">Change</button>
        </p>
      )}

      {editing && error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

      {settings && !editing && (
        <>
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200" aria-label="New payments">
            <h2 className="text-lg font-bold text-gray-900">New payments</h2>
            {fresh.count === 0 ? (
              <p className="text-base text-gray-600">Nothing new{fresh.since ? ` since your last file (${when(fresh.since)})` : ' yet'}.</p>
            ) : (
              <>
                <p className="text-base text-gray-900">
                  {fresh.count} payment{fresh.count === 1 ? '' : 's'}: {formatRupees(fresh.cash)} cash, {formatRupees(fresh.upi)} UPI
                  <span className="block text-sm text-gray-500">{fresh.since ? `Since your last file, ${when(fresh.since)}` : 'Not sent to Tally before'}</span>
                </p>
                {!fresh.since && overview.firstDay && (
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold text-gray-700">Start from</span>
                    <input type="date" value={from} min={overview.firstDay} onChange={(e) => setFrom(e.target.value)} className={input} />
                    <span className="block text-xs text-gray-500">Leave out days you have already typed into Tally.</span>
                  </label>
                )}
                <button type="button" onClick={() => void download('new')} disabled={!!busy} className={`${button} bg-green-600 text-white`}>
                  {busy === 'new' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Download for Tally
                </button>
              </>
            )}
            {settings.sent_from && settings.sent_until && (
              <p className="flex flex-wrap items-center gap-x-2 border-t border-gray-100 pt-2 text-sm text-gray-600">
                <span>Last file: payments recorded up to {when(settings.sent_until)}</span>
                <button type="button" onClick={() => void download('again')} disabled={!!busy} className="min-h-12 font-semibold text-blue-700">Download again</button>
              </p>
            )}
          </section>

          {done && <p role="status" className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800 ring-1 ring-green-200"><Check className="mt-0.5 h-4 w-4 shrink-0" /> {done}</p>}
          {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

          {overview.months.length > 0 && (
            <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200" aria-label="A whole month">
              <h2 className="text-lg font-bold text-gray-900">A whole month</h2>
              <p className="text-sm text-gray-600">Every payment in a month, for your accountant. It doesn&apos;t change what counts as new.</p>
              <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" className={input}>
                {overview.months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
              </select>
              <button type="button" onClick={() => void download('month')} disabled={!!busy} className={`${button} bg-white text-green-700 ring-1 ring-green-600`}>
                {busy === 'month' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Download month
              </button>
            </section>
          )}
        </>
      )}

    </div>
  )
}
