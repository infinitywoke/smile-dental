'use client'

import { useState } from 'react'
import { toothAreas } from '@/config/site'
import { bookFor } from './book-events'

type AreaId = keyof typeof toothAreas

const NAME: Record<number, string> = {
  1: 'central incisor', 2: 'lateral incisor', 3: 'canine', 4: 'first premolar',
  5: 'second premolar', 6: 'first molar', 7: 'second molar', 8: 'wisdom tooth',
}
// Width and height of each tooth in units of --u; upper and lower teeth differ like real ones
const UP: Record<number, [number, number]> = { 1: [0.78, 1.55], 2: [0.66, 1.42], 3: [0.74, 1.62], 4: [0.78, 1.32], 5: [0.78, 1.3], 6: [1.06, 1.24], 7: [1.02, 1.2], 8: [0.96, 1.1] }
const LO: Record<number, [number, number]> = { 1: [0.58, 1.36], 2: [0.62, 1.38], 3: [0.7, 1.55], 4: [0.76, 1.28], 5: [0.78, 1.26], 6: [1.12, 1.16], 7: [1.06, 1.12], 8: [1, 1.04] }
// How far each tooth sits from the middle of the gum line, so the two rows curve like an open mouth
const CURVE: Record<number, number> = { 1: 0, 2: 0.02, 3: 0.07, 4: 0.16, 5: 0.32, 6: 0.58, 7: 0.98, 8: 1.6 }

const areaOf = (n: number): AreaId => (n <= 3 ? 'front' : n <= 7 ? 'back' : 'wisdom')

// Dental (FDI) numbering: 1 upper right, 2 upper left, 3 lower left, 4 lower right; 1 to 8 from the middle
function toothName(id: string): string {
  const q = Number(id[0])
  const n = Number(id[1])
  return `${q <= 2 ? 'upper' : 'lower'} ${q === 1 || q === 4 ? 'right' : 'left'} ${NAME[n]}`
}

// "Not sure what you need?": tap a tooth or an area, see what it usually needs and costs, book a check-up
export function ToothChart() {
  const [tooth, setTooth] = useState<string | null>('46')
  const [region, setRegion] = useState<AreaId>('back')
  const area = toothAreas[region]
  const where = tooth ? `Tooth ${tooth}, ${toothName(tooth)}` : area.label

  const tile = (q: number, n: number, jaw: 'up' | 'down') => {
    const id = String(q * 10 + n)
    const [w, h] = (jaw === 'up' ? UP : LO)[n]
    const on = id === tooth
    const near = !on && region === areaOf(n)
    return (
      <button key={id} type="button" aria-label={`Tooth ${id}, ${toothName(id)}`} aria-pressed={on}
        className={`h-tooth ${jaw} t${id}${on ? ' on' : near ? ' near' : ''}`}
        style={{
          width: `calc(var(--u) * ${w})`,
          height: `calc(var(--u) * ${h})`,
          marginTop: jaw === 'up' ? `calc(var(--u) * ${CURVE[n]})` : undefined,
          marginBottom: jaw === 'down' ? `calc(var(--u) * ${CURVE[n]})` : undefined,
          marginLeft: (q === 2 || q === 3) && n === 1 ? 'calc(var(--u) * 0.16)' : undefined,
        }}
        onClick={() => { setTooth(id); setRegion(areaOf(n)) }} />
    )
  }
  const row = (qa: number, qb: number, jaw: 'up' | 'down') => [
    ...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => tile(qa, n, jaw)),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => tile(qb, n, jaw)),
  ]

  return (
    <div className="h-wrap h-split h-center-items">
      <div className="h-col" style={{ flex: '1 1 400px' }}>
        <p className="h-eyebrow">Not sure what you need?</p>
        <h2 className="h-serif h-h2">Show us where it hurts.</h2>
        <p className="h-lead">
          Tap a tooth or an area to see what it usually needs and what it costs. Dr. Rahil examines first and
          explains the options before any treatment.
        </p>
        <div className="h-card-sm" aria-live="polite">
          <p className="h-eyebrow">{where}</p>
          <h3 className="h-serif h-h3">{area.title}</h3>
          <p className="h-small">{area.body}</p>
          <div className="h-mini-menu">
            {area.items.map(([label, price]) => (
              <div key={label} className="h-leader-row">
                <span>{label}</span>
                <span className="h-leader" />
                <strong>{price}</strong>
              </div>
            ))}
          </div>
          <a href="#book" className="h-btn amber"
            onClick={() => bookFor({ reason: area.reason, note: tooth ? `tooth ${tooth}, ${toothName(tooth)}` : undefined })}>
            {area.cta}
          </a>
        </div>
      </div>

      <div className="h-col" style={{ flex: '1.2 1 500px' }}>
        <div className={`h-mouth${region === 'gums' ? ' gums' : ''}${region === 'missing' ? ' missing' : ''}`}>
          <div className="h-jaw"><span>Right</span><span>Upper jaw</span><span>Left</span></div>
          <div className="h-arch up">{row(1, 2, 'up')}</div>
          <div className="h-arch-gap" />
          <div className="h-arch down">{row(4, 3, 'down')}</div>
          <div className="h-jaw bottom"><span>Right</span><span>Lower jaw</span><span>Left</span></div>
        </div>
        <div role="group" aria-label="Or choose an area" className="h-areas">
          {(Object.keys(toothAreas) as AreaId[]).map((id) => (
            <button key={id} type="button" className={`h-area${id === region ? ' on' : ''}`} aria-pressed={id === region}
              onClick={() => { setRegion(id); setTooth(null) }}>
              {toothAreas[id].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
