import 'server-only'
import { cache } from 'react'
import { getClinicId, getDoctor } from '@/lib/auth'
import { clinicContext, type ClinicContext, type ClinicRow, type DentistRow } from '@/lib/clinic'
import { createClient } from '@/lib/supabase/server'

const CLINIC_COLUMNS = 'id, slug, name, place, place_kn, phone, whatsapp, email, address, short_address, maps_link, review_link, upi_id, upi_payee, logo, tally, chair_monitor'
const DENTIST_COLUMNS = 'id, name, user_id, active, short_name, short_name_kn, qualifications, registration, signature'

// The clinic the signed-in person works in, and the dentist its messages and prescriptions are from (their
// own row, else the clinic's first active dentist): the one place Clinic OS learns a clinic's name, phone,
// address, UPI, Tally names and the rest. Members read their own clinic, so it can only be theirs. Cached per
// request, so a page and everything it calls share one read. A clinic that isn't fully set up (no name,
// phone, place, address or dentist) is an error saying what.
export const getClinic = cache(async (): Promise<ClinicContext> => {
  const [doctor, clinicId] = await Promise.all([getDoctor(), getClinicId()])
  const supabase = await createClient()
  const [clinic, dentists] = await Promise.all([
    supabase.from('clinics').select(CLINIC_COLUMNS).eq('id', clinicId).maybeSingle(),
    supabase.from('dentists').select(DENTIST_COLUMNS).eq('clinic_id', clinicId).order('created_at').order('id'),
  ])
  if (clinic.error) throw clinic.error
  if (dentists.error) throw dentists.error
  return clinicContext(clinic.data as ClinicRow | null, dentists.data as DentistRow[], doctor.id)
})
