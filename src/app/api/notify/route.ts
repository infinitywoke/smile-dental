import { timingSafeEqual } from 'node:crypto'
import { notifyDue } from '@/lib/push'

// Called every 5 minutes by the database's scheduler (pg_cron), with the shared secret: sends whatever
// notifications are due (a request still waiting, the morning brief). Anyone else gets "Not allowed".
export async function POST(request: Request) {
  const secret = process.env.CLINIC_OS_CRON_SECRET
  if (!secret) return new Response('Notifications are not set up yet', { status: 503 })
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response('Not allowed', { status: 401 })
  const result = await notifyDue()
  return Response.json(result, { status: result.ok ? 200 : 503 })
}
