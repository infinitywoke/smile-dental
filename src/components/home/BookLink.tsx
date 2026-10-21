'use client'

import { bookFor } from './book-events'

// "Book" beside a treatment: jumps to the booking card with that treatment chosen
export function BookLink({ reason, label, className, children }: { reason: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <a href="#book" className={className} aria-label={`Book ${label}`} onClick={() => bookFor({ reason })}>
      {children}
    </a>
  )
}
