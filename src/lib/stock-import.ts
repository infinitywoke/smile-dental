import { MAX_AMOUNT } from '@/lib/billing'
import { COST_CATEGORIES, type CostCategory } from '@/lib/costs'
import { formatDate } from '@/lib/dates'
import { chargeName, priceListOptions } from '@/lib/pricing'
import { STOCK_KINDS, type StockKind } from '@/lib/stock'
import { excelDate, type Sheets } from '@/lib/xlsx'

// Loading Dr. Rahil's "Stock and costs" spreadsheet (for-dr-rahil/Stock-and-costs-to-fill.xlsx) once: what
// it adds to stock, regular bills and the materials each treatment uses, and every row it can't take, in
// words. The phone shows this before anything is saved, and the server works it out again from the same
// rows before saving. What is already in Clinic OS is left as it is, so loading the file twice adds nothing.

export const SHEETS = { supplies: 'Supplies', bills: 'Regular bills', labFees: 'Lab fees', materials: 'Materials per treatment' } as const

export type ImportItem = {
  row: number
  name: string
  category: StockKind
  unit: string
  // On the shelf now: loaded as a starting count
  qty: number
  lowLevel: number
  supplier: string
  price: number | null
  expiresOn: string | null
}

export type ImportBill = { row: number; name: string; category: CostCategory; amount: number; every: 'month' | 'year'; startsOn: string }

// `item` is the item's name as it will be on the stock list (new from the sheet, or already there)
export type ImportMaterial = { row: number; slug: string; description: string; item: string; unit: string; qty: number }

export type ImportNote = { sheet: string; row: number | null; text: string }

export type ImportPlan = {
  // At least one of the sheets was there
  found: boolean
  items: ImportItem[]
  // On the sheet, already on the stock list: left as they are
  existingItems: string[]
  bills: ImportBill[]
  existingBills: string[]
  // New, or a different amount from what Clinic OS has (which it then replaces)
  materials: ImportMaterial[]
  // Already set to the same amount
  existingMaterials: number
  // Clinic OS has no lab fee list yet, so these rows are counted, not loaded
  labFees: number
  notes: ImportNote[]
}

// What is already in Clinic OS: items on the stock list, the regular bills still running, and what treatments use
export type ImportExisting = {
  items: { name: string; unit: string }[]
  bills: string[]
  materials: { description: string; item: string; qty: number }[]
}

const MAX_QTY = 999_999_999
const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
const clean = (text: string) => text.trim().replace(/\s+/g, ' ')

// A number as typed or as Excel keeps it ("1,200", "₹ 450/-", "0.5", "1.5E-2"), to two decimals
export function readNumber(text: string): number | null {
  const t = text.replace(/[₹,\s]|rs\.?|\/-$/gi, '')
  if (!/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(t)) return null
  const n = Math.round(Number(t) * 100) / 100
  return Number.isFinite(n) ? n : null
}

function validDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : null
}

const lastOfMonth = (year: number, month: number) => (month >= 1 && month <= 12 ? validDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()) : null)
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// An expiry date as Excel gives it or as typed: 2027-06-30, 30/06/2027, 30-6-27, 30 Jun 2027; a month
// alone (06/2027, Jun 2027) means its last day
export function readDate(text: string): string | null {
  const t = text.trim()
  let m: RegExpExecArray | null
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t))) return validDate(+m[1], +m[2], +m[3])
  // A day number Excel didn't mark as a date (2000 to 2100 only)
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Number(t)
    return n >= 36526 && n <= 73051 ? excelDate(n) : null
  }
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) {
    const year = fullYear(m[3])
    // Day first, as in India; month first only when day first can't be a date (06/30/2027)
    return validDate(year, +m[2], +m[1]) ?? validDate(year, +m[1], +m[2])
  }
  if ((m = /^(\d{1,2})[/.-](\d{4})$/.exec(t))) return lastOfMonth(+m[2], +m[1])
  if ((m = /^(\d{4})[/.-](\d{1,2})$/.exec(t))) return lastOfMonth(+m[1], +m[2])
  if ((m = /^(?:(\d{1,2})(?:st|nd|rd|th)?[\s/.-]*)?([a-z]{3,9})\.?[\s/.,-]*(\d{2}|\d{4})$/i.exec(t))) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1
    if (month === 0) return null
    return m[1] ? validDate(fullYear(m[3]), month, +m[1]) : lastOfMonth(fullYear(m[3]), month)
  }
  return null
}

// "Boxes" → "box", "capsules" → "capsule": the app adds the plural itself
export function readUnit(text: string): string {
  const u = norm(text)
  if (/(x|ch|sh|ss)es$/.test(u)) return u.slice(0, -2)
  if (/[^s]s$/.test(u) && u.length > 3) return u.slice(0, -1)
  return u
}

function readKind(text: string): StockKind | null {
  const t = norm(text).replace(/s$/, '')
  return STOCK_KINDS.find((k) => k.value === t)?.value ?? null
}

// The sheet's bill kinds, and the words he might write instead
const BILL_WORDS: Record<string, CostCategory> = {
  ...Object.fromEntries(COST_CATEGORIES.map((c) => [c.label.toLowerCase(), c.value])),
  'equipment payment': 'equipment', internet: 'internet_phone', phone: 'internet_phone', wifi: 'internet_phone', repair: 'repairs',
}

// When a bill paid on this day of the month is next due: this month if the day hasn't passed, else next
// month. The 31st is a shorter month's last day, as in dueOn.
export function nextDueDate(day: number, today: string): string {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const dueIn = (y: number, m: number) => validDate(y, m, Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate()))!
  const thisMonth = dueIn(year, month)
  return thisMonth >= today ? thisMonth : month === 12 ? dueIn(year + 1, 1) : dueIn(year, month + 1)
}

// One sheet as rows of named cells, found by its headings (the first row, within the first 10, that has them)
type Row = { row: number; cell: (field: string) => string }

function table(sheets: Sheets, name: string, headings: Record<string, string[]>, required: string[], notes: ImportNote[]): Row[] | null {
  const sheetName = Object.keys(sheets).find((s) => norm(s) === norm(name))
  if (!sheetName) return null
  const rows = sheets[sheetName]
  const [key] = required
  const matches = (cell: string | undefined, field: string) => headings[field].some((h) => norm(cell ?? '').startsWith(h))
  const headerAt = rows.slice(0, 10).findIndex((r) => r?.some((c) => matches(c, key)))
  if (headerAt < 0) {
    notes.push({ sheet: name, row: null, text: 'Its headings are missing, so nothing on it was loaded.' })
    return []
  }
  const columns = Object.fromEntries(Object.keys(headings).map((field) => [field, rows[headerAt].findIndex((c) => matches(c, field))]))
  const missing = required.filter((field) => columns[field] < 0)
  if (missing.length > 0) {
    const heading = headings[missing[0]][0].replace(/^./, (c) => c.toUpperCase())
    notes.push({ sheet: name, row: null, text: `It has no “${heading}” column, so nothing on it was loaded.` })
    return []
  }
  return rows.slice(headerAt + 1).flatMap((cells, i) => {
    if (!cells?.some((c) => c.trim())) return []
    const cell = (field: string) => (columns[field] >= 0 ? (cells[columns[field]] ?? '').trim() : '')
    // The grey example rows
    if (/^example\s*:/i.test(cell(key))) return []
    return [{ row: headerAt + i + 2, cell }]
  })
}

// What the phone sends to be loaded: only these sheets, and no cell longer than the server takes
export function sheetsToSend(sheets: Sheets): Sheets {
  const wanted = Object.values(SHEETS).map(norm)
  return Object.fromEntries(Object.entries(sheets)
    .filter(([name]) => wanted.includes(norm(name)))
    .map(([name, rows]) => [name, rows.map((cells) => cells.map((c) => c.slice(0, 1000)))]))
}

export function planStockImport(sheets: Sheets, existing: ImportExisting, today: string): ImportPlan {
  const notes: ImportNote[] = []
  const note = (sheet: string, row: number | null, text: string) => notes.push({ sheet, row, text })

  // Supplies -------------------------------------------------------------------------------------------
  const items: ImportItem[] = []
  const existingItems: string[] = []
  const known = new Map(existing.items.map((i) => [norm(i.name), i]))
  const supplies = table(sheets, SHEETS.supplies, {
    name: ['item'], kind: ['kind'], unit: ['counted in', 'unit'], qty: ['how many'], low: ['warn me'], supplier: ['usual supplier', 'supplier'],
    price: ['price'], expiry: ['expiry', 'expires'],
  }, ['name'], notes)
  for (const { row, cell } of supplies ?? []) {
    const at = (text: string) => note(SHEETS.supplies, row, text)
    const name = clean(cell('name'))
    if (!name) {
      at('No item name, so this row was skipped.')
      continue
    }
    if (name.length > 100) {
      at(`“${name.slice(0, 40)}…” is too long a name (100 letters at most), so it was skipped.`)
      continue
    }
    if (known.has(norm(name))) {
      existingItems.push(known.get(norm(name))!.name)
      continue
    }
    if (items.some((i) => norm(i.name) === norm(name))) {
      at(`“${name}” is listed twice; the first one is used.`)
      continue
    }
    let category: StockKind = 'other'
    if (cell('kind')) {
      const kind = readKind(cell('kind'))
      if (kind) category = kind
      else at(`“${cell('kind')}” isn't one of the kinds, so ${name} is loaded as Other.`)
    }
    let unit = readUnit(cell('unit')) || 'piece'
    if (unit.length > 20) {
      at(`“${cell('unit')}” is too long for “Counted in”, so ${name} is counted in pieces.`)
      unit = 'piece'
    }
    const amount = (field: string, label: string, max: number, allowZero = true) => {
      if (!cell(field)) return null
      const n = readNumber(cell(field))
      if (n !== null && n <= max && (allowZero || n > 0)) return n
      at(`“${cell(field)}” in ${label} isn't a number, so it was left out for ${name}.`)
      return null
    }
    const qty = amount('qty', 'How many now', MAX_QTY) ?? 0
    const lowLevel = amount('low', 'Warn me at', MAX_QTY) ?? 0
    const price = amount('price', 'Price per unit', MAX_AMOUNT)
    let expiresOn: string | null = null
    if (cell('expiry')) {
      expiresOn = readDate(cell('expiry'))
      if (!expiresOn) at(`“${cell('expiry')}” isn't a date Clinic OS can read, so ${name}'s expiry was left out.`)
      else if (qty === 0) {
        at(`${name} has an expiry date but none on the shelf, so the date was left out.`)
        expiresOn = null
      }
    }
    items.push({ row, name, category, unit, qty, lowLevel, supplier: clean(cell('supplier')).slice(0, 100), price, expiresOn })
  }

  // Regular bills ---------------------------------------------------------------------------------------
  const bills: ImportBill[] = []
  const existingBills: string[] = []
  const running = new Map(existing.bills.map((b) => [norm(b), b]))
  const billRows = table(sheets, SHEETS.bills, { name: ['bill'], kind: ['kind'], amount: ['amount'], every: ['every'], day: ['usually paid', 'paid on', 'day'] }, ['name', 'amount'], notes)
  for (const { row, cell } of billRows ?? []) {
    const at = (text: string) => note(SHEETS.bills, row, text)
    const name = clean(cell('name'))
    if (!name) {
      at('No bill name, so this row was skipped.')
      continue
    }
    if (name.length > 100) {
      at(`“${name.slice(0, 40)}…” is too long a name (100 letters at most), so it was skipped.`)
      continue
    }
    if (running.has(norm(name))) {
      existingBills.push(running.get(norm(name))!)
      continue
    }
    if (bills.some((b) => norm(b.name) === norm(name))) {
      at(`“${name}” is listed twice; the first one is used.`)
      continue
    }
    const amount = readNumber(cell('amount'))
    if (amount === null || amount <= 0 || amount > MAX_AMOUNT) {
      at(cell('amount') ? `“${cell('amount')}” isn't an amount, so ${name} was skipped.` : `${name} has no amount, so it was skipped.`)
      continue
    }
    let category: CostCategory = 'other'
    if (cell('kind')) {
      const kind = BILL_WORDS[norm(cell('kind'))]
      if (kind) category = kind
      else at(`“${cell('kind')}” isn't one of the kinds, so ${name} is loaded as Other.`)
    }
    const everyText = norm(cell('every'))
    const every = /year|annual/.test(everyText) ? 'year' : 'month'
    if (everyText && every === 'month' && !/month/.test(everyText)) at(`“${cell('every')}” isn't Month or Year, so ${name} is due every month.`)
    const dayMatch = /^(\d{1,2})(?:\.0+)?(?:st|nd|rd|th)?$/i.exec(cell('day'))
    const day = dayMatch && +dayMatch[1] >= 1 && +dayMatch[1] <= 31 ? +dayMatch[1] : null
    if (day === null) at(cell('day') ? `“${cell('day')}” isn't a day of the month, so ${name} is due on the 1st.` : `${name} has no day, so it is due on the 1st.`)
    const startsOn = nextDueDate(day ?? 1, today)
    if (every === 'year') at(`${name} is yearly, so it is first due on ${formatDate(startsOn)}. If it falls in another month, change it in Regular bills.`)
    bills.push({ row, name, category, amount, every, startsOn })
  }

  // Lab fees: counted only --------------------------------------------------------------------------------
  const labRows = table(sheets, SHEETS.labFees, { work: ['work'], lab: ['lab'], fee: ['fee'] }, ['work'], notes)
  const labFees = (labRows ?? []).filter((r) => r.cell('work')).length

  // Materials per treatment ------------------------------------------------------------------------------
  const materials: ImportMaterial[] = []
  const seen = new Set<string>()
  let existingMaterials = 0
  const options = priceListOptions()
  const optionKey = (text: string) => norm(text).replace(/\s*[–—-]\s*/g, ' - ')
  const byName = new Map<string, { name: string; unit: string }>([...known.values(), ...items].map((i) => [norm(i.name), { name: i.name, unit: i.unit }]))
  const materialRows = table(sheets, SHEETS.materials, { treatment: ['treatment'], item: ['item'], qty: ['how much'] }, ['treatment', 'item', 'qty'], notes)
  // A row without a treatment adds another item to the treatment above it
  let current: { text: string; option: (typeof options)[number] | undefined } | null = null
  for (const { row, cell } of materialRows ?? []) {
    const at = (text: string) => note(SHEETS.materials, row, text)
    if (cell('treatment')) current = { text: cell('treatment'), option: options.find((o) => optionKey(chargeName(o)) === optionKey(cell('treatment'))) }
    if (!cell('item') && !cell('qty')) continue
    if (!current) {
      at('No treatment for this row, so it was skipped.')
      continue
    }
    if (!current.option) {
      at(`“${current.text}” isn't on the price list, so this row was skipped.`)
      continue
    }
    const item = byName.get(norm(cell('item')))
    if (!item) {
      at(cell('item') ? `“${cell('item')}” isn't on the stock list or loaded from Supplies, so this row was skipped.` : 'No item, so this row was skipped.')
      continue
    }
    const qty = readNumber(cell('qty'))
    if (qty === null || qty <= 0 || qty > MAX_QTY) {
      at(cell('qty') ? `“${cell('qty')}” isn't an amount, so this row was skipped.` : `No “How much” for ${item.name}, so this row was skipped.`)
      continue
    }
    const description = chargeName(current.option)
    const key = `${description}\n${item.name}`
    if (seen.has(key)) {
      at(`${item.name} is listed twice for ${description}; the first one is used.`)
      continue
    }
    seen.add(key)
    if (existing.materials.some((e) => e.description === description && e.item === item.name && e.qty === qty)) {
      existingMaterials++
      continue
    }
    materials.push({ row, slug: current.option.slug, description, item: item.name, unit: item.unit, qty })
  }

  return {
    found: [supplies, billRows, labRows, materialRows].some((t) => t !== null),
    items, existingItems, bills, existingBills, materials, existingMaterials, labFees, notes,
  }
}
