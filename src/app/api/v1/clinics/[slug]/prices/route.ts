import { connection } from 'next/server'
import { apiJson, apiOptions, pricesBody, SLUG } from '@/lib/booking-api'
import { getTreatments } from '@/lib/data/price-list'

export const OPTIONS = apiOptions

export async function GET(_request: Request, { params }: RouteContext<'/api/v1/clinics/[slug]/prices'>) {
  await connection()
  const { slug } = await params
  if (!SLUG.test(slug)) return apiJson({ error: 'That is not a clinic.' }, 400)
  return apiJson({ treatments: pricesBody(await getTreatments(slug)) }, 200, 300)
}
