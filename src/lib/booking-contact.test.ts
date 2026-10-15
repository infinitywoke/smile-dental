import { describe, expect, it } from 'vitest'
import { CALL_BACK_NOTE, noteWithoutCallBack, wantsCallBack } from './booking-contact'

describe('call-back requests', () => {
  it('spots the call-back line and shows the rest of the note', () => {
    const notes = `${CALL_BACK_NOTE}\nEvenings are better`
    expect(wantsCallBack(notes)).toBe(true)
    expect(noteWithoutCallBack(notes)).toBe('Evenings are better')
    expect(noteWithoutCallBack(CALL_BACK_NOTE)).toBeNull()
  })

  it('leaves ordinary notes alone', () => {
    expect(wantsCallBack('Evenings are better')).toBe(false)
    expect(noteWithoutCallBack('Evenings are better')).toBe('Evenings are better')
    expect(wantsCallBack(null)).toBe(false)
    expect(noteWithoutCallBack(null)).toBeNull()
  })
})
