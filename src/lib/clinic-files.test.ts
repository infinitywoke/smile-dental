import { describe, expect, it } from 'vitest'
import { isBillFile, isVisitFile, visitFolders } from './clinic-files'

const CLINIC = '0b4d9c1e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const ME = '11111111-1111-1111-1111-111111111111'
const VISIT = 'aaaaaaaa-0000-0000-0000-000000000002'
const COST = 'cccccccc-0000-0000-0000-000000000003'

describe('where the clinic keeps its files', () => {
  it("a visit's files are in the clinic's folder, or the person's own from before", () => {
    expect(visitFolders(CLINIC, ME, VISIT)).toEqual([`${CLINIC}/${VISIT}`, `${ME}/${VISIT}`])
    expect(visitFolders(ME, ME, VISIT)).toEqual([`${ME}/${VISIT}`])
  })

  it('takes a photo in either folder, and nothing else', () => {
    const folders = visitFolders(CLINIC, ME, VISIT)
    expect(isVisitFile(`${CLINIC}/${VISIT}/p1.jpg`, folders)).toBe(true)
    expect(isVisitFile(`${ME}/${VISIT}/p1.jpg`, folders)).toBe(true)
    expect(isVisitFile(`${CLINIC}/${VISIT}/`, folders)).toBe(false)
    expect(isVisitFile(`${CLINIC}/${VISIT}`, folders)).toBe(false)
    expect(isVisitFile(`${CLINIC}/bbbbbbbb-0000-0000-0000-000000000002/p1.jpg`, folders)).toBe(false)
    expect(isVisitFile(`22222222-2222-2222-2222-222222222222/${VISIT}/p1.jpg`, folders)).toBe(false)
  })

  it("a bill's file is named after its cost, in either folder", () => {
    expect(isBillFile(`${CLINIC}/${COST}.jpg`, COST, [CLINIC, ME])).toBe(true)
    expect(isBillFile(`${ME}/${COST}.pdf`, COST, [CLINIC, ME])).toBe(true)
    expect(isBillFile(`${CLINIC}/${COST}.exe`, COST, [CLINIC, ME])).toBe(false)
    expect(isBillFile(`${CLINIC}/${VISIT}.jpg`, COST, [CLINIC, ME])).toBe(false)
    expect(isBillFile(`22222222-2222-2222-2222-222222222222/${COST}.jpg`, COST, [CLINIC, ME])).toBe(false)
  })
})
