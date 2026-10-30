import { describe, expect, it } from 'vitest'
import { ago, buildAlerts, DUES_LISTED, type AlertData } from './alerts'
import type { StockLevel } from './stock'

// What needs the dentist, worked out from the clinic's data: a line on each, and where it is dealt with
const NOW = new Date('2026-10-30T05:00:00Z').getTime() // 10:30 AM in India, a Friday
const TODAY = '2026-10-30'
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const none: AlertData = {
  today: TODAY, now: NOW, requests: [], resend: [], missed: [], reminders: null, stock: [], dues: [], recalls: [], pausedUntil: null,
}
const level = (over: Partial<StockLevel>): StockLevel => ({
  item_id: 'i1', name: 'Gloves', category: 'consumable' as StockLevel['category'], unit: 'box', low_level: 2, supplier: '',
  last_unit_cost: null, on_hand: 5, next_expiry: null, ...over,
})

describe('alerts', () => {
  it('none when nothing needs him', () => {
    expect(buildAlerts(none)).toEqual([])
  })

  it('a booking request leads to its screen, on the day it asks for', () => {
    const [alert] = buildAlerts({ ...none, requests: [{ id: 'r1', name: 'Ravi Kumar', requested_start: '2026-11-02T04:00:00Z', reason: 'Check-up', created_at: minutesAgo(12), received_at: null }] })
    expect(alert).toMatchObject({ kind: 'request', title: 'Booking request: Ravi Kumar', action: 'Book a time', href: '/app/requests/r1?d=2026-11-02', now: true })
    expect(alert.detail).toBe('Wants Mon, 2 Nov, 9:30 AM · Check-up · asked 12 min ago')
  })

  it('a request with no time chosen, waiting days, says so once', () => {
    const [alert] = buildAlerts({ ...none, requests: [{ id: 'r2', name: 'Meera', requested_start: null, reason: null, created_at: minutesAgo(3 * 24 * 60), received_at: null }] })
    expect(alert.detail).toBe('No time chosen, asked 3 days ago')
    expect(alert.href).toBe('/app/requests/r2')
  })

  it('a bill changed after sending, a patient who didn\'t come, and tomorrow\'s reminders need him now', () => {
    const alerts = buildAlerts({
      ...none,
      resend: [{ id: 'v1', visit_date: '2026-10-28', patient: { name: 'Asha Rao' } }],
      missed: [{ id: 'a1', starts_at: '2026-10-29T05:30:00Z', patient: { name: 'Kiran Pai' } }],
      reminders: {
        date: '2026-10-31', tomorrow: true,
        items: [
          { reminded: false, patient: { name: 'Sunil', phone: '9876543210' } },
          { reminded: false, patient: { name: 'Lata', phone: '9876543211' } },
          { reminded: true, patient: { name: 'Done Already', phone: '9876543212' } },
          { reminded: false, patient: { name: 'No Phone', phone: null } },
        ],
      },
    })
    expect(alerts.map((a) => [a.kind, a.title, a.href, a.now])).toEqual([
      ['resend', 'Bill changed after sending: Asha Rao', '/app/visits/v1', true],
      ['missed', "Kiran Pai didn't come", '/app#needs-you', true],
      ['reminders', 'Remind 2 patients about tomorrow', '/app#to-send', true],
    ])
    expect(alerts[2].detail).toBe('Sunil, Lata')
  })

  it('stock: what is low first, then what expires soon, each to its item', () => {
    const alerts = buildAlerts({
      ...none,
      stock: [
        level({ item_id: 'i1', name: 'Gloves', on_hand: 1 }),
        level({ item_id: 'i2', name: 'Anaesthetic', unit: 'cartridge', on_hand: 20, next_expiry: '2026-11-12' }),
        level({ item_id: 'i3', name: 'Composite', unit: 'syringe', on_hand: 2, next_expiry: '2026-11-05' }),
        level({ item_id: 'i4', name: 'Plenty', on_hand: 40, next_expiry: '2027-06-30' }),
      ],
    })
    expect(alerts.map((a) => [a.title, a.detail, a.action, a.href, a.now])).toEqual([
      ['Composite is running low and expires 5 Nov', '2 syringes left', 'Restock', '/app/stock/i3', false],
      ['Gloves is running low', '1 box left', 'Restock', '/app/stock/i1', false],
      ['Anaesthetic expires 12 Nov', '20 cartridges in stock', 'Check', '/app/stock/i2', false],
    ])
  })

  it('money owed: each bill to collect, the largest first, and past a few the rest together on Practice', () => {
    const dues = Array.from({ length: DUES_LISTED + 2 }, (_, i) => ({ patientName: `Patient ${i + 1}`, amount: (i + 1) * 100, visitId: `v${i + 1}` }))
    const alerts = buildAlerts({ ...none, dues })
    expect(alerts).toHaveLength(DUES_LISTED + 1)
    expect(alerts[0]).toMatchObject({ title: 'Patient 7 owes ₹700', action: 'Collect', href: '/app/visits/v7?step=bill', now: false })
    expect(alerts.at(-1)).toMatchObject({ title: '2 more patients owe ₹300', action: 'See all', href: '/app/insights' })
  })

  it('check-ups due and online booking paused can wait', () => {
    const alerts = buildAlerts({ ...none, recalls: [{ name: 'Old Friend' }], pausedUntil: 'infinity' })
    expect(alerts.map((a) => [a.title, a.detail, a.href, a.now])).toEqual([
      ['1 patient is due a check-up', 'Old Friend', '/app#to-send', false],
      ['Online booking is paused', 'Paused until you turn it back on.', '/app', false],
    ])
  })

  it('what needs him now comes before what can wait', () => {
    const alerts = buildAlerts({
      ...none,
      recalls: [{ name: 'Old Friend' }],
      stock: [level({ on_hand: 0 })],
      requests: [{ id: 'r1', name: 'Ravi', requested_start: null, reason: null, created_at: minutesAgo(5), received_at: null }],
    })
    expect(alerts.map((a) => a.kind)).toEqual(['request', 'stock', 'recalls'])
  })

  it('says how long ago, in words', () => {
    expect(ago(minutesAgo(0), NOW)).toBe('just now')
    expect(ago(minutesAgo(59), NOW)).toBe('59 min ago')
    expect(ago(minutesAgo(125), NOW)).toBe('2 h ago')
    expect(ago(minutesAgo(30 * 60), NOW)).toBe('yesterday')
    expect(ago(minutesAgo(5 * 24 * 60), NOW)).toBe('5 days ago')
  })
})
