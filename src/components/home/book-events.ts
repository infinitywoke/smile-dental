// A Book link or the tooth chart picks the reason on the booking card (and may add a note, such as
// which tooth). The booking card may still be loading when the link is tapped, so the latest choice is
// also kept here for the card to pick up when it starts.
export type BookFor = { reason: string; note?: string }

export const BOOK_EVENT = 'smile:book-for'

let pending: BookFor | null = null

export function bookFor(detail: BookFor) {
  pending = detail
  window.dispatchEvent(new CustomEvent<BookFor>(BOOK_EVENT, { detail }))
}

export function takePendingBookFor(): BookFor | null {
  const detail = pending
  pending = null
  return detail
}
