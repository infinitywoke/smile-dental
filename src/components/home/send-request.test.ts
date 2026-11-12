import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { siteConfig } from '@/config/site'
import { sendBookingRequest, type BookingInput } from './send-request'

const input: BookingInput = {
  name: 'Asha Rao', phone: '9000000001', age: '', gender: '', address: '', medicalAlerts: '', heardFrom: 'Google',
  reason: 'Check-up', notes: '', requestedStart: '2027-01-05T04:30:00.000Z', contact: 'whatsapp', website: '', tooFast: false,
}
const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }))

describe("the booking card's request", () => {
  let fetch: ReturnType<typeof vi.fn>
  const at = (host: string) => vi.stubGlobal('window', { location: { host, origin: `https://${host}` } })

  beforeEach(() => {
    fetch = vi.fn(() => answer(201, { id: 'r1' }))
    vi.stubGlobal('fetch', fetch)
    at('www.smiledentalkatapadi.com')
  })
  afterEach(() => vi.unstubAllGlobals())

  it("goes to Clinic OS's Booking API, for this website's clinic, without the bot signs", async () => {
    expect(await sendBookingRequest(input)).toEqual({ ok: true, id: 'r1' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${siteConfig.clinicOsUrl}/api/v1/clinics/${siteConfig.clinicSlug}/requests`)
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({ name: 'Asha Rao', phone: '9000000001', reason: 'Check-up', contact: 'whatsapp' })
    expect(sent).not.toHaveProperty('website')
    expect(sent).not.toHaveProperty('tooFast')
  })

  it('on a test server, where both parts share one address, stays there', async () => {
    at('localhost:3100')
    await sendBookingRequest(input)
    expect(fetch.mock.calls[0][0]).toBe(`https://localhost:3100/api/v1/clinics/${siteConfig.clinicSlug}/requests`)
  })

  it('a bot is told it worked, and nothing is sent', async () => {
    expect((await sendBookingRequest({ ...input, website: 'spam' })).ok).toBe(true)
    expect((await sendBookingRequest({ ...input, tooFast: true })).ok).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("passes on the database's words when a request is refused", async () => {
    fetch.mockImplementation(() => answer(422, { error: 'That time is no longer available. Please choose another.' }))
    expect(await sendBookingRequest(input)).toEqual({ ok: false, error: 'That time is no longer available. Please choose another.' })
  })

  it('with no connection, or a reply that is not the API\'s, asks the visitor to call', async () => {
    fetch.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await sendBookingRequest(input)).toEqual({ ok: false, error: expect.stringContaining('call or WhatsApp the clinic') })
    fetch.mockImplementation(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })))
    expect(await sendBookingRequest(input)).toEqual({ ok: false, error: expect.stringContaining('call or WhatsApp the clinic') })
  })
})
