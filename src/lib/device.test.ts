import { describe, expect, it } from 'vitest'
import { deviceName } from './device'

describe('deviceName', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; CPH2581) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 'Android · Chrome'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36', 'Android · Samsung Internet'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', 'iPhone · Safari'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1', 'iPhone · Chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 'Windows · Edge'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:144.0) Gecko/20100101 Firefox/144.0', 'Mac · Firefox'],
  ])('names %j as %j', (userAgent, expected) => {
    expect(deviceName(userAgent)).toBe(expected)
  })

  it('says "This device · browser" when it can tell neither', () => {
    expect(deviceName('')).toBe('This device · browser')
    expect(deviceName('curl/8.9.1')).toBe('This device · browser')
  })
})
