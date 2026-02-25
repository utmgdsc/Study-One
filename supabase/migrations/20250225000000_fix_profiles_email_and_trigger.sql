-- ============================================================
-- Fix: profile email was null because trigger used raw_user_meta_data
-- (email/password signups store email in auth.users.email, not metadata).
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1. Trigger: use auth.users.email (canonical) with fallback to raw_user_meta_data for OAuth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'email', new.email),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$;

-- 2. Backfill: set profile.email from auth.users where it's currently null
update public.profiles p
set email = u.email,
    updated_at = now()
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '')
  and u.email is not null;
