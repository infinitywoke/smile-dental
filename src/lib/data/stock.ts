import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { stockAlerts, type StockLevel, type StockMove } from '@/lib/stock'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEVEL = 'item_id, name, category, unit, low_level, supplier, last_unit_cost, on_hand, next_expiry'
const MOVES_SHOWN = 60

type LevelRow = Omit<StockLevel, 'low_level' | 'on_hand' | 'last_unit_cost'> & { low_level: number | string; on_hand: number | string; last_unit_cost: number | string | null }

const toLevel = (r: LevelRow): StockLevel => ({
  ...r,
  low_level: Number(r.low_level),
  on_hand: Number(r.on_hand),
  last_unit_cost: r.last_unit_cost === null ? null : Number(r.last_unit_cost),
})

// Everything on the stock list (not removed). `ready` is false until supabase/stock-costs-2026-10.sql has been run.
export async function getStock(): Promise<{ ready: boolean; levels: StockLevel[] }> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.from('stock_levels').select(LEVEL).eq('archived', false).order('name')
  if (error) return { ready: false, levels: [] }
  return { ready: true, levels: (data as LevelRow[]).map(toLevel) }
}

// One item, with what came in and went out, newest first
export async function getStockItem(id: string): Promise<{ level: StockLevel; archived: boolean; moves: StockMove[] } | null> {
  if (!UUID.test(id)) return null
  await getDoctor()
  const supabase = await createClient()
  const [level, moves] = await Promise.all([
    supabase.from('stock_levels').select(`${LEVEL}, archived`).eq('item_id', id).maybeSingle(),
    supabase.from('stock_moves').select('id, kind, qty, unit_cost, expires_on, note, moved_at, charge_id')
      .eq('item_id', id).order('moved_at', { ascending: false }).limit(MOVES_SHOWN),
  ])
  if (level.error || !level.data || moves.error) return null
  const { archived, ...row } = level.data as LevelRow & { archived: boolean }
  return {
    level: toLevel(row),
    archived,
    moves: (moves.data ?? []).map((m) => ({ ...m, qty: Number(m.qty), unit_cost: m.unit_cost === null ? null : Number(m.unit_cost) }) as StockMove),
  }
}

// For the Cockpit: how many things are low or expire soon (null until the stock tables exist)
export async function getStockAlerts(today: string): Promise<{ low: number; expiring: number } | null> {
  const { ready, levels } = await getStock()
  return ready ? stockAlerts(levels, today) : null
}
