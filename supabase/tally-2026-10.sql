-- Send to Tally (owner, 19 Oct 2026): Clinic OS writes a file Tally imports in one step, so payments are
-- not typed twice. Kept per dentist: his Tally ledger names (Tally refuses a file whose ledger names don't
-- match exactly), one entry per payment or one per day, and which payments the last "new payments" file
-- covered (by when they were recorded), so the next file holds only new ones.
-- Additive and safe to run twice. Folded into supabase/schema.sql.

begin;

create table if not exists public.tally_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cash_ledger text not null check (char_length(cash_ledger) between 1 and 100),
  bank_ledger text not null check (char_length(bank_ledger) between 1 and 100),
  income_ledger text not null check (char_length(income_ledger) between 1 and 100),
  entries text not null default 'payment' check (entries in ('payment', 'day')),
  sent_from timestamptz,  -- the last "new payments" file: payments recorded after this…
  sent_until timestamptz, -- …up to this moment
  updated_at timestamptz not null default now()
);

alter table public.tally_settings enable row level security;

drop policy if exists "Owner full access" on public.tally_settings;
create policy "Owner full access" on public.tally_settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.tally_settings from anon;
grant select, insert, update, delete on public.tally_settings to authenticated;

create or replace trigger tally_settings_set_updated_at
  before update on public.tally_settings
  for each row execute function public.set_updated_at();

commit;
