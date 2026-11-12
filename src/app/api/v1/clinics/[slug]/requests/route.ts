import { apiJson, apiOptions, requestBody, requestError, SLUG } from '@/lib/booking-api'
import { saveBookingRequest } from '@/lib/booking-request'

export const OPTIONS = apiOptions

export async function POST(request: Request, { params }: RouteContext<'/api/v1/clinics/[slug]/requests'>) {
  const { slug } = await params
  if (!SLUG.test(slug)) return apiJson({ error: 'That is not a clinic.' }, 400)
  const body = requestBody.safeParse(await request.json().catch(() => null))
  if (!body.success) return apiJson({ error: requestError(body.error.issues) }, 400)
  const { website, ...input } = body.data
  // A bot: answer as if saved, so it learns nothing, but save nothing
  if (website) return apiJson({ id: crypto.randomUUID() }, 201)
  // The first address in X-Forwarded-For is the visitor
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const saved = await saveBookingRequest(slug, input, ip)
  return saved.ok ? apiJson({ id: saved.id }, 201) : apiJson({ error: saved.error }, 422)
}
