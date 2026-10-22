'use client'

import Link from 'next/link'
import { formatBlock, sameInstant } from '@/lib/schedule'
import type { DayBlock } from '@/lib/data/appointments'

type Props = {
  blocks: DayBlock[]
  // Select mode: tapping a free pill picks it
  selected?: string | null
  over?: string | null
  label?: string
  onPick?: (instant: string) => void
  // Link mode: where each pill leads, by block start (a missing entry = not tappable)
  hrefs?: Record<string, string | null>
  // Request or appointment whose own block counts as free for it
  ownId?: string
}

// A block can take the patient if it is free, or already held by this very request / appointment
export function isPlaceable(block: DayBlock, ownId?: string): boolean {
  if (block.state === 'free') return true
  if (ownId && block.state === 'request' && block.requestId === ownId) return true
  if (ownId && block.state === 'booked' && block.appointmentId === ownId) return true
  return false
}

const first = (name?: string) => (name ?? '').trim().split(/\s+/)[0] ?? ''

// The day's blocks as compact time pills, morning then afternoon. One picker used everywhere.
export function SlotGrid({ blocks, selected = null, over = null, label, onPick, hrefs, ownId }: Props) {
  const morning = blocks.filter((b) => b.time < '13:00')
  const afternoon = blocks.filter((b) => b.time >= '13:00')

  return (
    <div className="space-y-4">
      {morning.length > 0 && <Group title="Morning" blocks={morning} {...{ selected, over, label, onPick, hrefs, ownId }} />}
      {afternoon.length > 0 && <Group title="Afternoon and evening" blocks={afternoon} {...{ selected, over, label, onPick, hrefs, ownId }} />}
    </div>
  )
}

function Group({ title, blocks, selected, over, label, onPick, hrefs, ownId }: Props & { title: string }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold text-gray-500">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {blocks.map((block) => {
          const placeable = isPlaceable(block, ownId)
          const isSelected = sameInstant(selected, block.instant)
          const isOver = sameInstant(over, block.instant)
          const href = hrefs?.[block.instant] ?? null

          let tone = 'bg-white text-gray-900 ring-gray-300'
          let sub = ''
          if (isSelected) {
            tone = 'bg-blue-600 text-white ring-blue-600 shadow-md shadow-blue-500/30'
            sub = label ? first(label) : '✓'
          } else if (isOver) {
            tone = 'bg-blue-100 text-blue-900 ring-blue-500'
          } else if (block.state === 'booked' && !placeable) {
            tone = 'bg-blue-50 text-blue-900 ring-blue-200'
            sub = first(block.patientName)
          } else if (block.state === 'request' && !placeable) {
            tone = 'bg-amber-50 text-amber-900 ring-amber-300'
            sub = 'Request'
          } else if (block.state === 'blocked') {
            tone = 'bg-gray-100 text-gray-500 ring-gray-200'
            sub = 'Off'
          } else if (block.state === 'past') {
            tone = 'bg-white text-gray-300 ring-gray-100'
          }

          const content = (
            <>
              <span className="block text-sm font-semibold tabular-nums">{formatBlock(block.time)}</span>
              {sub && <span className="block max-w-full truncate text-xs font-medium opacity-80">{sub}</span>}
            </>
          )
          const className = `flex min-h-12 flex-col items-center justify-center rounded-xl px-1 py-2 text-center ring-1 ring-inset transition active:scale-95 ${tone}`

          if (href) {
            return (
              <Link key={block.instant} href={href} data-slot={block.instant} className={className}>
                {content}
              </Link>
            )
          }
          return (
            <button key={block.instant} type="button" data-slot={block.instant}
              aria-pressed={isSelected} disabled={!onPick || !placeable} onClick={() => onPick?.(block.instant)}
              className={`${className} disabled:cursor-default`}>
              {content}
            </button>
          )
        })}
      </div>
    </section>
  )
}
