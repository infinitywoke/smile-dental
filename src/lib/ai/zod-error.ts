import type { z } from 'zod'

// One line per problem, e.g. "plan.0.price_min: Invalid input: expected number, received string"
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
}
