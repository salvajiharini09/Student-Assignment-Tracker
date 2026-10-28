-- Student Assignment Tracker schema
-- Run this in Supabase Dashboard -> SQL Editor for your own project.
-- RLS is enabled and policies intentionally deny direct anon/authenticated access.
-- The local Express server uses a backend-only service-role key, which bypasses RLS.
-- Do not expose that key, and do not deploy this unauthenticated API publicly.

create extension if not exists pgcrypto;

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title varchar(160) not null check (char_length(btrim(title)) between 1 and 160),
  subject varchar(100) not null check (char_length(btrim(subject)) between 1 and 100),
  due_date date not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  estimated_hours numeric(6,2) null check (estimated_hours is null or estimated_hours between 0 and 500),
  notes varchar(2000) null check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignments_due_date_idx on public.assignments (due_date asc);
create index if not exists assignments_status_idx on public.assignments (status);
create index if not exists assignments_priority_idx on public.assignments (priority);
create index if not exists assignments_created_at_idx on public.assignments (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();

alter table public.assignments enable row level security;
-- No anon/authenticated policies are created. RLS denies direct browser access.
-- For a multi-user production app, add Supabase Auth, an owner_id UUID foreign key
-- to auth.users, and owner-scoped SELECT/INSERT/UPDATE/DELETE policies.
