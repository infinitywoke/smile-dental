import { strFromU8, unzipSync } from 'fflate'

// Reading an Excel workbook (.xlsx) as plain text, for loading a filled-in spreadsheet. A workbook is a zip
// of XML files; this reads only the cell values, never styles or formulas (a formula gives its last value).
// Row i of a sheet is its row i + 1 and cell j its column j (A = 0), so messages can name the row he sees.
// A cell formatted as a date comes back as YYYY-MM-DD; every other cell as Excel stores it ("120", "0.5").

export type Sheets = Record<string, string[][]>

// Enough for any sheet a person fills in; anything beyond is ignored
const MAX_ROWS = 2000
const MAX_COLUMNS = 30

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(text: string): string {
  return text
    .replace(/&(?:#x([0-9a-f]+)|#(\d+)|(\w+));/gi, (whole, hex: string, dec: string, name: string) =>
      hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : ENTITY[name] ?? whole)
    // Excel writes some characters as _x000D_
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1]

// All the text in a shared string or an inline string, without phonetic guides
const textOf = (xml: string) =>
  [...xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '').matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decode(m[1])).join('')

// "B" → 1, "AA" → 26
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

// Excel's built-in date formats, and a custom format that writes days, months or years
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57])
const isDateFormat = (code: string) => /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''))

// Which cell styles are dates (by their place in cellXfs)
function dateStyles(xml: string | undefined): Set<number> {
  const styles = new Set<number>()
  if (!xml) return styles
  const custom = new Map<number, string>()
  for (const m of xml.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(m[1], 'numFmtId'))
    custom.set(id, decode(attr(m[1], 'formatCode') ?? ''))
  }
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(xml)?.[1] ?? ''
  ;[...xfs.matchAll(/<(?:\w+:)?xf\b([^>]*)/g)].forEach((m, index) => {
    const id = Number(attr(m[1], 'numFmtId') ?? 0)
    if (custom.has(id) ? isDateFormat(custom.get(id)!) : DATE_FORMATS.has(id)) styles.add(index)
  })
  return styles
}

// An Excel day number as YYYY-MM-DD (day 1 is 1 Jan 1900, or 2 Jan 1904 in the Mac date system)
export function excelDate(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null
  const days = Math.floor(serial) + (date1904 ? 1462 : 0)
  return new Date(Date.UTC(1899, 11, 30) + days * 86_400_000).toISOString().slice(0, 10)
}

// The workbook's sheets by name, each as rows of cell text. Throws if it isn't an Excel workbook.
export function readXlsx(bytes: Uint8Array): Sheets {
  const files = unzipSync(bytes, {
    filter: (f) => ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml'].includes(f.name) || f.name.startsWith('xl/worksheets/'),
  })
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : undefined)
  const workbook = text('xl/workbook.xml')
  if (!workbook) throw new Error('Not an Excel workbook')

  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\sdate1904="(?:1|true)"/.test(workbook)
  const strings = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) => textOf(m[1] ?? ''))
  const dates = dateStyles(text('xl/styles.xml'))
  const targets = new Map<string, string>()
  for (const m of (text('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id')
    const target = attr(m[1], 'Target')
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }

  const sheets: Sheets = {}
  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const name = decode(attr(m[1], 'name') ?? '')
    const relation = /\s\w+:id="([^"]*)"/.exec(m[1])?.[1]
    const xml = relation ? text(targets.get(relation) ?? '') : undefined
    if (name && xml !== undefined) sheets[name] = readSheet(xml, strings, dates, date1904)
  }
  return sheets
}

function readSheet(xml: string, strings: string[], dates: Set<number>, date1904: boolean): string[][] {
  const rows: string[][] = []
  let nextRow = 0
  for (const row of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const r = attr(row[1], 'r')
    const index = r ? Number(r) - 1 : nextRow
    nextRow = index + 1
    if (index >= MAX_ROWS) break
    const cells: string[] = []
    let nextColumn = 0
    for (const cell of (row[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = attr(cell[1], 'r')
      const column = ref ? columnIndex(ref) : nextColumn
      nextColumn = column + 1
      if (column < 0 || column >= MAX_COLUMNS) continue
      const value = cellValue(cell[1], cell[2] ?? '', strings, dates, date1904)
      if (value === '') continue
      while (cells.length < column) cells.push('')
      cells[column] = value
    }
    if (cells.length === 0) continue
    while (rows.length < index) rows.push([])
    rows[index] = cells
  }
  return rows
}

function cellValue(attrs: string, inner: string, strings: string[], dates: Set<number>, date1904: boolean): string {
  const type = attr(attrs, 't') ?? 'n'
  if (type === 'inlineStr') return textOf(inner)
  const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1]
  if (raw === undefined) return ''
  switch (type) {
    case 's':
      return strings[Number(raw)] ?? ''
    case 'b':
      return raw === '1' ? 'TRUE' : 'FALSE'
    case 'e':
      return ''
    case 'd':
      return decode(raw).slice(0, 10)
    case 'n': {
      const style = Number(attr(attrs, 's') ?? 0)
      return dates.has(style) ? excelDate(Number(raw), date1904) ?? raw : raw
    }
    default:
      return decode(raw)
  }
}
