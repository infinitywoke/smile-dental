import { describe, expect, it } from 'vitest'
import { monitorPhotoUrl } from './monitor-photo'

describe("the chair monitor's QR code", () => {
  it('reads a photo address on the monitor\'s own network, with or without http://', () => {
    expect(monitorPhotoUrl('http://192.168.1.1/store/00017.jpg')).toBe('http://192.168.1.1/store/00017.jpg')
    expect(monitorPhotoUrl(' 192.168.1.1/store/00018.jpg\n')).toBe('http://192.168.1.1/store/00018.jpg')
    expect(monitorPhotoUrl('http://10.0.0.5/a.jpg')).toBe('http://10.0.0.5/a.jpg')
  })

  it('refuses anything else: a website, another scheme, plain text', () => {
    expect(monitorPhotoUrl('https://example.com/photo.jpg')).toBeNull()
    expect(monitorPhotoUrl('javascript:alert(1)')).toBeNull()
    expect(monitorPhotoUrl('file:///192.168.1.1/a.jpg')).toBeNull()
    expect(monitorPhotoUrl('WIFI:S:monitor;T:WPA;P:12345678;;')).toBeNull()
    expect(monitorPhotoUrl('http://172.32.0.1/a.jpg')).toBeNull()
  })
})
