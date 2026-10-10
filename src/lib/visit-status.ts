import type { VisitStatus } from '@/lib/data/types'

// Where a visit stands, worked out once so every screen agrees:
// done (marked finished) > paid (billed and fully paid) > billed > in progress.
export function visitStatus(args: { closedAt: string | null | undefined; total: number; paid: number }): VisitStatus {
  if (args.closedAt) return 'done'
  if (args.total > 0 && args.paid >= args.total) return 'paid'
  if (args.total > 0) return 'billed'
  return 'in_progress'
}
