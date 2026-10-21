import { describe, expect, it } from 'vitest'
import { HOME, linksFor, sitePath } from './site-links'

describe('linksFor', () => {
  it('keeps the homepage links on its own sections', () => {
    expect(linksFor(HOME)).toEqual({ home: '#top', book: '#book', treatments: '#treatments', doctor: '#doctor' })
  })

  it('books on the booking page itself, and links every other page to the pages and sections', () => {
    expect(linksFor(sitePath('/book')).book).toBe('#book')
    const fromPrices = linksFor(sitePath('/treatments/fillings'))
    expect(fromPrices.book).toBe(sitePath('/book'))
    expect(fromPrices.treatments).toBe(sitePath('/treatments'))
    expect(fromPrices.doctor).toBe(`${HOME}#doctor`)
    expect(fromPrices.home).toBe(HOME)
  })

  it('puts every page under the homepage', () => {
    expect(sitePath('/privacy').endsWith('/privacy')).toBe(true)
    expect(sitePath('/privacy').startsWith(HOME === '/' ? '/privacy' : `${HOME}/`)).toBe(true)
  })
})
