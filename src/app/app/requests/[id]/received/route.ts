import { NextResponse, type NextRequest } from 'next/server'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The link inside a patient's WhatsApp request. Opened by Dr. Rahil (signed in), it records that the
// message reached the clinic, which starts holding the asked time (see request_hold_until), then opens
// the request. WhatsApp's link preview on the patient's phone isn't signed in, so it never counts.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.redirect(new URL('/app', request.url))
  await getDoctor()
  const supabase = await createClient()
  await supabase
    .from('booking_requests')
    .update({ received_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'new')
    .is('received_at', null)
  return NextResponse.redirect(new URL(`/app/requests/${id}`, request.url))
}
