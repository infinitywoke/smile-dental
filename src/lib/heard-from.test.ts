import { describe, expect, it } from 'vitest'
import { guessHeardFrom } from './heard-from'

describe('guessHeardFrom', () => {
  it('recognises search engines and Google listings', () => {
    expect(guessHeardFrom('https://www.google.com/')).toBe('Google')
    expect(guessHeardFrom('https://www.google.co.in/search?q=dentist')).toBe('Google')
    expect(guessHeardFrom('https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6')).toBe('Google')
    expect(guessHeardFrom('https://www.bing.com/')).toBe('Google')
  })

  it('recognises social links', () => {
    expect(guessHeardFrom('https://l.instagram.com/?u=x')).toBe('Instagram')
    expect(guessHeardFrom('https://m.facebook.com/')).toBe('Facebook')
    expect(guessHeardFrom('https://wa.me/916361816711')).toBe('WhatsApp')
  })

  it('prefers an explicit utm_source', () => {
    expect(guessHeardFrom('', 'instagram')).toBe('Instagram')
    expect(guessHeardFrom('https://www.google.com/', 'facebook')).toBe('Facebook')
    expect(guessHeardFrom('', 'GBP')).toBe('Google')
  })

  it('leaves direct visits, own pages and unknown sites empty', () => {
    expect(guessHeardFrom('')).toBe('')
    expect(guessHeardFrom(null)).toBe('')
    expect(guessHeardFrom('https://smile-dental-hin3.vercel.app/treatments')).toBe('')
    expect(guessHeardFrom('http://localhost:3000/')).toBe('')
    expect(guessHeardFrom('https://example.org/blog')).toBe('')
    expect(guessHeardFrom('not a url')).toBe('')
  })
})
