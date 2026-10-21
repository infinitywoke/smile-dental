-- Stock and costs (21 Oct 2026, build step P4). Run once in the Supabase SQL editor, after
-- supabase/notifications-2026-10.sql. Additive: six tables, one view, one trigger, a private folder for
-- bill photos, and the morning brief learns about low stock.
--
-- What the clinic keeps (stock_items), what comes in and goes out (stock_moves: a bill in, a use, a count
-- correction, waste), what one treatment uses (treatment_materials: adding that charge to a visit takes
-- the materials off stock, and removing the charge puts them back), and what the clinic spends (costs),
-- with its regular bills (fixed_costs). Only the dentist's own account can see or change any of it.

-- Regular bills: rent, electricity, internet, software, equipment payments ---------------------------
create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category text not null default 'other'
    check (category in ('stock', 'lab', 'rent', 'electricity', 'internet_phone', 'software', 'equipment', 'repairs', 'salary', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  every text not null default 'month' check (every in ('month', 'year')),
  starts_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

-- Money spent: a bill, a lab fee, a repair, or a regular bill marked paid -----------------------------
create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spent_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  category text not null
    check (category in ('stock', 'lab', 'rent', 'electricity', 'internet_phone', 'software', 'equipment', 'repairs', 'salary', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  paid_by text not null default 'cash' check (paid_by in ('cash', 'upi', 'bank', 'card')),
  payee text not null default '' check (char_length(payee) <= 100),
  note text not null default '' check (char_length(note) <= 300),
  -- A photo of the bill in the private cost-bills folder ("<owner id>/<cost id>.<ext>")
  bill_path text check (char_length(bill_path) <= 300),
  -- A lab fee can belong to a patient's visit (a crown, a denture)
  visit_id uuid references public.visits (id) on delete set null,
  fixed_cost_id uuid references public.fixed_costs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costs_owner_spent_idx on public.costs (owner_id, spent_on desc);
-- A regular bill is marked paid once a month (or a year): never twice for the same period
create unique index if not exists costs_fixed_once_per_period on public.costs (fixed_cost_id, (date_trunc('month', spent_on::timestamp)))
  where fixed_cost_id is not null;

-- What the clinic keeps --------------------------------------------------------------------------------
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category text not null default 'consumable' check (category in ('consumable', 'medicine', 'material', 'instrument', 'other')),
  unit text not null default 'piece' check (char_length(unit) between 1 and 20),
  -- At or below this much, it shows as low (0: never)
  low_level numeric(12,2) not null default 0 check (low_level >= 0),
  supplier text not null default '' check (char_length(supplier) <= 100),
  last_unit_cost numeric(12,2) check (last_unit_cost >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists stock_items_owner_name on public.stock_items (owner_id, lower(name)) where not archived;

-- In and out: a bill in (+), a use or waste (-), a count correction (either way) -----------------------
create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.stock_items (id) on delete cascade,
  kind text not null check (kind in ('in', 'use', 'count', 'waste')),
  qty numeric(12,2) not null check (qty <> 0),
  unit_cost numeric(12,2) check (unit_cost >= 0),
  expires_on date,
  -- Used for this charge on a visit: removing the charge removes the use, so the stock comes back
  charge_id uuid references public.visit_charges (id) on delete cascade,
  -- The bill it came in on
  cost_id uuid references public.costs (id) on delete set null,
  note text not null default '' check (char_length(note) <= 200),
  moved_at timestamptz not null default now(),
  check ((kind = 'in' and qty > 0) or (kind in ('use', 'waste') and qty < 0) or kind = 'count')
);
create index if not exists stock_moves_item_idx on public.stock_moves (item_id, moved_at desc);
create index if not exists stock_moves_charge_idx on public.stock_moves (charge_id) where charge_id is not null;

-- What one treatment uses: the price-list option as a charge names it ("Fillings – 3M Z350 Composite") --
create table if not exists public.treatment_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  treatment_slug text not null check (char_length(treatment_slug) between 1 and 100),
  charge_description text not null check (char_length(charge_description) between 1 and 200),
  item_id uuid not null references public.stock_items (id) on delete cascade,
  qty numeric(12,2) not null check (qty > 0),
  unique (owner_id, treatment_slug, charge_description, item_id)
);

-- On hand for each item, and the soonest expiry still to come among what came in ----------------------
create or replace view public.stock_levels with (security_invoker = true) as
  select i.id as item_id, i.name, i.category, i.unit, i.low_level, i.supplier, i.last_unit_cost, i.archived,
    coalesce((select sum(m.qty) from public.stock_moves m where m.item_id = i.id), 0)::numeric(12,2) as on_hand,
    (select min(m.expires_on) from public.stock_moves m
      where m.item_id = i.id and m.kind = 'in' and m.expires_on >= (now() at time zone 'Asia/Kolkata')::date) as next_expiry
  from public.stock_items i;

-- A charge from the price list takes its materials off stock (as the dentist: the same rules apply) ----
create or replace function public.use_materials_for_charge()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.treatment_slug is not null then
    insert into public.stock_moves (owner_id, item_id, kind, qty, charge_id, note)
    select new.owner_id, tm.item_id, 'use', -tm.qty, new.id, left(new.description, 200)
    from public.treatment_materials tm
    where tm.owner_id = new.owner_id and tm.treatment_slug = new.treatment_slug and tm.charge_description = new.description;
  end if;
  return new;
end;
$$;

drop trigger if exists visit_charges_use_materials on public.visit_charges;
create trigger visit_charges_use_materials
  after insert on public.visit_charges
  for each row execute function public.use_materials_for_charge();

drop trigger if exists fixed_costs_set_updated_at on public.fixed_costs;
create trigger fixed_costs_set_updated_at before update on public.fixed_costs for each row execute function public.set_updated_at();
drop trigger if exists costs_set_updated_at on public.costs;
create trigger costs_set_updated_at before update on public.costs for each row execute function public.set_updated_at();
drop trigger if exists stock_items_set_updated_at on public.stock_items;
create trigger stock_items_set_updated_at before update on public.stock_items for each row execute function public.set_updated_at();

-- Only the dentist's own account ---------------------------------------------------------------------
alter table public.fixed_costs enable row level security;
alter table public.costs enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_moves enable row level security;
alter table public.treatment_materials enable row level security;
revoke all on public.fixed_costs, public.costs, public.stock_items, public.stock_moves, public.treatment_materials, public.stock_levels from anon;

drop policy if exists "Owner full access" on public.fixed_costs;
create policy "Owner full access" on public.fixed_costs for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Owner full access" on public.costs;
create policy "Owner full access" on public.costs for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Owner full access" on public.stock_items;
create policy "Owner full access" on public.stock_items for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- A move must be for one of the dentist's own items (and charges)
drop policy if exists "Owner full access" on public.stock_moves;
create policy "Owner full access" on public.stock_moves for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.stock_items i where i.id = item_id and i.owner_id = (select auth.uid())));
drop policy if exists "Owner full access" on public.treatment_materials;
create policy "Owner full access" on public.treatment_materials for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.stock_items i where i.id = item_id and i.owner_id = (select auth.uid())));

-- Bill photos: a private folder, each account its own sub-folder ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cost-bills', 'cost-bills', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner reads own bills" on storage.objects;
create policy "Owner reads own bills" on storage.objects for select to authenticated
  using (bucket_id = 'cost-bills' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owner uploads own bills" on storage.objects;
create policy "Owner uploads own bills" on storage.objects for insert to authenticated
  with check (bucket_id = 'cost-bills' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owner deletes own bills" on storage.objects;
create policy "Owner deletes own bills" on storage.objects for delete to authenticated
  using (bucket_id = 'cost-bills' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The morning brief also says what is low on stock (the same as before, plus "low") -------------------
create or replace function public.notify_due(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_now timestamptz := public.clinic_now();
  v_local timestamp := public.clinic_now() at time zone 'Asia/Kolkata';
  v_today date := (public.clinic_now() at time zone 'Asia/Kolkata')::date;
  v_items jsonb := '[]'::jsonb;
  r record;
begin
  if not public.notify_secret_ok(p_secret) then
    raise exception 'Not allowed';
  end if;
  select c.clinic_owner_id into v_owner from public.app_config c where c.id;
  if v_owner is null then
    return null;
  end if;

  for r in
    select b.id, b.name, b.reason, b.requested_start, b.created_at
    from public.booking_requests b
    where b.owner_id = v_owner and b.status = 'new' and b.received_at is null
      and b.created_at <= v_now - interval '30 minutes' and b.created_at > v_now - interval '12 hours'
      and not exists (select 1 from public.notification_log l
                      where l.owner_id = v_owner and l.kind = 'waiting_request' and l.ref = b.id::text)
    order by b.created_at
  loop
    insert into public.notification_log (owner_id, kind, ref) values (v_owner, 'waiting_request', r.id::text)
      on conflict do nothing;
    v_items := v_items || jsonb_build_array(jsonb_build_object('kind', 'waiting_request', 'ref', r.id, 'name', r.name,
      'reason', r.reason, 'starts_at', r.requested_start, 'created_at', r.created_at));
  end loop;

  if v_local::time >= time '08:15' and v_local::time < time '12:00'
     and extract(isodow from v_today) <> 5
     and not exists (select 1 from public.time_off t
                     where t.owner_id = v_owner
                       and t.starts_at <= (v_today + time '08:30') at time zone 'Asia/Kolkata'
                       and t.ends_at >= (v_today + time '13:00') at time zone 'Asia/Kolkata')
     and not exists (select 1 from public.notification_log l
                     where l.owner_id = v_owner and l.kind = 'morning_brief' and l.ref = v_today::text) then
    insert into public.notification_log (owner_id, kind, ref) values (v_owner, 'morning_brief', v_today::text)
      on conflict do nothing;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'morning_brief', 'ref', v_today,
      'booked', (select count(*) from public.appointments a
                 where a.owner_id = v_owner and a.status = 'booked'
                   and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
      'first_at', (select min(a.starts_at) from public.appointments a
                   where a.owner_id = v_owner and a.status = 'booked'
                     and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
      'waiting', (select count(*) from public.booking_requests b where b.owner_id = v_owner and b.status = 'new'),
      -- What is at or below its low level, lowest first (at most five names)
      'low', coalesce((select jsonb_agg(low.name order by low.share)
                       from (select s.name, s.on_hand / s.low_level as share
                             from (select i.name, i.low_level,
                                          coalesce((select sum(m.qty) from public.stock_moves m where m.item_id = i.id), 0) as on_hand
                                   from public.stock_items i
                                   where i.owner_id = v_owner and not i.archived and i.low_level > 0) s
                             where s.on_hand <= s.low_level
                             order by s.on_hand / s.low_level
                             limit 5) low), '[]'::jsonb)));
  end if;

  if jsonb_array_length(v_items) = 0 then
    return null;
  end if;
  return public.notify_target(v_owner) || jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.notify_due(text) from public;
grant execute on function public.notify_due(text) to anon, authenticated;

notify pgrst, 'reload schema';
