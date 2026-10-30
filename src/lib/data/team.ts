import 'server-only'
import { cache } from 'react'
import { getClinicId, getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type TeamChair = { id: string; name: string }
export type TeamDentist = { id: string; name: string; shortName: string | null; visiting: boolean; hasLogin: boolean }
export type Team = { chairs: TeamChair[]; dentists: TeamDentist[]; isOwner: boolean; myDentistId: string | null }

// The clinic's chairs and dentists still in use. Visiting specialists are booked by the clinic like anyone else;
// the database keeps them out of the website's free times. Cached per request.
export const getTeam = cache(async (): Promise<Team> => {
  const [doctor, clinicId] = await Promise.all([getDoctor(), getClinicId()])
  const supabase = await createClient()
  const [chairs, dentists, owner] = await Promise.all([
    supabase.from('chairs').select('id, name').eq('clinic_id', clinicId).eq('active', true).order('created_at').order('id'),
    supabase.from('dentists').select('id, name, short_name, visiting, user_id').eq('clinic_id', clinicId).eq('active', true).order('created_at').order('id'),
    supabase.rpc('is_clinic_owner'),
  ])
  if (chairs.error) throw chairs.error
  if (dentists.error) throw dentists.error
  return {
    chairs: chairs.data,
    dentists: dentists.data.map((d) => ({ id: d.id, name: d.name, shortName: d.short_name, visiting: d.visiting, hasLogin: d.user_id !== null })),
    isOwner: owner.data === true,
    myDentistId: dentists.data.find((d) => d.user_id === doctor.id)?.id ?? null,
  }
})

// One chair and one dentist, as at a small clinic: the screens stay as they are, with no one to choose
export const hasOneOfEach = (team: Team) => team.chairs.length <= 1 && team.dentists.length <= 1
