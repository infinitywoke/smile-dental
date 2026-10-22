import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { lastDay, type MonthPeriods } from '@/lib/insights'
import { BILL_BUCKET, total, type Cost, type FixedCost } from '@/lib/costs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COST = 'id, spent_on, category, amount, paid_by, payee, note, bill_path, fixed_cost_id'
const FIXED = 'id, name, category, amount, every, starts_on, ends_on'
const LINK_SECONDS = 60 * 60

const toCost = (c: Cost) => ({ ...c, amount: Number(c.amount) })
const toFixed = (f: FixedCost) => ({ ...f, amount: Number(f.amount) })

// The month's costs (the whole month), what was spent over the days it is compared with, and the
// regular bills. `ready` is false until supabase/stock-costs-2026-10.sql has been run.
export async function getCosts(periods: MonthPeriods): Promise<{ ready: boolean; costs: Cost[]; before: number; bills: FixedCost[] }> {
  await getDoctor()
  const supabase = await createClient()
  const [costs, before, bills] = await Promise.all([
    supabase.from('costs').select(COST).gte('spent_on', periods.current.from).lte('spent_on', lastDay(periods.month))
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('costs').select('amount').gte('spent_on', periods.previous.from).lte('spent_on', periods.previous.to),
    supabase.from('fixed_costs').select(FIXED).order('name'),
  ])
  if (costs.error || before.error || bills.error) return { ready: false, costs: [], before: 0, bills: [] }
  return {
    ready: true,
    costs: (costs.data as Cost[]).map(toCost),
    before: total((before.data ?? []).map((c) => ({ amount: Number(c.amount) }))),
    bills: (bills.data as FixedCost[]).map(toFixed),
  }
}

// One cost, with a link to its bill photo
export async function getCost(id: string): Promise<{ cost: Cost; billUrl: string | null; billName: string | null } | null> {
  if (!UUID.test(id)) return null
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.from('costs').select(COST).eq('id', id).maybeSingle()
  if (error || !data) return null
  const cost = toCost(data as Cost)
  let billUrl: string | null = null
  if (cost.bill_path) {
    const { data: signed } = await supabase.storage.from(BILL_BUCKET).createSignedUrl(cost.bill_path, LINK_SECONDS)
    billUrl = signed?.signedUrl ?? null
  }
  let billName: string | null = null
  if (cost.fixed_cost_id) {
    const { data: bill } = await supabase.from('fixed_costs').select('name').eq('id', cost.fixed_cost_id).maybeSingle()
    billName = bill?.name ?? null
  }
  return { cost, billUrl, billName }
}

// Every regular bill, the running ones first
export async function getFixedCosts(): Promise<{ ready: boolean; bills: FixedCost[] }> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.from('fixed_costs').select(FIXED).order('name')
  if (error) return { ready: false, bills: [] }
  const bills = (data as FixedCost[]).map(toFixed)
  return { ready: true, bills: [...bills.filter((b) => !b.ends_on), ...bills.filter((b) => b.ends_on)] }
}
