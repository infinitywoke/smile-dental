import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { treatments as listInApp, type Treatment } from '@/config/site'
import { treatmentsFrom, type PriceRow } from '@/lib/price-list'
import { createPublicClient } from '@/lib/supabase/public'

export const PRICE_LIST_TAG = 'price-list'

// The clinic's price list, for the website and Clinic OS alike: the one loaded from the stock
// spreadsheet's Treatments sheet, or (none loaded yet, or the database out of reach) the list in the app.
// Kept for an hour and made again at once when a sheet is loaded (updateTag in actions/stock-import.ts).
export async function getTreatments(): Promise<Treatment[]> {
  'use cache'
  cacheTag(PRICE_LIST_TAG)
  cacheLife('hours')
  try {
    const { data, error } = await createPublicClient().rpc('public_price_list')
    if (error || !Array.isArray(data) || data.length === 0) return listInApp
    return treatmentsFrom(data as PriceRow[])
  } catch {
    return listInApp
  }
}
