import { describe, expect, it } from 'vitest'
import { decodeTallyFile, ledgerParts, matchLedgers, newLedgerName, readLedgers, type LedgerPatient } from './tally-ledgers'

// Invented names only: the real List of Accounts holds his patients
const list = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <GROUP NAME="Patient Details" RESERVEDNAME="">
  <PARENT>Capital Account</PARENT>
 </GROUP>
</TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <LEDGER NAME="Asha40Katapadi" RESERVEDNAME="">
  <CURRENCYNAME>Rs.</CURRENCYNAME>
  <PARENT>Direct Incomes</PARENT>
 </LEDGER>
</TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <LEDGER NAME="Cash" RESERVEDNAME="">
  <PARENT>Cash-in-hand</PARENT>
 </LEDGER>
</TALLYMESSAGE>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
 <LEDGER NAME="Rao &amp; Sons 8 Udupi" RESERVEDNAME="">
  <ADDITIONALNAME.LIST>
    <ADDITIONALNAME>Rao &amp; Sons 8 Udupi</ADDITIONALNAME>
  </ADDITIONALNAME.LIST>
  <PARENT>Direct Incomes</PARENT>
 </LEDGER>
</TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`

const today = '2026-10-25'
const patient = (id: string, name: string, age: number | null, address: string | null): LedgerPatient =>
  ({ id, name, birth_year: age === null ? null : 2026 - age, birth_date: null, address })

describe('patient ledgers', () => {
  it("reads Tally's UTF-16 export (and UTF-8) with each ledger's group", () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from(list).flatMap((c) => [c.charCodeAt(0), 0])])
    expect(decodeTallyFile(utf16)).toBe(list)
    expect(decodeTallyFile(new TextEncoder().encode(list))).toBe(list)
    expect(readLedgers(list)).toEqual([
      { name: 'Asha40Katapadi', group: 'Direct Incomes' },
      { name: 'Cash', group: 'Cash-in-hand' },
      { name: 'Rao & Sons 8 Udupi', group: 'Direct Incomes' },
    ])
  })

  it('splits a ledger into name, age and place whatever the spacing; after a "/" is his note', () => {
    expect(ledgerParts('Asha40Katapadi')).toEqual({ name: 'asha', age: 40, place: 'katapadi' })
    expect(ledgerParts('Asha Rao 40 Katapadi/Family')).toEqual({ name: 'asharao', age: 40, place: 'katapadi' })
    expect(ledgerParts("Rita D`costa 9 Kaup")).toEqual({ name: 'ritadcosta', age: 9, place: 'kaup' })
    expect(ledgerParts('Random Expenditures')).toEqual({ name: 'randomexpenditures', age: null, place: '' })
  })

  it('is sure of one ledger that fits name, age (a few years on) and place', () => {
    const [m] = matchLedgers([patient('p1', 'Asha', 42, 'Katapadi, Udupi')], ['Asha40Katapadi', 'Bhavya 30 Kaup'], today)
    expect(m).toEqual({ patientId: 'p1', options: ['Asha40Katapadi'], sure: true })
  })

  it('asks when two ledgers fit, the place differs, or only the first name matches', () => {
    const two = matchLedgers([patient('p1', 'Asha', 42, null)], ['Asha40Katapadi', 'Asha 41 Kaup'], today)[0]
    expect(two.sure).toBe(false)
    expect(two.options).toHaveLength(2)
    const place = matchLedgers([patient('p1', 'Asha', 42, 'Kaup')], ['Asha40Katapadi'], today)[0]
    expect(place).toEqual({ patientId: 'p1', options: ['Asha40Katapadi'], sure: false })
    const first = matchLedgers([patient('p1', 'Asha Rao', 42, 'Katapadi')], ['Asha40Katapadi'], today)[0]
    expect(first.sure).toBe(false)
  })

  it("leaves out a ledger whose age can't be this patient, and one ledger sure for two patients is a question", () => {
    expect(matchLedgers([patient('p1', 'Asha', 70, null)], ['Asha40Katapadi'], today)[0].options).toEqual([])
    const both = matchLedgers([patient('p1', 'Asha', 41, 'Katapadi'), patient('p2', 'Asha', 42, 'Katapadi')], ['Asha40Katapadi'], today)
    expect(both.map((m) => m.sure)).toEqual([false, false])
  })

  it("names a new ledger as he does, in plain letters, never one another patient's ledger has", () => {
    const p = patient('p1', 'Asha Rao', 40, 'Katapadi, Udupi 574105')
    expect(newLedgerName(p, new Set(), today)).toBe('Asha Rao 40 Katapadi')
    expect(newLedgerName(p, new Set(['asha rao 40 katapadi']), today)).toBe('Asha Rao 40 Katapadi 2')
    expect(newLedgerName(patient('p2', 'Meena', null, null), new Set(), today)).toBe('Meena')
    expect(newLedgerName(patient('p3', 'ಮೀನಾ', 30, null), new Set(), today)).toBe('Patient 30')
  })
})
