import { describe, expect, it } from 'vitest'
import { linksFor } from './site-links'

describe('linksFor', () => {
  it('keeps the homepage links on its own sections', () => {
    expect(linksFor('/')).toEqual({ home: '#top', book: '#book', treatments: '#treatments', doctor: '#doctor' })
  })

  it('books on the booking page itself, and links every other page to the pages and sections', () => {
    expect(linksFor('/book').book).toBe('#book')
    expect(linksFor('/treatments/fillings')).toEqual({ home: '/', book: '/book', treatments: '/treatments', doctor: '/#doctor' })
  })
})
