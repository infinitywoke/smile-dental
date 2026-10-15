import { describe, expect, it } from 'vitest'
import { businessIntent } from './whatsapp-business'

describe('businessIntent', () => {
  it('opens the WhatsApp Business app with the same number and text, falling back to wa.me', () => {
    const url = 'https://wa.me/919845021763?text=Hello%20Prakash%2C%0A*Bill*'
    expect(businessIntent(url)).toBe(
      `intent://send?phone=919845021763&text=Hello%20Prakash%2C%0A*Bill*#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${encodeURIComponent(url)};end`,
    )
  })
  it('handles a link without text and leaves other links alone', () => {
    expect(businessIntent('https://wa.me/919845021763')).toContain('intent://send?phone=919845021763#Intent;')
    expect(businessIntent('https://example.com')).toBe('https://example.com')
  })
})
