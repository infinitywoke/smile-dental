-- Logic audit fixes (docs/build/review-logic.md). One transaction; safe to run again.
--
-- BEFORE running it on the live project, run these read-only checks and show the owner the result:
--   select id, patient_id, amount, method, received_at from public.payments where visit_id is null;      -- removed by step 1
--   select patient_id, visit_date, count(*) from public.visits group by 1, 2 having count(*) > 1;        -- must be empty for step 3
--   select id, patient_id, starts_at from public.appointments where status = 'done' and visit_id is null; -- history, left as is
--   select o.name from storage.objects o where o.bucket_id = 'visit-photos'
--     and not exists (select 1 from public.visit_photos p where p.storage_path = o.name);               -- delete in the dashboard (Storage)

begin;

-- 1. Every payment belongs to a visit, and a visit that holds money cannot be deleted (findings 1, 2).
--    The rows deleted here are payments of visits deleted before this fix: the "Advance with us" the
--    owner saw. Owner's OK first (see the check above).
delete from public.payments where visit_id is null;
alter table public.payments alter column visit_id set not null;
alter table public.payments drop constraint if exists payments_visit_id_fkey;
alter table public.payments add constraint payments_visit_id_fkey
  foreign key (visit_id) references public.visits (id) on delete restrict;

drop policy if exists "Owner full access" on public.payments;
create policy "Owner full access" on public.payments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = payments.visit_id and v.owner_id = (select auth.uid())
                  and v.patient_id = payments.patient_id)
  );

-- 2. "WhatsApp sent" means the patient has the current bill (finding 6). Any change to a sent visit's
--    charges or payments sets resend_needed; markWhatsappSent clears it.
alter table public.visits add column if not exists resend_needed boolean not null default false;

create or replace function public.mark_bill_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.visits v
  set resend_needed = true
  where v.id in (old.visit_id, new.visit_id)   -- old is null on insert, new is null on delete
    and v.closed_at is not null
    and not v.resend_needed;
  return null;
end;
$$;

create or replace trigger visit_charges_bill_changed
  after insert or update or delete on public.visit_charges
  for each row execute function public.mark_bill_changed();
create or replace trigger payments_bill_changed
  after insert or update or delete on public.payments
  for each row execute function public.mark_bill_changed();

-- 3. One visit per patient per day: "Start visit" always reuses today's visit (finding 18).
create unique index if not exists visits_one_per_patient_day on public.visits (patient_id, visit_date);

-- 4. A booked appointment is never in blocked time or already over, whichever screen or action made or
--    moved it (findings 13, 15). Status changes (done, cancelled) are not checked, so Send and Cancel
--    still work on past appointments.
create or replace function public.check_appointment_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'booked' and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at
                                or new.duration_min is distinct from old.duration_min) then
    if public.appointment_end(new.starts_at, new.duration_min) <= public.clinic_now() then
      raise exception 'That time has already passed.';
    end if;
    if exists (select 1 from public.time_off t
               where t.owner_id = new.owner_id
                 and tstzrange(t.starts_at, t.ends_at)
                     && tstzrange(new.starts_at, public.appointment_end(new.starts_at, new.duration_min))) then
      raise exception 'That time is blocked off in your calendar.';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger appointments_check_time
  before insert or update on public.appointments
  for each row execute function public.check_appointment_time();

-- 5. Confirming a website request (findings 12, 16): a block that is already over is refused (the
--    block in progress may still be confirmed), and when the request is linked to a patient already in
--    the app, what the patient wrote under medical alerts is added to their record, never dropped.
create or replace function public.confirm_booking_request(
  p_request uuid,
  p_starts_at timestamptz,
  p_patient uuid default null
)
returns table (patient_id uuid, appointment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.booking_requests;
  v_patient uuid;
  v_appointment uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in.';
  end if;

  select * into r from public.booking_requests b
  where b.id = p_request and b.owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'That request was not found.';
  end if;
  if r.status not in ('new', 'contacted') then
    raise exception 'This request has already been handled.';
  end if;

  if not public.is_clinic_slot(p_starts_at) then
    raise exception 'Please choose one of the clinic time blocks (the clinic is closed on Fridays).';
  end if;
  if public.appointment_end(p_starts_at, 40) <= public.clinic_now() then
    raise exception 'That time has already passed.';
  end if;
  if exists (select 1 from public.time_off t
             where t.owner_id = (select auth.uid())
               and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, public.appointment_end(p_starts_at, 40))) then
    raise exception 'That time is blocked off in your calendar.';
  end if;

  if p_patient is not null then
    select p.id into v_patient from public.patients p
    where p.id = p_patient and p.owner_id = (select auth.uid());
    if v_patient is null then
      raise exception 'That patient was not found.';
    end if;
    if nullif(btrim(r.medical_alerts), '') is not null then
      update public.patients p
      set medical_alerts = case
        when nullif(btrim(p.medical_alerts), '') is null then r.medical_alerts
        when position(lower(btrim(r.medical_alerts)) in lower(p.medical_alerts)) > 0 then p.medical_alerts
        else p.medical_alerts || E'\n' || r.medical_alerts
             || ' (website, ' || to_char(r.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || ')'
      end
      where p.id = v_patient;
    end if;
  else
    insert into public.patients (name, phone, gender, birth_year, address, medical_alerts, heard_from)
    values (r.name, r.phone, r.gender, r.birth_year, r.address, r.medical_alerts, r.heard_from)
    returning id into v_patient;
  end if;

  begin
    insert into public.appointments (patient_id, starts_at, duration_min, reason, status)
    values (
      v_patient, p_starts_at, 40,
      coalesce(nullif(concat_ws(' - ', r.reason, r.notes), ''), ''),
      'booked'
    )
    returning id into v_appointment;
  exception when exclusion_violation then
    raise exception 'That time was just taken. Please choose another block.';
  end;

  update public.booking_requests b
  set status = 'booked', patient_id = v_patient, appointment_id = v_appointment
  where b.id = r.id;

  return query select v_patient, v_appointment;
end;
$$;

revoke all on function public.confirm_booking_request(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_request(uuid, timestamptz, uuid) to authenticated;
revoke all on function public.mark_bill_changed() from public, anon, authenticated;
revoke all on function public.check_appointment_time() from public, anon, authenticated;

-- 6. Money per visit in one place (for findings 3-5): every screen reads charged and paid from here and
--    applies one rule in src/lib/billing.ts. security_invoker: row-level security applies as usual.
create or replace view public.visit_money with (security_invoker = true) as
  select v.id as visit_id, v.patient_id, v.visit_date, v.created_at, v.closed_at, v.resend_needed,
    coalesce((select sum(c.amount) from public.visit_charges c where c.visit_id = v.id), 0)::numeric(12,2) as charged,
    coalesce((select sum(p.amount) from public.payments p where p.visit_id = v.id), 0)::numeric(12,2) as paid
  from public.visits v;
revoke all on public.visit_money from anon;
grant select on public.visit_money to authenticated;

commit;

notify pgrst, 'reload schema';
