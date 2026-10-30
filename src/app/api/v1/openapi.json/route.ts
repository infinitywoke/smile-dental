import { apiJson, OPENAPI } from '@/lib/booking-api'

export const GET = () => apiJson(OPENAPI, 200, 3600)
