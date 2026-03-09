-- ============================================================
-- Daily user contribution counts for the profile heatmap.
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

create table if not exists public.user_daily_contributions (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date),
  constraint user_daily_contributions_count_nonnegative check (count >= 0)
);

alter table public.user_daily_contributions enable row level security;

drop policy if exists "Users can read own daily contributions" on public.user_daily_contributions;
create policy "Users can read own daily contributions"
  on public.user_daily_contributions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily contributions" on public.user_daily_contributions;
create policy "Users can insert own daily contributions"
  on public.user_daily_contributions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily contributions" on public.user_daily_contributions;
create policy "Users can update own daily contributions"
  on public.user_daily_contributions for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own daily contributions" on public.user_daily_contributions;
create policy "Users can delete own daily contributions"
  on public.user_daily_contributions for delete
  using (auth.uid() = user_id);

create index if not exists user_daily_contributions_user_date_idx
  on public.user_daily_contributions (user_id, date desc);

comment on table public.user_daily_contributions is 'Daily activity totals per user for contribution heatmap.';

