-- ============================================================
-- Run this entire file in Supabase Dashboard → SQL Editor → New query
-- Then click "Run". This creates public.profiles (not auth.users).
-- ============================================================

-- 1. Create the profiles table (public schema, separate from auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  display_name text,
  canvas_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Trigger: auto-create a profile row when a NEW user signs up (email, first_name, last_name, display_name)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  fname text := trim(coalesce(new.raw_user_meta_data->>'first_name', ''));
  lname text := trim(coalesce(new.raw_user_meta_data->>'last_name', ''));
  dname text := trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', ''));
begin
  insert into public.profiles (id, email, first_name, last_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'email', new.email),
    nullif(fname, ''),
    nullif(lname, ''),
    coalesce(nullif(dname, ''), nullif(trim(fname || ' ' || lname), ''))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Backfill: add a profile row for every existing user in auth.users
insert into public.profiles (id, email, first_name, last_name, display_name, created_at, updated_at)
select
  id,
  email,
  nullif(trim(raw_user_meta_data->>'first_name'), ''),
  nullif(trim(raw_user_meta_data->>'last_name'), ''),
  coalesce(
    nullif(trim(coalesce(raw_user_meta_data->>'display_name', raw_user_meta_data->>'name')), ''),
    nullif(trim(trim(coalesce(raw_user_meta_data->>'first_name', '')) || ' ' || trim(coalesce(raw_user_meta_data->>'last_name', ''))), '')
  ),
  created_at,
  updated_at
from auth.users
on conflict (id) do update set
  email = excluded.email,
  first_name = coalesce(public.profiles.first_name, excluded.first_name),
  last_name = coalesce(public.profiles.last_name, excluded.last_name),
  display_name = coalesce(public.profiles.display_name, excluded.display_name),
  updated_at = now();

-- 4. RLS: users can read/update their own profile only
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

comment on table public.profiles is 'User profile data; one row per auth user.';
comment on column public.profiles.first_name is 'From sign-up; synced from auth user metadata.';
comment on column public.profiles.last_name is 'From sign-up; synced from auth user metadata.';
comment on column public.profiles.canvas_api_key is 'User Canvas LMS API key (sensitive; consider encryption at rest for production).';
