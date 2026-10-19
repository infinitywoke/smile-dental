'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { setReviewAsked } from '@/lib/actions/follow-ups'
import { formatDate } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'
import { firstName, reviewMessage, whatsappLink } from '@/lib/whatsapp'
import { saveThenOpen } from './FollowUps'
import { useUndo } from './UndoBar'

// After the bill is sent: one tap asks for a Google review on WhatsApp. Offered for every patient,
// once (the date shows after); Undo if it was tapped by mistake.
export function ReviewRequest({ patientId, name, phone, askedAt }: { patientId: string; name: string; phone: string; askedAt: string | null }) {
  const offerUndo = useUndo()
  const [asked, setAsked] = useState<string | null>(askedAt)

  if (asked) {
    return (
      <p className="flex items-center justify-center gap-1.5 text-sm text-gray-600">
        <Star className="h-4 w-4 text-amber-500" /> Google review asked on {formatDate(inIndia(asked).date)}
      </p>
    )
  }

  const href = whatsappLink(phone, reviewMessage({ name }))
  return (
    <a href={href}
      onClick={(event) => {
        setAsked(new Date().toISOString())
        offerUndo(`Review request for ${firstName(name)} marked sent`, async () => {
          setAsked(askedAt)
          return setReviewAsked(patientId, askedAt)
        })
        saveThenOpen(event, href, () => setReviewAsked(patientId, 'now'))
      }}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-green-700 ring-1 ring-green-600 hover:bg-green-50">
      <Star className="h-5 w-5" /> Ask for a Google review
    </a>
  )
}
