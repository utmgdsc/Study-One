-- ============================================================
-- Course list + per-course filtering for contribution heatmap.
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1) A per-user course list (names shown in the heatmap dropdown)
create table if not exists public.user_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_courses_name_nonempty check (char_length(trim(name)) > 0),
  constraint user_courses_user_name_unique unique (user_id, name)
);

alter table public.user_courses enable row level security;

drop policy if exists "Users can read own courses" on public.user_courses;
create policy "Users can read own courses"
  on public.user_courses for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own courses" on public.user_courses;
create policy "Users can insert own courses"
  on public.user_courses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own courses" on public.user_courses;
create policy "Users can update own courses"
  on public.user_courses for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own courses" on public.user_courses;
create policy "Users can delete own courses"
  on public.user_courses for delete
  using (auth.uid() = user_id);

create index if not exists user_courses_user_name_idx
  on public.user_courses (user_id, name);

comment on table public.user_courses is 'User-visible course list for filtering activity/heatmap.';

-- 2) Add optional course_id to contributions (NULL = all/unscoped contributions)
alter table public.user_daily_contributions
  add column if not exists course_id uuid references public.user_courses(id) on delete set null;

create index if not exists user_daily_contributions_user_course_date_idx
  on public.user_daily_contributions (user_id, course_id, date desc);

