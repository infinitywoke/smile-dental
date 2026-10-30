import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { siteConfig, type Treatment } from '@/config/site'
import { getClinic } from '@/lib/data/clinic'
import { listFor, type PriceRow } from '@/lib/price-list'
import { createPublicClient } from '@/lib/supabase/public'

export const PRICE_LIST_TAG = 'price-list'

// A clinic's price list, by its slug: the one loaded from the stock spreadsheet's Treatments sheet (with none
// loaded, or the database out of reach, see listFor). Kept for an hour, per clinic, and made again at once
// when a sheet is loaded (updateTag in actions/stock-import.ts).
export async function getTreatments(clinicSlug: string): Promise<Treatment[]> {
  'use cache'
  cacheTag(PRICE_LIST_TAG)
  cacheLife('hours')
  try {
    const { data, error } = await createPublicClient().rpc('public_price_list', { p_clinic: clinicSlug })
    return listFor(!error && Array.isArray(data) ? (data as PriceRow[]) : [], clinicSlug)
  } catch {
    return listFor([], clinicSlug)
  }
}

// This website's clinic's
export const getWebsiteTreatments = () => getTreatments(siteConfig.clinicSlug)

// The signed-in person's clinic's
export const getClinicTreatments = async () => getTreatments((await getClinic()).clinic.slug)
