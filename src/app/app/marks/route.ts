import { setFollowedUp, setRecalled, setReminded, setReviewAsked } from '@/lib/actions/follow-ups'

// "Sent" marks for WhatsApp taps (a reminder, a call-back, a check-up, a review request). The page sends
// them with keepalive, so the mark still arrives when WhatsApp opens in the same tab straight away.
export async function POST(request: Request) {
  let body: { kind?: unknown; id?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Something went wrong.' }, { status: 400 })
  }
  const id = String(body.id ?? '')
  const result =
    body.kind === 'reminded' ? await setReminded(id, true)
    : body.kind === 'followed-up' ? await setFollowedUp(id, true)
    : body.kind === 'recalled' ? await setRecalled(id, 'now')
    : body.kind === 'review' ? await setReviewAsked(id, 'now')
    : { error: 'Something went wrong.' }
  return Response.json(result, { status: result.error ? 400 : 200 })
}
