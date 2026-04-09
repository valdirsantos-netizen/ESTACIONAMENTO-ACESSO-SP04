create extension if not exists "pgcrypto";

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  plate text not null,
  name text not null,
  status text not null default 'Liberado',
  created_at timestamptz not null default now()
);

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  plate text not null,
  name text not null,
  action text not null,
  result text not null,
  operator_name text,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;
alter table public.access_logs enable row level security;

-- Policies simples para operação autenticada.
drop policy if exists "vehicles_select" on public.vehicles;
create policy "vehicles_select" on public.vehicles
for select to authenticated
using (true);

drop policy if exists "vehicles_insert" on public.vehicles;
create policy "vehicles_insert" on public.vehicles
for insert to authenticated
with check (true);

drop policy if exists "vehicles_update" on public.vehicles;
create policy "vehicles_update" on public.vehicles
for update to authenticated
using (true)
with check (true);

drop policy if exists "vehicles_delete" on public.vehicles;
create policy "vehicles_delete" on public.vehicles
for delete to authenticated
using (true);

drop policy if exists "access_select" on public.access_logs;
create policy "access_select" on public.access_logs
for select to authenticated
using (true);

drop policy if exists "access_insert" on public.access_logs;
create policy "access_insert" on public.access_logs
for insert to authenticated
with check (true);
