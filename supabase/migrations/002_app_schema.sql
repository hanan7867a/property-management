-- Kiraya Hisab: schema used by the app (lib/shared-demo-store.ts + lib/supabase-state.ts).
-- Run this once in the Supabase dashboard -> SQL Editor. It REPLACES the tables from 001
-- (demo data only). The app seeds itself from lib/mock-data.ts on first load when empty.
--
-- NOTE: the app has no Supabase Auth yet (login is a demo account picker), so these policies
-- let the publishable/anon key read and write everything. Tighten them when real auth is added.

drop table if exists public.payments cascade;
drop table if exists public.rent_entries cascade;
drop table if exists public.tenants cascade;
drop table if exists public.units cascade;
drop table if exists public.expenses cascade;
drop table if exists public.owner_payments cascade;
drop table if exists public.documents cascade;
drop table if exists public.notifications cascade;
drop table if exists public.activity_log cascade;
drop table if exists public.plazas cascade;
drop table if exists public.owner_accounts cascade;
drop table if exists public.owners cascade;
drop table if exists public.users cascade;

create table public.plazas (
  id text primary key,
  name text not null,
  address text not null,
  floors integer not null,
  ownership jsonb not null,
  photo_seed text not null default ''
);

create table public.units (
  id text primary key,
  plaza_id text not null,
  number text not null,
  type text not null,
  type_name text,
  floor integer not null,
  size_sqft integer not null default 0,
  monthly_rent integer not null default 0,
  status text not null,
  tenant_id text,
  notes text,
  vacant_since text
);

create table public.tenants (
  id text primary key,
  name text not null,
  phone text not null default '',
  cnic text not null default '',
  cnic_front_url text,
  cnic_back_url text,
  agreement_url text,
  unit_id text not null,
  monthly_rent integer,
  advance integer not null default 0,
  tenancy_period_months integer,
  note text,
  agreement_start text not null,
  agreement_end text,
  rent_increase jsonb,
  status text not null,
  vacated_at text
);

create table public.rent_entries (
  id text primary key,
  unit_id text not null,
  tenant_id text not null,
  plaza_id text not null,
  month text not null,
  due_amount integer not null,
  status text not null,
  carried_forward integer not null default 0
);
create index rent_entries_plaza_month on public.rent_entries (plaza_id, month);

create table public.payments (
  id text primary key,
  rent_entry_id text not null,
  amount integer not null,
  date text not null,
  method text not null,
  received_by text,
  reference text,
  receipt_url text,
  status text not null,
  cancel_reason text
);
create index payments_rent_entry on public.payments (rent_entry_id);

create table public.expenses (
  id text primary key,
  plaza_id text not null,
  unit_id text,
  category text not null,
  amount integer not null,
  date text not null,
  description text not null,
  bill_url text not null default '',
  payment_status text,
  payment_method text,
  paid_by text,
  paid_from text,
  status text not null,
  charge_to jsonb not null,
  owner_reason text,
  cancel_reason text,
  rejection_reason text,
  recorded_by text
);
create index expenses_plaza_date on public.expenses (plaza_id, date);

create table public.owner_payments (
  id text primary key,
  month text not null,
  plaza_id text not null,
  owner_id text not null,
  account_number text,
  amount_due integer not null,
  amount_sent integer not null,
  system_calculated_amount integer,
  sent_by text,
  status text not null,
  date text,
  bank_name text,
  sending_bank_name text,
  sending_account_number text,
  recipient_bank_name text,
  transaction_id text,
  receipt_url text,
  payment_method text,
  payment_proof_url text,
  notes text,
  statement_number text,
  difference_reason text,
  dispute_reason text,
  confirmed_at text,
  cancel_reason text
);

create table public.documents (
  id text primary key,
  title text not null,
  type text not null,
  plaza_id text,
  unit_id text,
  tenant_id text,
  uploaded_at text not null,
  end_date text,
  url text not null
);

create table public.notifications (
  id text primary key,
  type text not null,
  title text not null,
  body text not null,
  created_at text not null,
  read boolean not null default false,
  owner_id text,
  plaza_id text
);

create table public.activity_log (
  id text primary key,
  actor_id text not null,
  action text not null,
  entity text not null,
  plaza_id text,
  before_state jsonb,
  after_state jsonb,
  timestamp text not null
);

do $$
declare t text;
begin
  foreach t in array array[
    'plazas','units','tenants','rent_entries','payments','expenses',
    'owner_payments','documents','notifications','activity_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format(
      'create policy "app_full_access" on public.%I for all to anon, authenticated using (true) with check (true)', t
    );
  end loop;
end $$;
