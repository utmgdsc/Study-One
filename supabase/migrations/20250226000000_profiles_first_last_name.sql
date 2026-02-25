-- ============================================================
-- Add first_name and last_name to profiles (sign-up now requires them).
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1. Add columns
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

-- 2. Trigger: set first_name, last_name, display_name from auth metadata
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

-- 3. Backfill first_name, last_name from auth metadata for existing users
update public.profiles p
set
  first_name = nullif(trim(u.raw_user_meta_data->>'first_name'), ''),
  last_name = nullif(trim(u.raw_user_meta_data->>'last_name'), ''),
  updated_at = now()
from auth.users u
where p.id = u.id
  and (u.raw_user_meta_data->>'first_name' is not null or u.raw_user_meta_data->>'last_name' is not null);

comment on column public.profiles.first_name is 'From sign-up; synced from auth user metadata.';
comment on column public.profiles.last_name is 'From sign-up; synced from auth user metadata.';
