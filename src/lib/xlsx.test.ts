import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { excelDate, readXlsx } from './xlsx'
import { makeXlsx } from './xlsx-write'

describe('reading a workbook', () => {
  it('gives each sheet by name, rows and columns in place, text, numbers and dates', () => {
    const file = makeXlsx({
      'Read me': [['Fill in what you know.']],
      Supplies: [
        ['Everything you buy and keep.'],
        ['Item', 'Kind', 'Counted in', 'How many now'],
        ['Gloves & masks <M>', 'Consumable', 'box', 4],
        [],
        ['Composite A2', null, 'capsule', 2.5, null, null, null, new Date(Date.UTC(2027, 5, 30))],
      ],
    })
    const sheets = readXlsx(file)
    expect(Object.keys(sheets)).toEqual(['Read me', 'Supplies'])
    expect(sheets.Supplies[1]).toEqual(['Item', 'Kind', 'Counted in', 'How many now'])
    expect(sheets.Supplies[2]).toEqual(['Gloves & masks <M>', 'Consumable', 'box', '4'])
    expect(sheets.Supplies[3]).toEqual([])
    // A blank cell between filled ones stays in its column; a date-formatted cell is a date
    expect(sheets.Supplies[4]).toEqual(['Composite A2', '', 'capsule', '2.5', '', '', '', '2027-06-30'])
  })

  it('reads inline text, rich text, booleans and formula results; errors are blank', () => {
    const sheet = '<worksheet><sheetData><row r="1">' +
      '<c r="A1" t="inlineStr"><is><t>Inline</t></is></c>' +
      '<c r="B1" t="s"><v>0</v></c>' +
      '<c r="C1" t="b"><v>1</v></c>' +
      '<c r="D1" t="str"><f>A1&amp;"!"</f><v>Inline!</v></c>' +
      '<c r="E1" t="e"><v>#N/A</v></c>' +
      '<c r="F1"><f>2*3</f><v>6</v></c>' +
      '</row><row r="3"><c r="AB3" t="s"><v>1</v></c></row></sheetData></worksheet>'
    const file = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="One &amp; two" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst><si><r><t>Rich </t></r><r><t>text</t></r></si><si><t>Far_x000D_ out</t></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
    })
    const sheets = readXlsx(file)
    expect(sheets['One & two'][0]).toEqual(['Inline', 'Rich text', 'TRUE', 'Inline!', '', '6'])
    expect(sheets['One & two'][2][27]).toBe('Far\r out')
  })

  it('refuses a file that isn’t a workbook', () => {
    expect(() => readXlsx(strToU8('Item,Kind\nGloves,Consumable'))).toThrow()
    expect(() => readXlsx(zipSync({ 'word/document.xml': strToU8('<document/>') }))).toThrow()
  })

  it('turns Excel day numbers into dates', () => {
    expect(excelDate(46203)).toBe('2026-06-30')
    expect(excelDate(46203.75)).toBe('2026-06-30')
    expect(excelDate(44741, true)).toBe('2026-06-30')
    expect(excelDate(0)).toBeNull()
  })
})
