import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_BLOCKS, BLOCK_MINUTES, ONLINE_CUTOFF, fromMinutes, isClinicStart, isClosedDay } from './schedule'

// The booking rules live twice, on purpose: in this app (src/lib/schedule.ts) and in the database
// (supabase/schema.sql), which checks every booking again. These tests read the database's rules from
// the schema and fail as soon as the two disagree.
const sql = readFileSync(path.join(process.cwd(), 'supabase', 'schema.sql'), 'utf8')
const one = (re: RegExp) => {
  const m = sql.match(re)
  if (!m) throw new Error(`not found in schema.sql: ${re}`)
  return m
}

describe('the database and the app agree on', () => {
  it("the website's blocks", () => {
    const minutes = one(/unnest\(array\[([\d,\s]+)\]\) as m/)[1].split(',').map((n) => Number(n.trim()))
    expect(minutes.map(fromMinutes)).toEqual(ALL_BLOCKS)
  })

  it('how long a website request holds its block, and when online booking stops', () => {
    const holds = [...sql.matchAll(/appointment_end\((?:s\.slot|b\.requested_start), (\d+)\)/g)].map((m) => Number(m[1]))
    expect(holds.length).toBeGreaterThan(0)
    expect(new Set(holds)).toEqual(new Set([BLOCK_MINUTES]))
    expect(one(/::time < time '(\d\d:\d\d)'/)[1]).toBe(ONLINE_CUTOFF)
    expect(one(/::time >= time '(\d\d:\d\d)'/)[1]).toBe(ONLINE_CUTOFF)
  })

  it('where Clinic OS may start an appointment of each length', () => {
    const [, min, max, lengthStep] = one(/p_minutes between (\d+) and (\d+) and p_minutes % (\d+) = 0/).map(Number)
    const startStep = Number(one(/and m % (\d+) = 0/)[1])
    const sessions = one(/\(m >= (\d+) and m \+ p_minutes <= (\d+)\)\s*or \(m >= (\d+) and m \+ p_minutes <= (\d+)\)/).slice(1).map(Number)
    // The database's rule, as written in is_clinic_start
    const database = (date: string, m: number, length: number) =>
      !isClosedDay(date) && length >= min && length <= max && length % lengthStep === 0 && m % startStep === 0 &&
      ((m >= sessions[0] && m + length <= sessions[1]) || (m >= sessions[2] && m + length <= sessions[3]))

    for (const date of ['2026-10-15', '2026-10-16']) {
      for (const length of [5, 10, 25, 30, 45, 47, 60, 90, 120, 240, 245]) {
        for (let m = 8 * 60; m <= 20 * 60; m++) {
          expect(isClinicStart(date, fromMinutes(m), length), `${date} ${fromMinutes(m)} for ${length} min`).toBe(database(date, m, length))
        }
      }
    }
  })
})
