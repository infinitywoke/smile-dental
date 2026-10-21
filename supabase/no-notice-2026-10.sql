-- No more 2 hours' notice for online booking (owner, 21 Oct 2026). Any free block that hasn't started
-- yet can be requested; someone coming in sooner can call the clinic. Everything else about the free
-- blocks stays: the next 28 days, never Fridays, starts before 7 PM (evenings are by phone), and not
-- overlapping a booked appointment, time off, or a request held after its WhatsApp reached the clinic.
--
-- Replaces public.get_open_slots only. submit_booking_request checks every request against it, so
-- the website and the database agree. Nothing is deleted. Run once in the Supabase SQL editor.

create or replace function public.get_open_slots(p_from date default null, p_days integer default 28)
returns table (slot_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select c.clinic_owner_id as owner_id from public.app_config c where c.id
  ), today as (
    select (public.clinic_now() at time zone 'Asia/Kolkata')::date as d
  ), days as (
    select (greatest(coalesce(p_from, t.d), t.d) + i) as d
    from today t, generate_series(0, 27) as i
    where greatest(coalesce(p_from, t.d), t.d) + i <= t.d + 27
      and i < greatest(coalesce(p_days, 28), 0)
  )
  select s.slot as slot_start
  from cfg, days, lateral public.clinic_slots(days.d) as s(slot)
  where s.slot > public.clinic_now()
    and (s.slot at time zone 'Asia/Kolkata')::time < time '19:00'
    and not exists (
      select 1 from public.appointments a
      where a.owner_id = cfg.owner_id and a.status = 'booked'
        and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min))
            && tstzrange(s.slot, public.appointment_end(s.slot, 40)))
    and not exists (
      select 1 from public.time_off t
      where t.owner_id = cfg.owner_id
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(s.slot, public.appointment_end(s.slot, 40)))
    and not exists (
      select 1 from public.booking_requests b
      where b.owner_id = cfg.owner_id and b.status = 'new' and b.requested_start is not null
        and b.received_at is not null
        and public.request_hold_until(b.received_at, b.requested_start) > public.clinic_now()
        and tstzrange(b.requested_start, public.appointment_end(b.requested_start, 40))
            && tstzrange(s.slot, public.appointment_end(s.slot, 40)))
  order by s.slot
$$;

revoke all on function public.get_open_slots(date, integer) from public, anon, authenticated;
grant execute on function public.get_open_slots(date, integer) to anon, authenticated;
