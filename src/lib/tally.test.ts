import { describe, expect, it } from 'vitest'
import { cleanLedger, tallyGroupNamed, tallyTotals, tallyVouchers, tallyXml, type TallyPayment } from './tally'
import { SMILE_DENTAL } from './test-clinic'

const ledgers = { cash: 'Cash', bank: 'HDFC Bank', income: 'Professional Fees', patientGroup: SMILE_DENTAL.clinic.tally.patientGroup }
const payments: TallyPayment[] = [
  // 18 Oct 2026, 7:00 PM in India
  { id: 'a', amount: 700, method: 'upi', receivedAt: '2026-10-18T13:30:00Z', patientName: 'Prakash & Sons', visitDate: '2026-10-18' },
  // 18 Oct 2026, 10:00 AM in India
  { id: 'b', amount: 500, method: 'cash', receivedAt: '2026-10-18T04:30:00Z', patientName: 'Asha  Rao', visitDate: '2026-10-11' },
  { id: 'c', amount: 250.5, method: 'cash', receivedAt: '2026-10-19T05:00:00Z', patientName: 'Ravi', visitDate: '2026-10-19' },
  // 1:00 AM on 20 Oct in India, still 19 Oct in UTC
  { id: 'd', amount: 300, method: 'cash', receivedAt: '2026-10-19T19:30:00Z', patientName: 'Late Payer', visitDate: '2026-10-19' },
]
// A visit with nothing paid, dated midday in India on the visit's day
const unpaid: TallyPayment = { id: 'v1', amount: 0, method: 'cash', receivedAt: '2026-10-21T06:30:00Z', patientName: 'Meena', visitDate: '2026-10-21', treatments: ['Consultation'], ledger: { name: 'Meena 30 Kaup', create: false } }

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
    // Tally knows each receipt by its payment, so a file imported twice can't double it
    expect(file).toContain('<VOUCHER REMOTEID="clinic-os-payment-a" VCHTYPE="Receipt" ACTION="Create">')
    expect(file).toContain('<DATE>20261018</DATE>')
    expect(file).toContain('<NARRATION>Prakash &amp; Sons - UPI - visit 18 Oct 2026</NARRATION>')
    expect(file).toMatch(/<LEDGERNAME>HDFC Bank<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>\s*<AMOUNT>-700\.00<\/AMOUNT>/)
    expect(file).toMatch(/<LEDGERNAME>Professional Fees<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>700\.00<\/AMOUNT>/)
    // The cash or bank ledger is the voucher's party, as in Tally's own Day Book export
    expect(file).toMatch(/<VOUCHERTYPENAME>Receipt<\/VOUCHERTYPENAME>\s*<PARTYLEDGERNAME>HDFC Bank<\/PARTYLEDGERNAME>/)
    expect(tallyXml([], ledgers, 'payment', 'X')).not.toContain('<VOUCHER')
    // Named, his company is the only one it can go to, as in his own exports
    expect(tallyXml([payments[0]], ledgers, 'payment', 'X', 'SMILE DENTAL0')).toMatch(/<REPORTNAME>Vouchers<\/REPORTNAME>\s*<STATICVARIABLES>\s*<SVCURRENTCOMPANY>SMILE DENTAL0<\/SVCURRENTCOMPANY>\s*<\/STATICVARIABLES>\s*<\/REQUESTDESC>/)
    expect(file).not.toContain('SVCURRENTCOMPANY')
  })

  it("puts the visit's treatments in the narration, in plain letters, as his Day Book notes do", () => {
    const withTreatments = { ...payments[1], treatments: ['Root canal treatment (46)', 'X-ray – IOPA'] }
    const [v] = tallyVouchers([withTreatments], ledgers, 'payment', 'Smile Dental Clinic')
    expect(v.narration).toBe('Asha Rao - Root canal treatment (46), X-ray IOPA - Cash - visit 11 Oct 2026')
  })

  it('totals what a file holds, and tidies ledger names', () => {
    expect(tallyTotals(payments)).toEqual({ count: 4, cash: 1050.5, upi: 700, unpaid: 0 })
    expect(tallyTotals([...payments, unpaid])).toEqual({ count: 4, cash: 1050.5, upi: 700, unpaid: 1 })
    expect(cleanLedger('  HDFC   Bank ')).toBe('HDFC Bank')
    expect(cleanLedger('   ')).toBeNull()
    expect(cleanLedger('x'.repeat(101))).toBeNull()
  })

  it("credits the patient's own ledger, creating at the top of the file only the ones Tally doesn't have", () => {
    const own = [
      { ...payments[1], ledger: { name: 'Asha Rao 40 Katapadi', create: false } },
      { ...payments[0], ledger: { name: 'Prakash 52 Udupi', create: true } },
      { ...payments[2], ledger: { name: 'Prakash 52 Udupi', create: true } },
    ]
    const v = tallyVouchers(own, ledgers, 'payment', 'Clinic')
    expect(v.map((x) => x.creditLedger)).toEqual(['Asha Rao 40 Katapadi', 'Prakash 52 Udupi', 'Prakash 52 Udupi'])
    const file = tallyXml(own, ledgers, 'payment', 'Clinic')
    expect(file.match(/<LEDGER NAME=/g)).toHaveLength(1)
    expect(file).toMatch(/<LEDGER NAME="Prakash 52 Udupi">\s*<NAME.LIST>\s*<NAME>Prakash 52 Udupi<\/NAME>\s*<\/NAME.LIST>\s*<PARENT>Direct Incomes<\/PARENT>\s*<ISBILLWISEON>Yes<\/ISBILLWISEON>/)
    expect(file.indexOf('<LEDGER ')).toBeLessThan(file.indexOf('<VOUCHER '))
    expect(file).toMatch(/<LEDGERNAME>Asha Rao 40 Katapadi<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>500\.00<\/AMOUNT>/)
    expect(file).not.toContain('Professional Fees')
    // One per day still goes to the income ledger, and creates nothing
    expect(tallyXml(own, ledgers, 'day', 'Clinic')).not.toContain('<LEDGER ')
  })

  it("puts the visit's notes on its first receipt on the visit's day, on one line, as his Day Book narrations are", () => {
    const notes = 'Teeth:\n- 36 RCT started, BMP done\n- IOPA taken\n\nAdvice: soft diet'
    const visit = { visitId: 'v9', visitDate: '2026-10-18', notes, treatments: ['Root canal treatment (36)'] }
    const v = tallyVouchers([
      { ...payments[1], ...visit }, // 18 Oct, the visit's day
      { ...payments[0], ...visit }, // 18 Oct again: a second part payment
      { ...payments[2], ...visit }, // 19 Oct: the balance, a day later
    ], ledgers, 'payment', 'Clinic')
    expect(v[0].narration).toBe('Asha Rao - Root canal treatment (36) - Cash - visit 18 Oct 2026 - Teeth:; 36 RCT started, BMP done; IOPA taken; Advice: soft diet')
    expect(v[1].narration).toBe('Prakash & Sons - Root canal treatment (36) - UPI - visit 18 Oct 2026')
    expect(v[2].narration).toBe('Ravi - Root canal treatment (36) - Cash - visit 18 Oct 2026')
    expect(tallyVouchers([{ ...unpaid, visitId: 'v1', notes: 'Pain in 46, reviewed' }], ledgers, 'payment', 'Clinic')[0].narration)
      .toBe('Meena - Consultation - nothing paid - visit 21 Oct 2026 - Pain in 46, reviewed')
  })

  it('makes a visit with nothing paid a receipt with no amount, as his own are; one per day leaves it out', () => {
    const file = tallyXml([unpaid], ledgers, 'payment', 'Clinic')
    expect(file).toContain('<VOUCHER REMOTEID="clinic-os-visit-v1" VCHTYPE="Receipt" ACTION="Create">')
    expect(file).toContain('<DATE>20261021</DATE>')
    expect(file).toContain('<NARRATION>Meena - Consultation - nothing paid - visit 21 Oct 2026</NARRATION>')
    expect(file).toMatch(/<LEDGERNAME>Cash<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>\s*<\/ALLLEDGERENTRIES.LIST>/)
    expect(file).not.toContain('<AMOUNT>')
    expect(tallyVouchers([unpaid], ledgers, 'day', 'Clinic')).toEqual([])
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
