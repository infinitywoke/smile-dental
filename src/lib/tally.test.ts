import { describe, expect, it } from 'vitest'
import { cleanLedger, tallyGroupNamed, tallyTotals, tallyVouchers, tallyXml, type TallyPayment } from './tally'

const ledgers = { cash: 'Cash', bank: 'HDFC Bank', income: 'Professional Fees' }
const payments: TallyPayment[] = [
  // 18 Oct 2026, 7:00 PM in India
  { id: 'a', amount: 700, method: 'upi', receivedAt: '2026-10-18T13:30:00Z', patientName: 'Prakash & Sons', visitDate: '2026-10-18' },
  // 18 Oct 2026, 10:00 AM in India
  { id: 'b', amount: 500, method: 'cash', receivedAt: '2026-10-18T04:30:00Z', patientName: 'Asha  Rao', visitDate: '2026-10-11' },
  { id: 'c', amount: 250.5, method: 'cash', receivedAt: '2026-10-19T05:00:00Z', patientName: 'Ravi', visitDate: '2026-10-19' },
  // 1:00 AM on 20 Oct in India, still 19 Oct in UTC
  { id: 'd', amount: 300, method: 'cash', receivedAt: '2026-10-19T19:30:00Z', patientName: 'Late Payer', visitDate: '2026-10-19' },
]

describe('send to Tally', () => {
  it('makes one receipt per payment, dated in India time, cash to the cash ledger and UPI to the bank', () => {
    const v = tallyVouchers(payments, ledgers, 'payment', 'Smile Dental Clinic')
    expect(v.map((x) => [x.date, x.debitLedger, x.amount])).toEqual([
      ['2026-10-18', 'Cash', 500], ['2026-10-18', 'HDFC Bank', 700], ['2026-10-19', 'Cash', 250.5], ['2026-10-20', 'Cash', 300],
    ])
    expect(v[0].narration).toBe('Asha Rao - Cash - visit 11 Oct 2026')
  })

  it('or one receipt per day for cash and one for UPI', () => {
    const v = tallyVouchers(payments, ledgers, 'day', 'Smile Dental Clinic')
    expect(v.map((x) => [x.date, x.debitLedger, x.amount])).toEqual([
      ['2026-10-18', 'Cash', 500], ['2026-10-18', 'HDFC Bank', 700], ['2026-10-19', 'Cash', 250.5], ['2026-10-20', 'Cash', 300],
    ])
    expect(v[1].narration).toBe('Smile Dental Clinic - 1 UPI payment - 18 Oct 2026')
    const two = tallyVouchers([payments[1], { ...payments[1], id: 'e', amount: 100 }], ledgers, 'day', 'Clinic')
    expect(two).toHaveLength(1)
    expect(two[0].amount).toBe(600)
    expect(two[0].narration).toBe('Clinic - 2 Cash payments - 18 Oct 2026')
  })

  it('writes Tally XML: debit negative with ISDEEMEDPOSITIVE Yes, credit positive, names escaped', () => {
    const file = tallyXml([payments[0]], ledgers, 'payment', 'Smile Dental Clinic')
    expect(file).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>')
    expect(file).toContain('<VOUCHER VCHTYPE="Receipt" ACTION="Create">')
    expect(file).toContain('<DATE>20261018</DATE>')
    expect(file).toContain('<NARRATION>Prakash &amp; Sons - UPI - visit 18 Oct 2026</NARRATION>')
    expect(file).toMatch(/<LEDGERNAME>HDFC Bank<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>\s*<AMOUNT>-700\.00<\/AMOUNT>/)
    expect(file).toMatch(/<LEDGERNAME>Professional Fees<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>700\.00<\/AMOUNT>/)
    // The cash or bank ledger is the voucher's party, as in Tally's own Day Book export
    expect(file).toMatch(/<VOUCHERTYPENAME>Receipt<\/VOUCHERTYPENAME>\s*<PARTYLEDGERNAME>HDFC Bank<\/PARTYLEDGERNAME>/)
    expect(tallyXml([], ledgers, 'payment', 'X')).not.toContain('<VOUCHER')
  })

  it("puts the visit's treatments in the narration, in plain letters, as his Day Book notes do", () => {
    const withTreatments = { ...payments[1], treatments: ['Root canal treatment (46)', 'X-ray – IOPA'] }
    const [v] = tallyVouchers([withTreatments], ledgers, 'payment', 'Smile Dental Clinic')
    expect(v.narration).toBe('Asha Rao - Root canal treatment (46), X-ray IOPA - Cash - visit 11 Oct 2026')
  })

  it('totals what a file holds, and tidies ledger names', () => {
    expect(tallyTotals(payments)).toEqual({ count: 4, cash: 1050.5, upi: 700 })
    expect(cleanLedger('  HDFC   Bank ')).toBe('HDFC Bank')
    expect(cleanLedger('   ')).toBeNull()
    expect(cleanLedger('x'.repeat(101))).toBeNull()
  })

  it("knows Tally's own groups, which are not ledgers", () => {
    expect(tallyGroupNamed('Direct Incomes')).toBe('Direct Incomes')
    expect(tallyGroupNamed('direct income')).toBe('Direct Incomes')
    expect(tallyGroupNamed('Bank Accounts')).toBe('Bank Accounts')
    expect(tallyGroupNamed('Cash')).toBeNull()
    expect(tallyGroupNamed('Bank of Baroda')).toBeNull()
    expect(tallyGroupNamed('Professional Fees')).toBeNull()
  })
})
