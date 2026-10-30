-- Multi-clinic, slice 3b's database part (docs/build/PLAN-multi-clinic.md): the patient's link page (/r/<token>)
-- learns its clinic from the link, since whoever opens it is not signed in.
--   - shared_photos(token) also returns the link's clinic: its name, place, phone, address and logo, and the
--     dentist the prescription is from (the visit's maker's, else the clinic's first): name, qualifications,
--     registration number and signature (they are printed on the prescription);
--   - an expired link still says which clinic to call: its name, place and phone, nothing else.
-- Additive: the page reads the new "clinic" key from slice 3b's app part. Folded into schema.sql.

begin;

-- On the live database: wait at most 10 seconds for a table the app is using, then stop with nothing changed
set local lock_timeout = '10s';

create or replace function public.shared_photos(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.expires_at > now()
    then jsonb_build_object(
      'visit_date', v.visit_date,
      'first_name', split_part(btrim(p.name), ' ', 1),
      'language', p.language,
      'expires_at', s.expires_at,
      'photos', s.photos,
      'clinic', jsonb_build_object(
        'name', c.name, 'place', c.place, 'place_kn', c.place_kn, 'phone', c.phone, 'address', c.address, 'logo', c.logo,
        'dentist', (select jsonb_build_object('name', d.name, 'qualifications', d.qualifications,
                                              'registration', d.registration, 'signature', d.signature)
                    from public.dentists d
                    where d.clinic_id = c.id and d.active
                    order by (d.user_id is not distinct from v.owner_id) desc, d.created_at, d.id
                    limit 1)))
    else jsonb_build_object('expired', true, 'clinic', jsonb_build_object('name', c.name, 'place', c.place, 'phone', c.phone))
  end
  from public.share_links s
  join public.visits v on v.id = s.visit_id
  join public.patients p on p.id = v.patient_id
  join public.clinics c on c.id = v.clinic_id
  where char_length(p_token) between 32 and 128 and s.token = p_token
$$;

revoke all on function public.shared_photos(text) from public, anon, authenticated;
grant execute on function public.shared_photos(text) to anon, authenticated;

commit;
