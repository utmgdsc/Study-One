-- ============================================================
-- Gamification schema: activity, XP, streaks, badges
-- Run this entire file in Supabase Dashboard → SQL Editor → New query.
-- ============================================================

-- 1. Badges catalog (static badge definitions)
create table if not exists public.badges (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  description text,
  icon_url text,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.badges is 'Static catalog of gamification badges.';
comment on column public.badges.slug is 'Stable, unique identifier for this badge (used in code).';
comment on column public.badges.xp_reward is 'XP awarded to the user when this badge is granted.';

-- Enable RLS for badges (public read-only catalog)
alter table public.badges enable row level security;

drop policy if exists "Anyone can read badges" on public.badges;
create policy "Anyone can read badges"
  on public.badges for select
  using (true);

comment on table public.badges is 'Static catalog of gamification badges.';
comment on column public.badges.slug is 'Stable, unique identifier for this badge (used in code).';
comment on column public.badges.xp_reward is 'XP awarded to the user when this badge is granted.';


-- 2. Per-user aggregate stats (XP, streaks, levels)
create table if not exists public.user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp_total integer not null default 0 check (xp_total >= 0),
  level integer not null default 1 check (level >= 1),
  current_streak_days integer not null default 0 check (current_streak_days >= 0),
  longest_streak_days integer not null default 0 check (longest_streak_days >= current_streak_days),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_stats is 'Per-user gamification aggregates: XP, level, streaks.';
comment on column public.user_stats.user_id is 'Matches auth.users.id; one row per user.';


-- 3. User activity log (raw events that drive XP/streaks)
create table if not exists public.user_activity (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

comment on table public.user_activity is 'Immutable log of user activities that can earn XP or affect streaks.';
comment on column public.user_activity.activity_type is 'Application-defined event type (e.g. session_completed, quiz_passed).';
comment on column public.user_activity.metadata is 'Optional JSON payload with extra context for the activity.';

create index if not exists idx_user_activity_user_id_occurred_at
  on public.user_activity (user_id, occurred_at desc);


-- 4. User ↔ Badge join table (which badges each user has)
create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id bigint not null references public.badges(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

comment on table public.user_badges is 'Badges granted to users.';

create index if not exists idx_user_badges_badge_id
  on public.user_badges (badge_id);


-- 5. Backfill: create a user_stats row for every existing auth user (idempotent)
insert into public.user_stats (user_id)
select u.id
from auth.users u
left join public.user_stats s on s.user_id = u.id
where s.user_id is null;


-- 6. RLS: users can read their own stats, activity, and badges
alter table public.user_stats enable row level security;
alter table public.user_activity enable row level security;
alter table public.user_badges enable row level security;

-- user_stats: allow users to read their own stats only.
drop policy if exists "Users can read own stats" on public.user_stats;
create policy "Users can read own stats"
  on public.user_stats for select
  using (auth.uid() = user_id);

-- user_activity: allow users to read their own activity only.
drop policy if exists "Users can read own activity" on public.user_activity;
create policy "Users can read own activity"
  on public.user_activity for select
  using (auth.uid() = user_id);

-- user_badges: allow users to read their own badges only.
drop policy if exists "Users can read own badges" on public.user_badges;
create policy "Users can read own badges"
  on public.user_badges for select
  using (auth.uid() = user_id);


-- 7. Signup hook: auto-create user_stats row on auth.users insert
--    (extends existing public.handle_new_user used by on_auth_user_created trigger)
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
  -- Create profile row (existing behavior)
  insert into public.profiles (id, email, first_name, last_name, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'email', new.email),
    nullif(fname, ''),
    nullif(lname, ''),
    coalesce(nullif(dname, ''), nullif(trim(fname || ' ' || lname), ''))
  );

  -- Create initial user_stats row for this user (idempotent)
  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;


-- 8. Keep updated_at current on updates for badges and user_stats
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists badges_set_updated_at on public.badges;
create trigger badges_set_updated_at
  before update on public.badges
  for each row execute function public.set_updated_at();

drop trigger if exists user_stats_set_updated_at on public.user_stats;
create trigger user_stats_set_updated_at
  before update on public.user_stats
  for each row execute function public.set_updated_at();


-- 9. Enforce snake_case naming for activity_type
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_activity_activity_type_format'
      and conrelid = 'public.user_activity'::regclass
  ) then
    alter table public.user_activity
      add constraint user_activity_activity_type_format
      check (activity_type ~ '^[a-z][a-z0-9_]*$');
  end if;
end;
$$;

