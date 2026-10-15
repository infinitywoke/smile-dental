-- A website request holds its time only once its WhatsApp message has reached the clinic (owner,
-- 15 Oct 2026). Until WhatsApp's Business Platform is connected, "received" is set when Dr. Rahil taps
-- the request link inside the patient's message (/app/requests/<id>/received). From then the time is
-- held for 2 hours, never past the appointment itself; a hold that would end after closing (7:30 PM) or
-- before opening (8:30 AM) runs to 10:30 AM on the next open day (Fridays closed). Before that, the
-- time stays open to everyone, so a request nobody sent can't block it.
-- Additive and safe to run twice. Folded into supabase/schema.sql.

begin;

alter table public.booking_requests add column if not exists received_at timestamptz;

create or replace function public.request_hold_until(p_received timestamptz, p_start timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_until timestamptz;
  v_local timestamp;
  v_day date;
begin
  if p_received is null or p_start is null then
    return null;
  end if;
  v_until := p_received + interval '2 hours';
  v_local := v_until at time zone 'Asia/Kolkata';
  if to_char(v_local, 'HH24:MI') > '19:30' or to_char(v_local, 'HH24:MI') < '08:30' then
    v_day := v_local::date + case when to_char(v_local, 'HH24:MI') > '19:30' then 1 else 0 end;
    while extract(isodow from v_day) = 5 loop
      v_day := v_day + 1;
    end loop;
    v_until := (v_day + time '10:30') at time zone 'Asia/Kolkata';
  end if;
  return least(v_until, p_start);
end;
$$;

revoke all on function public.request_hold_until(timestamptz, timestamptz) from public, anon, authenticated;

-- The website's free times: a waiting request hides its time only while it is held
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
  where s.slot >= public.clinic_now() + interval '2 hours'
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

commit;

notify pgrst, 'reload schema';
