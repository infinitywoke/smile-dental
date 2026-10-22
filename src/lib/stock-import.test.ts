import { describe, expect, it } from 'vitest'
import { chargeName, priceListOptions } from './pricing'
import { nextDueDate, planStockImport, readDate, readNumber, readUnit, sheetsToSend, type ImportExisting } from './stock-import'

const TODAY = '2026-10-22'
const none: ImportExisting = { items: [], bills: [], materials: [] }
const options = priceListOptions()
const filling = options.find((o) => chargeName(o) === 'Fillings – 3M Z350 Composite')!
const rct = options.find((o) => /root canal/i.test(o.treatment))!

// The spreadsheet as Dr. Rahil gets it: a line of help, the headings, then the grey examples
const SUPPLY_HEADINGS = ['Item', 'Kind', 'Counted in (box, piece, ml, capsule, pack)', 'How many now', 'Warn me at', 'Usual supplier', 'Price per unit (₹)', 'Expiry date (if any)']
const supplies = (...rows: string[][]) => ({
  Supplies: [['Everything you buy and keep.'], SUPPLY_HEADINGS, ['Example: Gloves, medium', 'Consumable', 'box', '4', '1', 'Example supplier', '450'], ...rows],
})
const bills = (...rows: string[][]) => ({
  'Regular bills': [['What you pay every month or every year.'], ['Bill', 'Kind', 'Amount (₹)', 'Every', 'Usually paid on (day of the month)'], ['Example: Clinic rent', 'Rent', '15000', 'Month', '5'], ...rows],
})
const materials = (...rows: string[][]) => ({
  'Materials per treatment': [['One row per treatment option.'], ['Treatment option (as on the price list)', 'Item used (from Supplies)', 'How much per treatment'], ...rows],
})
const texts = (plan: ReturnType<typeof planStockImport>) => plan.notes.map((n) => `${n.sheet}${n.row ? ` ${n.row}` : ''}: ${n.text}`)

describe('supplies', () => {
  it('loads each filled row with its starting count, skipping the examples', () => {
    const plan = planStockImport(supplies(
      ['Composite A2 (3M Z350)', 'Material', 'Capsules', '10', '3', 'Dental Mart', '₹1,200', '2027-06-30'],
      ['Lignocaine 2%', 'Medicines', 'cartridge', '30', '10', '', '35.5', '31/12/2026'],
      ['  Cotton   rolls ', '', '', '', '', '', '', ''],
    ), none, TODAY)
    expect(plan.found).toBe(true)
    expect(plan.items).toEqual([
      { row: 4, name: 'Composite A2 (3M Z350)', category: 'material', unit: 'capsule', qty: 10, lowLevel: 3, supplier: 'Dental Mart', price: 1200, expiresOn: '2027-06-30' },
      { row: 5, name: 'Lignocaine 2%', category: 'medicine', unit: 'cartridge', qty: 30, lowLevel: 10, supplier: '', price: 35.5, expiresOn: '2026-12-31' },
      // Only the name is needed: Other, in pieces, none on the shelf, never low
      { row: 6, name: 'Cotton rolls', category: 'other', unit: 'piece', qty: 0, lowLevel: 0, supplier: '', price: null, expiresOn: null },
    ])
    expect(plan.notes).toEqual([])
  })

  it('leaves what is already on the stock list as it is, and takes a name listed twice once', () => {
    const plan = planStockImport(supplies(['gloves, MEDIUM', 'Consumable', 'box', '9'], ['Bond', 'Material'], ['bond ', 'Material', '', '2']),
      { ...none, items: [{ name: 'Gloves, medium', unit: 'box' }] }, TODAY)
    expect(plan.existingItems).toEqual(['Gloves, medium'])
    expect(plan.items.map((i) => [i.name, i.qty])).toEqual([['Bond', 0]])
    expect(texts(plan)).toEqual(['Supplies 6: “bond” is listed twice; the first one is used.'])
  })

  it('says what it couldn’t read and loads the rest of the row', () => {
    const plan = planStockImport(supplies(
      ['Etchant', 'Gel', 'syringe', 'ten', '-1', '', 'free', 'soon'],
      ['', 'Material', 'box', '2'],
      ['Burs', 'Instrument', 'piece', '0', '', '', '', '2027-01-31'],
    ), none, TODAY)
    expect(plan.items).toEqual([
      { row: 4, name: 'Etchant', category: 'other', unit: 'syringe', qty: 0, lowLevel: 0, supplier: '', price: null, expiresOn: null },
      { row: 6, name: 'Burs', category: 'instrument', unit: 'piece', qty: 0, lowLevel: 0, supplier: '', price: null, expiresOn: null },
    ])
    expect(texts(plan)).toEqual([
      'Supplies 4: “Gel” isn\'t one of the kinds, so Etchant is loaded as Other.',
      'Supplies 4: “ten” in How many now isn\'t a number, so it was left out for Etchant.',
      'Supplies 4: “-1” in Warn me at isn\'t a number, so it was left out for Etchant.',
      'Supplies 4: “free” in Price per unit isn\'t a number, so it was left out for Etchant.',
      'Supplies 4: “soon” isn\'t a date Clinic OS can read, so Etchant\'s expiry was left out.',
      'Supplies 5: No item name, so this row was skipped.',
      'Supplies 6: Burs has an expiry date but none on the shelf, so the date was left out.',
    ])
  })
})

describe('regular bills', () => {
  it('loads each bill, first due on its next day of the month', () => {
    const plan = planStockImport(bills(
      ['Clinic rent', 'Rent', '15,000', 'Month', '5'],
      ['Electricity', 'Electricity', '2500', 'Monthly', '25th'],
      ['Broadband', 'Internet and phone', '799', '', '1'],
      ['Software renewal', 'Software', '6000', 'Year', '1'],
      ['Chair EMI', 'Equipment payment', '4200', 'Month', ''],
    ), none, TODAY)
    expect(plan.bills).toEqual([
      { row: 4, name: 'Clinic rent', category: 'rent', amount: 15000, every: 'month', startsOn: '2026-11-05' },
      { row: 5, name: 'Electricity', category: 'electricity', amount: 2500, every: 'month', startsOn: '2026-10-25' },
      { row: 6, name: 'Broadband', category: 'internet_phone', amount: 799, every: 'month', startsOn: '2026-11-01' },
      { row: 7, name: 'Software renewal', category: 'software', amount: 6000, every: 'year', startsOn: '2026-11-01' },
      { row: 8, name: 'Chair EMI', category: 'equipment', amount: 4200, every: 'month', startsOn: '2026-11-01' },
    ])
    expect(texts(plan)).toEqual([
      'Regular bills 7: Software renewal is yearly, so it is first due on 1 Nov 2026. If it falls in another month, change it in Regular bills.',
      'Regular bills 8: Chair EMI has no day, so it is due on the 1st.',
    ])
  })

  it('skips a bill without an amount, and one already in Regular bills', () => {
    const plan = planStockImport(bills(['Clinic rent', 'Rent', '15000'], ['Water', 'Utilities', 'some', 'Month', '3'], ['Waste pickup', 'Other']),
      { ...none, bills: ['Clinic Rent'] }, TODAY)
    expect(plan.existingBills).toEqual(['Clinic Rent'])
    expect(plan.bills).toEqual([])
    expect(texts(plan)).toEqual([
      'Regular bills 5: “some” isn\'t an amount, so Water was skipped.',
      'Regular bills 6: Waste pickup has no amount, so it was skipped.',
    ])
  })

  it('is next due this month if the day hasn’t passed, and the 31st is a short month’s last day', () => {
    expect(nextDueDate(22, TODAY)).toBe('2026-10-22')
    expect(nextDueDate(21, TODAY)).toBe('2026-11-21')
    expect(nextDueDate(31, '2026-11-05')).toBe('2026-11-30')
    expect(nextDueDate(30, '2027-01-31')).toBe('2027-02-28')
    expect(nextDueDate(10, '2026-12-20')).toBe('2027-01-10')
  })
})

describe('materials per treatment', () => {
  const stock = supplies(['Composite A2', 'Material', 'capsule', '10'], ['Gloves', 'Consumable', 'pair', '50'])

  it('links a treatment to items from the sheet or the stock list; a row without a treatment adds to the one above', () => {
    const plan = planStockImport({
      ...stock,
      ...materials(
        ['Consultation – Standard Consultation'],
        ['Fillings - 3M Z350  Composite', 'composite a2', '1'],
        ['', 'Gloves', '0.5'],
        [chargeName(rct), 'Files (rotary)', '1'],
      ),
    }, { ...none, items: [{ name: 'Files (rotary)', unit: 'piece' }] }, TODAY)
    expect(plan.materials).toEqual([
      { row: 4, slug: filling.slug, description: 'Fillings – 3M Z350 Composite', item: 'Composite A2', unit: 'capsule', qty: 1 },
      { row: 5, slug: filling.slug, description: 'Fillings – 3M Z350 Composite', item: 'Gloves', unit: 'pair', qty: 0.5 },
      { row: 6, slug: rct.slug, description: chargeName(rct), item: 'Files (rotary)', unit: 'piece', qty: 1 },
    ])
    expect(plan.notes).toEqual([])
  })

  it('skips rows it can’t place, and says why', () => {
    const plan = planStockImport({
      ...stock,
      ...materials(
        ['', 'Gloves', '1'],
        ['Fillings – Gold', 'Gloves', '1'],
        [chargeName(filling), 'Matrix band', '1'],
        ['', 'Gloves', 'some'],
        ['', 'Gloves', '1'],
        ['', 'Gloves', '2'],
      ),
    }, none, TODAY)
    expect(plan.materials.map((m) => [m.row, m.item, m.qty])).toEqual([[7, 'Gloves', 1]])
    expect(texts(plan)).toEqual([
      'Materials per treatment 3: No treatment for this row, so it was skipped.',
      'Materials per treatment 4: “Fillings – Gold” isn\'t on the price list, so this row was skipped.',
      'Materials per treatment 5: “Matrix band” isn\'t on the stock list or loaded from Supplies, so this row was skipped.',
      'Materials per treatment 6: “some” isn\'t an amount, so this row was skipped.',
      'Materials per treatment 8: Gloves is listed twice for Fillings – 3M Z350 Composite; the first one is used.',
    ])
  })
})

describe('loading again', () => {
  it('leaves what a treatment already uses at the same amount, and changes a different amount', () => {
    const plan = planStockImport(materials([chargeName(filling), 'Composite A2', '1'], ['', 'Gloves', '2']), {
      items: [{ name: 'Composite A2', unit: 'capsule' }, { name: 'Gloves', unit: 'pair' }],
      bills: [],
      materials: [{ description: chargeName(filling), item: 'Composite A2', qty: 1 }, { description: chargeName(filling), item: 'Gloves', qty: 1 }],
    }, TODAY)
    expect(plan.existingMaterials).toBe(1)
    expect(plan.materials.map((m) => [m.item, m.qty])).toEqual([['Gloves', 2]])
  })
})

describe('the file', () => {
  it('counts lab fees without loading them', () => {
    const plan = planStockImport({ 'Lab fees': [['What the lab charges you.'], ['Work', 'Lab', 'Fee (₹)'], ['Example: Ceramic crown', 'Example lab', '1200'], ['Ceramic crown (Vita)', 'Sri Lab', '1100'], ['Complete denture', 'Sri Lab', '3000']] }, none, TODAY)
    expect(plan.found).toBe(true)
    expect(plan.labFees).toBe(2)
  })

  it('sends only the sheets it loads, with no overlong cell', () => {
    const sent = sheetsToSend({ 'Read me': [['Fill in what you know.']], SUPPLIES: [['Item'], ['x'.repeat(1200)]], 'Lab fees': [] })
    expect(Object.keys(sent)).toEqual(['SUPPLIES', 'Lab fees'])
    expect(sent.SUPPLIES[1][0]).toHaveLength(1000)
  })

  it('knows when it isn’t the stock and costs spreadsheet, or a sheet has lost its headings', () => {
    expect(planStockImport({ Sheet1: [['Name', 'Phone']] }, none, TODAY).found).toBe(false)
    const plan = planStockImport({ supplies: [['Gloves', 'Consumable', 'box', '4']], 'Regular bills': [['Bill', 'Kind', 'Every']] }, none, TODAY)
    expect(plan.found).toBe(true)
    expect(texts(plan)).toEqual([
      'Supplies: Its headings are missing, so nothing on it was loaded.',
      'Regular bills: It has no “Amount” column, so nothing on it was loaded.',
    ])
  })
})

describe('reading cells', () => {
  it('reads amounts as typed or as Excel keeps them', () => {
    expect(readNumber('1,200')).toBe(1200)
    expect(readNumber('₹ 450/-')).toBe(450)
    expect(readNumber('Rs. 99')).toBe(99)
    expect(readNumber('0.30000000000000004')).toBe(0.3)
    expect(readNumber('1.5E-1')).toBe(0.15)
    expect(readNumber('-2')).toBeNull()
    expect(readNumber('ten')).toBeNull()
  })

  it('reads dates day first, and a month alone as its last day', () => {
    expect(readDate('2027-06-30')).toBe('2027-06-30')
    expect(readDate('2027-06-30T00:00:00.000Z')).toBe('2027-06-30')
    expect(readDate('30/06/2027')).toBe('2027-06-30')
    expect(readDate('3-6-27')).toBe('2027-06-03')
    expect(readDate('06/30/2027')).toBe('2027-06-30')
    expect(readDate('30.06.2027')).toBe('2027-06-30')
    expect(readDate('06/2027')).toBe('2027-06-30')
    expect(readDate('2028-02')).toBe('2028-02-29')
    expect(readDate('Jun 2027')).toBe('2027-06-30')
    expect(readDate('30 June 2027')).toBe('2027-06-30')
    expect(readDate('30-Jun-27')).toBe('2027-06-30')
    expect(readDate('46568')).toBe('2027-06-30')
    expect(readDate('31/02/2027')).toBeNull()
    expect(readDate('2027')).toBeNull()
    expect(readDate('soon')).toBeNull()
  })

  it('keeps units singular, as the app adds the plural', () => {
    expect(readUnit('Boxes')).toBe('box')
    expect(readUnit('capsules')).toBe('capsule')
    expect(readUnit('cartridges')).toBe('cartridge')
    expect(readUnit('ml')).toBe('ml')
    expect(readUnit('pcs')).toBe('pcs')
    expect(readUnit('glass')).toBe('glass')
  })
})
