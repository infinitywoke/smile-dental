import { describe, expect, it } from 'vitest'
import { treatments } from '@/config/site'
import { apiJson, OPENAPI, pricesBody, requestBody, requestError, SLUG } from './booking-api'

const good = { name: 'Asha Rao', phone: '9000000001', requestedStart: '2027-01-05T04:30:00.000Z' }

describe('Booking API v1', () => {
  it('takes a slug, and nothing that could reach anywhere else', () => {
    expect(SLUG.test('demo-brightside')).toBe(true)
    expect(SLUG.test('../secrets')).toBe(false)
    expect(SLUG.test('Upper')).toBe(false)
    expect(SLUG.test('')).toBe(false)
  })

  it('a request needs a name, a phone and a time; the rest is optional', () => {
    expect(requestBody.safeParse(good).success).toBe(true)
    expect(requestBody.safeParse({ ...good, name: 'A' }).success).toBe(false)
    expect(requestBody.safeParse({ ...good, requestedStart: 'tomorrow' }).success).toBe(false)
    expect(requestBody.safeParse(null).success).toBe(false)
    expect(requestBody.parse(good)).toMatchObject({ reason: '', contact: 'whatsapp', website: '' })
  })

  it('says what is wrong, as the form would', () => {
    const why = (body: unknown) => {
      const parsed = requestBody.safeParse(body)
      return parsed.success ? null : requestError(parsed.error.issues)
    }
    expect(why({ ...good, phone: '123' })).toBe('Please enter a valid 10-digit mobile number.')
    expect(why({ ...good, name: '' })).toBe('Please enter your name.')
    expect(why({ ...good, requestedStart: 'soon' })).toBe('Please choose a time.')
    expect(why({ ...good, notes: 'x'.repeat(1001) })).toBe('One of the answers is too long. Please shorten it.')
    expect(why(null)).toBe('Please check the name, phone number and time.')
  })

  it('refuses oversized fields before they reach the database', () => {
    expect(requestBody.safeParse({ ...good, notes: 'x'.repeat(1001) }).success).toBe(false)
    expect(requestBody.safeParse({ ...good, contact: 'email' }).success).toBe(false)
  })

  it('a website on any address can call it, and only the lists are cached', () => {
    const answer = apiJson({ slots: [] }, 200, 30)
    expect(answer.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(answer.headers.get('Cache-Control')).toContain('s-maxage=30')
    expect(apiJson({ id: 'x' }, 201).headers.get('Cache-Control')).toBe('no-store')
  })

  it('the price list keeps each treatment with its priced options', () => {
    const list = pricesBody(treatments)
    const fillings = list.find((t) => t.slug === 'fillings')!
    expect(fillings.options.length).toBeGreaterThan(1)
    expect(fillings.options[0]).toEqual({ detail: expect.any(String), cost: expect.any(String) })
    expect(list.flatMap((t) => t.options)).toHaveLength(treatments.flatMap((t) => t.pricing ?? []).length)
  })

  it('the documentation lists every address', () => {
    expect(Object.keys(OPENAPI.paths)).toEqual(['/api/v1/clinics/{slug}/slots', '/api/v1/clinics/{slug}/prices', '/api/v1/clinics/{slug}/requests'])
  })
})
