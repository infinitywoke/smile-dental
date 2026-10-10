import { describe, expect, it } from 'vitest'
import { appendDictation } from './dictation'

describe('appendDictation', () => {
  it('starts empty notes with the capitalised text', () => {
    expect(appendDictation('', 'pain in lower right')).toBe('Pain in lower right')
  })

  it('treats whitespace-only notes as empty', () => {
    expect(appendDictation('  \n ', 'pain')).toBe('Pain')
  })

  it('keeps text that is already capitalised or starts with a number', () => {
    expect(appendDictation('', 'RCT done')).toBe('RCT done')
    expect(appendDictation('', '46 tender on percussion')).toBe('46 tender on percussion')
  })

  it('adds a full stop between sentences', () => {
    expect(appendDictation('Pain in lower right', 'tooth 46 tender')).toBe('Pain in lower right. Tooth 46 tender')
  })

  it('trims trailing spaces before adding the full stop', () => {
    expect(appendDictation('Pain in lower right  ', 'tooth 46')).toBe('Pain in lower right. Tooth 46')
  })

  it('only adds a space after an existing full stop, question or exclamation mark', () => {
    expect(appendDictation('Pain.', 'tooth 46')).toBe('Pain. Tooth 46')
    expect(appendDictation('Pain. ', 'tooth 46')).toBe('Pain. Tooth 46')
    expect(appendDictation('Pain?', 'tooth 46')).toBe('Pain? Tooth 46')
    expect(appendDictation('Pain!', 'tooth 46')).toBe('Pain! Tooth 46')
  })

  it('keeps an existing trailing newline', () => {
    expect(appendDictation('Pain\n', 'tooth 46')).toBe('Pain\nTooth 46')
  })

  it('returns the notes unchanged for an empty addition', () => {
    expect(appendDictation('Pain', '')).toBe('Pain')
    expect(appendDictation('', '')).toBe('')
    expect(appendDictation('Pain  ', '')).toBe('Pain  ')
  })
})
