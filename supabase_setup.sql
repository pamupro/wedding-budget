-- ================================================================
--  WeddingLedger — Full Supabase SQL Setup
--  Run this ENTIRE file in Supabase SQL Editor
--  Project → SQL Editor → New Query → Paste All → Run
-- ================================================================

-- 1. PROFILES (one per couple/account)
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique not null references auth.users(id) on delete cascade,
  name1        text not null default '',
  name2        text not null default '',
  wedding_date date,
  email        text not null default '',
  created_at   timestamptz default now()
);

-- 2. VENDORS (scoped to user)
create table if not exists vendors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null default '',
  icon         text not null default '💒',
  name         text not null default '',
  total_cost   numeric(12,2) not null default 0,
  notes        text not null default '',
  due_date     date,
  due_amount   numeric(12,2),
  due_note     text not null default '',
  created_at   timestamptz default now()
);

-- 3. PAYMENTS (every single payment, scoped to user)
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  vendor_id      uuid not null references vendors(id) on delete cascade,
  amount         numeric(12,2) not null,
  payment_date   date not null,
  method         text not null default 'Cash',
  note           text not null default '',
  created_at     timestamptz default now()
);

-- 4. TASKS / CHECKLIST (scoped to user)
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  text         text not null,
  done         boolean not null default false,
  created_at   timestamptz default now()
);

-- 5. SETTINGS (spend limit, notes, share token, etc.)
create table if not exists settings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  key          text not null,
  value        text not null default '',
  updated_at   timestamptz default now(),
  unique(user_id, key)
);

-- ================================================================
--  ROW LEVEL SECURITY — each user sees only their own data
-- ================================================================

alter table profiles  enable row level security;
alter table vendors   enable row level security;
alter table payments  enable row level security;
alter table tasks     enable row level security;
alter table settings  enable row level security;

-- PROFILES: users see only their own profile
create policy "profiles_own" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Allow share page (anon) to read profiles by user_id (for name display)
create policy "profiles_share_read" on profiles
  for select using (true);

-- VENDORS: users see only their own
create policy "vendors_own" on vendors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Allow anon read for share page
create policy "vendors_share_read" on vendors
  for select using (true);

-- PAYMENTS: users see only their own
create policy "payments_own" on payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Allow anon read for share page
create policy "payments_share_read" on payments
  for select using (true);

-- TASKS: users see only their own
create policy "tasks_own" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- SETTINGS: users see only their own (anon can read for share token validation)
create policy "settings_own" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "settings_share_read" on settings
  for select using (true);

-- ================================================================
--  Done! Your database is ready for WeddingLedger.
-- ================================================================
