-- Enable RLS
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- Users table
create table public.users (
  id text primary key,
  name text not null,
  role text not null check (role in ('admin', 'accountant', 'owner')),
  phone text not null,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.users enable row level security;

-- Owners table
create table public.owners (
  id text primary key,
  name text not null,
  phone text not null,
  bank text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.owners enable row level security;

-- Owner accounts table
create table public.owner_accounts (
  id text primary key,
  owner_id text not null references public.owners(id) on delete cascade,
  bank text not null,
  account_number text not null,
  account_name text,
  created_at timestamp with time zone default now()
);

alter table public.owner_accounts enable row level security;

-- Plazas table
create table public.plazas (
  id text primary key,
  name text not null,
  address text not null,
  floors integer not null,
  ownership_type text not null check (ownership_type in ('single', 'shared', 'rotation')),
  ownership_data jsonb not null,
  photo_seed text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.plazas enable row level security;

-- Units table
create table public.units (
  id text primary key,
  plaza_id text not null references public.plazas(id) on delete cascade,
  number text not null,
  type text not null check (type in ('flat', 'shop', 'office', 'other')),
  type_name text,
  floor integer not null,
  size_sqft integer not null,
  monthly_rent integer not null,
  status text not null check (status in ('occupied', 'vacant', 'soon-vacant')),
  tenant_id text,
  notes text,
  vacant_since text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.units enable row level security;

-- Tenants table
create table public.tenants (
  id text primary key,
  name text not null,
  phone text not null,
  cnic text not null,
  cnic_front_url text,
  cnic_back_url text,
  agreement_url text,
  unit_id text not null references public.units(id) on delete cascade,
  monthly_rent integer,
  advance integer not null,
  tenancy_period_months integer,
  note text,
  agreement_start text not null,
  agreement_end text,
  rent_increase_date text,
  rent_increase_amount integer,
  status text not null check (status in ('active', 'vacated')),
  vacated_at text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.tenants enable row level security;

-- Rent entries table
create table public.rent_entries (
  id text primary key,
  unit_id text not null references public.units(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete cascade,
  plaza_id text not null references public.plazas(id) on delete cascade,
  month text not null,
  due_amount integer not null,
  status text not null check (status in ('paid', 'partly-paid', 'unpaid', 'overdue', 'vacant')),
  carried_forward integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.rent_entries enable row level security;
create index rent_entries_plaza_month on public.rent_entries(plaza_id, month);

-- Payments table
create table public.payments (
  id text primary key,
  rent_entry_id text not null references public.rent_entries(id) on delete cascade,
  amount integer not null,
  date text not null,
  method text not null check (method in ('Cash', 'Bank Transfer', 'JazzCash', 'Easypaisa', 'Cheque')),
  received_by text,
  reference text,
  receipt_url text,
  status text not null check (status in ('active', 'cancelled')),
  cancel_reason text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.payments enable row level security;

-- Expenses table
create table public.expenses (
  id text primary key,
  plaza_id text not null references public.plazas(id) on delete cascade,
  unit_id text references public.units(id) on delete set null,
  category text not null check (category in ('Repairs', 'Electricity', 'Water', 'Gas', 'Cleaning', 'Guard', 'Tax', 'Maintenance', 'Legal', 'Security', 'Salaries', 'Property Tax', 'Other')),
  amount integer not null,
  date text not null,
  description text not null,
  bill_url text,
  payment_status text check (payment_status in ('paid', 'unpaid')),
  payment_method text check (payment_method in ('Cash', 'Bank Transfer', 'Cheque', 'Other')),
  paid_by text,
  paid_from text check (paid_from in ('rent', 'outside')),
  status text not null check (status in ('approved', 'pending-approval', 'rejected', 'cancelled', 'draft')),
  charge_to_type text not null check (charge_to_type in ('plaza', 'owner')),
  charge_to_owner_id text references public.owners(id),
  owner_reason text,
  cancel_reason text,
  rejection_reason text,
  recorded_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.expenses enable row level security;
create index expenses_plaza_date on public.expenses(plaza_id, date);

-- Owner payments table
create table public.owner_payments (
  id text primary key,
  month text not null,
  plaza_id text not null references public.plazas(id) on delete cascade,
  owner_id text not null references public.owners(id) on delete cascade,
  account_number text,
  amount_due integer not null,
  amount_sent integer not null,
  system_calculated_amount integer,
  sent_by text,
  status text not null check (status in ('not-sent', 'sent-awaiting-confirmation', 'confirmed-received', 'disputed', 'cancelled')),
  date text,
  bank_name text,
  sending_bank_name text,
  sending_account_number text,
  recipient_bank_name text,
  transaction_id text,
  receipt_url text,
  payment_method text check (payment_method in ('Bank Transfer', 'Cash', 'Cheque', 'Other')),
  payment_proof_url text,
  notes text,
  statement_number text,
  difference_reason text,
  dispute_reason text,
  confirmed_at text,
  cancel_reason text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.owner_payments enable row level security;
create index owner_payments_owner_month on public.owner_payments(owner_id, month);

-- Documents table
create table public.documents (
  id text primary key,
  title text not null,
  type text not null check (type in ('Agreement', 'CNIC', 'Property paper', 'Bill', 'Receipt', 'Other')),
  plaza_id text references public.plazas(id) on delete set null,
  unit_id text references public.units(id) on delete set null,
  tenant_id text references public.tenants(id) on delete set null,
  uploaded_at text not null,
  end_date text,
  url text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.documents enable row level security;

-- Notifications table
create table public.notifications (
  id text primary key,
  type text not null check (type in ('expense', 'owner-payment', 'agreement', 'rent', 'vacancy')),
  title text not null,
  body text not null,
  created_at timestamp with time zone default now(),
  read boolean default false,
  owner_id text references public.owners(id) on delete cascade,
  plaza_id text references public.plazas(id) on delete set null
);

alter table public.notifications enable row level security;

-- Activity log table
create table public.activity_log (
  id text primary key,
  actor_id text not null,
  action text not null,
  entity text not null,
  plaza_id text references public.plazas(id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  timestamp text not null,
  created_at timestamp with time zone default now()
);

alter table public.activity_log enable row level security;

-- RLS Policies for public read access to core data (will be restricted by app logic)
create policy "users_read_all" on public.users for select using (true);
create policy "owners_read_all" on public.owners for select using (true);
create policy "plazas_read_all" on public.plazas for select using (true);
create policy "units_read_all" on public.units for select using (true);
create policy "tenants_read_all" on public.tenants for select using (true);
create policy "rent_entries_read_all" on public.rent_entries for select using (true);
create policy "expenses_read_all" on public.expenses for select using (true);
create policy "owner_payments_read_all" on public.owner_payments for select using (true);
create policy "documents_read_all" on public.documents for select using (true);
create policy "notifications_read_all" on public.notifications for select using (true);

-- Insert demo data
insert into public.users (id, name, role, phone) values
  ('accountant-1', 'Accountant', 'accountant', '+92300000001'),
  ('accountant-2', 'Ali Raza', 'accountant', '+92300000002'),
  ('accountant-3', 'Bilal Ahmed', 'accountant', '+92300000003'),
  ('owner-1', 'Ahmad Malik', 'owner', '+92300001001'),
  ('owner-2', 'Fatima Khan', 'owner', '+92300001002'),
  ('owner-3', 'Hassan Ali', 'owner', '+92300001003');

insert into public.owners (id, name, phone, bank) values
  ('owner-1', 'Ahmad Malik', '+92300001001', 'HBL'),
  ('owner-2', 'Fatima Khan', '+92300001002', 'UBL'),
  ('owner-3', 'Hassan Ali', '+92300001003', 'MCB');

insert into public.plazas (id, name, address, floors, ownership_type, ownership_data, photo_seed) values
  ('plaza-1', 'Crescent Plaza', 'Blue Area, Islamabad', 5, 'single', '{"ownerId": "owner-1"}', 'plaza-1'),
  ('plaza-2', 'City Square', 'Mall Road, Lahore', 8, 'shared', '{"shares": [{"ownerId": "owner-1", "percent": 60}, {"ownerId": "owner-2", "percent": 40}]}', 'plaza-2'),
  ('plaza-3', 'Trade Center', 'Karachi Port', 6, 'rotation', '{"rotationOrder": ["owner-1", "owner-2", "owner-3"], "rotationStartMonth": "2026-01"}', 'plaza-3');

insert into public.units (id, plaza_id, number, type, floor, size_sqft, monthly_rent, status) values
  ('unit-1', 'plaza-1', '101', 'office', 1, 1200, 50000, 'occupied'),
  ('unit-2', 'plaza-1', '102', 'office', 1, 1200, 50000, 'occupied'),
  ('unit-3', 'plaza-2', '201', 'shop', 2, 800, 75000, 'occupied'),
  ('unit-4', 'plaza-2', '202', 'shop', 2, 800, 75000, 'vacant'),
  ('unit-5', 'plaza-3', '301', 'flat', 3, 2000, 40000, 'occupied');

insert into public.tenants (id, name, phone, cnic, unit_id, advance, agreement_start, status) values
  ('tenant-1', 'Ali Hassan', '+92300010001', '12345-6789012-3', 'unit-1', 100000, '2025-12-01', 'active'),
  ('tenant-2', 'Sara Khan', '+92300010002', '12345-6789013-4', 'unit-2', 100000, '2025-12-15', 'active'),
  ('tenant-3', 'Ahmed Raza', '+92300010003', '12345-6789014-5', 'unit-3', 150000, '2025-11-01', 'active'),
  ('tenant-4', 'Zainab Ali', '+92300010004', '12345-6789015-6', 'unit-5', 80000, '2025-12-01', 'active');

insert into public.rent_entries (id, unit_id, tenant_id, plaza_id, month, due_amount, status, carried_forward) values
  ('rent-1', 'unit-1', 'tenant-1', 'plaza-1', '2026-01', 50000, 'paid', 0),
  ('rent-2', 'unit-2', 'tenant-2', 'plaza-1', '2026-01', 50000, 'partly-paid', 0),
  ('rent-3', 'unit-3', 'tenant-3', 'plaza-2', '2026-01', 75000, 'unpaid', 0),
  ('rent-4', 'unit-5', 'tenant-4', 'plaza-3', '2026-01', 40000, 'paid', 0);

insert into public.expenses (id, plaza_id, category, amount, date, description, bill_url, status, charge_to_type, recorded_by) values
  ('exp-1', 'plaza-1', 'Repairs', 5000, '2026-01-05', 'Door repair', '', 'approved', 'plaza', 'accountant-1'),
  ('exp-2', 'plaza-2', 'Electricity', 8000, '2026-01-01', 'Monthly bill', '', 'approved', 'plaza', 'accountant-1');
