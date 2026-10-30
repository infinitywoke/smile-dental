import { connection } from 'next/server'
import { apiJson, apiOptions, SLUG } from '@/lib/booking-api'
import { openSlots } from '@/lib/booking-request'

export const OPTIONS = apiOptions

export async function GET(request: Request, { params }: RouteContext<'/api/v1/clinics/[slug]/slots'>) {
  await connection()
  const { slug } = await params
  if (!SLUG.test(slug)) return apiJson({ error: 'That is not a clinic.' }, 400)
  const days = Number(new URL(request.url).searchParams.get('days') ?? 28)
  if (!Number.isInteger(days) || days < 1 || days > 28) return apiJson({ error: 'Days must be from 1 to 28.' }, 400)
  return apiJson({ slots: await openSlots(slug, null, days) }, 200, 30)
}
