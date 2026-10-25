-- The clinic's price list in the database (owner, 25 Oct 2026: a Treatments sheet in the stock
-- spreadsheet adds and removes treatments and changes prices, for Clinic OS and the website together).
-- One row per priced option, in the list's order. Until the first sheet is loaded the table is empty and
-- everything uses the list written into the app (src/config/site.ts `treatments`).
-- The website reads the clinic's own list through public_price_list() (prices are public anyway);
-- loading a sheet replaces the doctor's whole list at once with replace_price_list().
-- Additive and safe to run twice; the app as it is now keeps working while this runs. Folded into schema.sql.

begin;

create table if not exists public.price_list (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  line_no integer not null check (line_no between 1 and 500),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  treatment text not null check (char_length(treatment) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  detail text not null default '' check (char_length(detail) <= 120),
  cost text not null check (char_length(cost) between 1 and 80),
  updated_at timestamptz not null default now(),
  unique (owner_id, treatment, detail)
);

alter table public.price_list enable row level security;

drop policy if exists "Owner full access" on public.price_list;
create policy "Owner full access" on public.price_list
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.price_list from anon;
grant select, insert, update, delete on public.price_list to authenticated;

-- The clinic's list, for the website and Clinic OS alike: anyone may read it
create or replace function public.public_price_list()
returns table (line_no integer, slug text, treatment text, description text, detail text, cost text)
language sql stable security definer set search_path = ''
as $$
  select p.line_no, p.slug, p.treatment, p.description, p.detail, p.cost
  from public.price_list p
  join public.app_config c on c.id and p.owner_id = c.clinic_owner_id
  order by p.line_no
$$;

revoke all on function public.public_price_list() from public;
grant execute on function public.public_price_list() to anon, authenticated;

-- Loading the sheet: the doctor's whole list replaced at once, or not at all
create or replace function public.replace_price_list(p_items jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'A price list has 1 to 500 lines';
  end if;
  delete from public.price_list where owner_id = (select auth.uid());
  insert into public.price_list (owner_id, line_no, slug, treatment, description, detail, cost)
  select (select auth.uid()), i.ord::integer, i.item->>'slug', i.item->>'treatment',
         coalesce(i.item->>'description', ''), coalesce(i.item->>'detail', ''), i.item->>'cost'
  from jsonb_array_elements(p_items) with ordinality as i(item, ord);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_price_list(jsonb) from public, anon;
grant execute on function public.replace_price_list(jsonb) to authenticated;

commit;
