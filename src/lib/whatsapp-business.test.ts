import { describe, expect, it } from 'vitest'
import { appIntent, businessIntent } from './whatsapp-business'

describe('businessIntent', () => {
  it('opens the WhatsApp Business app with the same number and text, falling back to wa.me', () => {
    const url = 'https://wa.me/919845021763?text=Hello%20Prakash%2C%0A*Bill*'
    expect(businessIntent(url)).toBe(
      `intent://send?phone=919845021763&text=Hello%20Prakash%2C%0A*Bill*#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${encodeURIComponent(url)};end`,
    )
  })
  it('opens plain WhatsApp instead when the phone is set to it', () => {
    expect(appIntent('https://wa.me/919845021763?text=Hi', 'whatsapp')).toContain(';package=com.whatsapp;')
    expect(appIntent('https://wa.me/919845021763?text=Hi', 'business')).toContain(';package=com.whatsapp.w4b;')
  })
  it('handles a link without text and leaves other links alone', () => {
    expect(businessIntent('https://wa.me/919845021763')).toContain('intent://send?phone=919845021763#Intent;')
    expect(businessIntent('https://example.com')).toBe('https://example.com')
  })
})
