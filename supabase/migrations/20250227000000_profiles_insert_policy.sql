-- ============================================================
-- Allow users to insert their own profile row (needed for upsert
-- when the row doesn't exist yet). Run in Supabase Dashboard → SQL Editor.
-- ============================================================

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);
