import { z } from 'zod'
import type { Treatment } from '@/config/site'
import { rowsFrom } from '@/lib/price-list'

// Booking API v1: what a clinic's website calls, from any address, by the clinic's slug. It offers no more than a
// visitor already has: free start times with no names, the price list, and sending a request. Requests are limited
// per phone and device by the database; the two lists are cached for a short while.

export const SLUG = /^[a-z0-9-]{1,64}$/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export function apiJson(body: unknown, status = 200, cacheSeconds = 0): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS, 'Cache-Control': cacheSeconds > 0 ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` : 'no-store' },
  })
}

// The browser's check before a website on another address calls
export const apiOptions = () => new Response(null, { status: 204, headers: CORS })

const text = (max: number) => z.string().trim().max(max).optional().default('')

export const requestBody = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(20),
  requestedStart: z.iso.datetime({ offset: true }),
  age: text(3),
  gender: text(10),
  address: text(300),
  medicalAlerts: text(1000),
  heardFrom: text(100),
  reason: text(200),
  notes: text(1000),
  contact: z.enum(['whatsapp', 'call']).optional().default('whatsapp'),
  // Left empty by people: a form's hidden field, for catching bots
  website: z.string().max(200).optional().default(''),
})

// What a refused request says, by the first answer that is wrong (as the website's form says it)
const FIELD_ERRORS: Record<string, string> = {
  name: 'Please enter your name.',
  phone: 'Please enter a valid 10-digit mobile number.',
  requestedStart: 'Please choose a time.',
}
export const requestError = (issues: { path: PropertyKey[] }[]): string =>
  FIELD_ERRORS[String(issues[0]?.path[0] ?? '')] ?? (issues[0]?.path.length ? 'One of the answers is too long. Please shorten it.' : 'Please check the name, phone number and time.')

// The price list as rows of plain options, one treatment each
export const pricesBody = (list: Treatment[]) => {
  const rows = rowsFrom(list)
  return list.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.shortDescription ?? '',
    options: rows.filter((r) => r.slug === t.slug).map((r) => ({ detail: r.detail, cost: r.cost })),
  }))
}

const clinicParameter = { name: 'slug', in: 'path', required: true, schema: { type: 'string', pattern: SLUG.source }, description: "The clinic's slug" }
const failure = { description: 'Refused, with a message to show the visitor', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } } }

export const OPENAPI = {
  openapi: '3.1.0',
  info: { title: 'Clinic OS Booking API', version: '1.0.0', description: "What a clinic's website calls: its free times, its price list, and sending a request. The clinic confirms a request on WhatsApp." },
  paths: {
    '/api/v1/clinics/{slug}/slots': {
      get: {
        summary: 'Free appointment start times',
        parameters: [clinicParameter, { name: 'days', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 28 }, description: 'How many days ahead (default 28)' }],
        responses: { 200: { description: 'Start times, soonest first; empty while online booking is paused', content: { 'application/json': { schema: { type: 'object', properties: { slots: { type: 'array', items: { type: 'string', format: 'date-time' } }, paused: { type: 'boolean', description: 'Online booking is paused: ask visitors to call' } } } } } }, 400: failure },
      },
    },
    '/api/v1/clinics/{slug}/prices': {
      get: {
        summary: 'The price list',
        parameters: [clinicParameter],
        responses: { 200: { description: 'Treatments and their priced options', content: { 'application/json': { schema: { type: 'object', properties: { treatments: { type: 'array', items: { type: 'object' } } } } } } }, 400: failure },
      },
    },
    '/api/v1/clinics/{slug}/requests': {
      post: {
        summary: 'Send an appointment request',
        parameters: [clinicParameter],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name', 'phone', 'requestedStart'], properties: {
            name: { type: 'string' }, phone: { type: 'string', description: '10-digit Indian mobile number' }, requestedStart: { type: 'string', format: 'date-time', description: 'One of the free start times' },
            age: { type: 'string' }, gender: { type: 'string', enum: ['female', 'male', 'other'] }, address: { type: 'string' }, medicalAlerts: { type: 'string' }, heardFrom: { type: 'string' }, reason: { type: 'string' }, notes: { type: 'string' },
            contact: { type: 'string', enum: ['whatsapp', 'call'] },
          } } } },
        },
        responses: { 201: { description: 'Saved for the clinic', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } }, 400: failure, 422: failure },
      },
    },
  },
}
