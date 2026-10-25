'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2, Upload } from 'lucide-react'
import { matchTallyLedgers, saveTallyLedgers, type LedgerQuestion } from '@/lib/actions/tally'
import { decodeTallyFile, PATIENT_GROUP, readLedgers } from '@/lib/tally-ledgers'

const select = 'block min-h-12 w-full rounded-xl border-0 px-3 text-base text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600'
const button = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold disabled:opacity-60'

// Patient ledgers: each payment goes to the patient's own ledger under Direct Incomes, as in his books.
// His List of Accounts, uploaded once, matches patients to the ledgers Tally already has (read here: only
// the ledger names go to the server); a patient with none gets one made by Clinic OS in the next file.
export function TallyLedgers({ matched, unmatched }: { matched: number; unmatched: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'read' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [questions, setQuestions] = useState<LedgerQuestion[] | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})

  async function read(file: File) {
    setBusy('read')
    setError(null)
    setDone(null)
    setQuestions(null)
    try {
      const all = readLedgers(decodeTallyFile(new Uint8Array(await file.arrayBuffer())))
      const names = all.filter((l) => l.group.toLowerCase() === PATIENT_GROUP.toLowerCase()).map((l) => l.name)
      if (names.length === 0) {
        setError(all.length === 0
          ? "That isn't Tally's List of Accounts. In Tally: Display → List of Accounts, then Alt+E (Export) as XML."
          : `No ledgers under ${PATIENT_GROUP} in that file.`)
        return
      }
      const result = await matchTallyLedgers(names)
      if (result.error) {
        setError(result.error)
        return
      }
      const found = result.questions ?? []
      setQuestions(found)
      setChosen(Object.fromEntries(found.filter((q) => q.sure).map((q) => [q.patientId, q.options[0]])))
      const parts = [`Read ${names.length} patient ledgers.`]
      if (result.matchedNow) parts.push(`${result.matchedNow} made by Clinic OS ${result.matchedNow === 1 ? 'is' : 'are'} now in Tally.`)
      if (result.noLedger) parts.push(`${result.noLedger} patient${result.noLedger === 1 ? ' has' : 's have'} no ledger yet: Clinic OS makes ${result.noLedger === 1 ? 'it' : 'them'} in the next file.`)
      if (found.length === 0) parts.push('Nothing to check.')
      setDone(parts.join(' '))
      router.refresh()
    } catch {
      setError("Couldn't read that file. Check the internet and try again.")
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    setError(null)
    const result = await saveTallyLedgers(Object.entries(chosen).filter(([, ledger]) => ledger).map(([patientId, ledger]) => ({ patientId, ledger })))
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setQuestions(null)
    setDone(`Saved ${result.saved} ledger${result.saved === 1 ? '' : 's'}.`)
    router.refresh()
  }

  const picked = Object.values(chosen).filter(Boolean).length
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200" aria-label="Patient ledgers">
      <h2 className="text-lg font-bold text-gray-900">Patient ledgers</h2>
      <p className="text-sm text-gray-600">
        Each payment goes to the patient&apos;s own ledger under {PATIENT_GROUP}, as in your books. {matched} patient{matched === 1 ? '' : 's'} matched to a ledger in Tally
        {unmatched > 0 ? `; ${unmatched} not yet (Clinic OS makes theirs, named like "Asha Rao 40 Katapadi", in the file that first needs it).` : '.'}
      </p>
      <label className={`${button} cursor-pointer bg-white text-gray-900 ring-1 ring-gray-300 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        {busy === 'read' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />} Match from your List of Accounts
        <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f) }} />
      </label>
      <p className="text-xs text-gray-500">In Tally: Display → List of Accounts, then Alt+E (Export) as XML. Only the ledger names are read.</p>

      {done && <p role="status" className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800 ring-1 ring-green-200"><Check className="mt-0.5 h-4 w-4 shrink-0" /> {done}</p>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}

      {questions && questions.length > 0 && (
        <div className="space-y-3 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-600">Check each one. A sure match is chosen already; leave &ldquo;None of these&rdquo; and Clinic OS makes a new ledger.</p>
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.patientId}>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {q.name}{q.age !== null ? `, ${q.age}` : ''}{q.address ? ` · ${q.address}` : ''}
                    {!q.sure && <span className="font-normal text-gray-500"> (check)</span>}
                  </span>
                  <select value={chosen[q.patientId] ?? ''} onChange={(e) => setChosen((c) => ({ ...c, [q.patientId]: e.target.value }))} className={select}>
                    <option value="">None of these</option>
                    {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void save()} disabled={!!busy || picked === 0} className={`${button} bg-blue-600 text-white`}>
            {busy === 'save' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Save {picked} ledger{picked === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </section>
  )
}
