-- ============================================================
-- Level from XP: 100 for L2, then 120, 140, 160, 180, ... per level
-- Run after 20250302000001_xp_streak_engine.sql
-- ============================================================
-- Formula: Level 2 at 100 total XP, then +120 for L3, +140 for L4, +160 for L5, ...
--   (L2=100, L3=220, L4=360, L5=520, L6=700, ...)
--   xp_min_for_level(L) = (L-1)*(80 + 10*L)  for L >= 1
-- ============================================================

-- Returns level (>= 1) for a given total XP
create or replace function public.xp_to_level(p_xp_total integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select greatest(1, floor((-70 + sqrt(8100 + 40.0 * greatest(0, p_xp_total))) / 20)::integer);
$$;

comment on function public.xp_to_level(integer) is
  'Level from total XP. L2=100, then +120, +140, +160, +180, ... (L3=220, L4=360, L5=520).';


-- Update apply_activity to set level from new xp_total when activity is applied
create or replace function public.apply_activity(
  p_user_id uuid,
  p_activity_type text,
  p_xp_awarded integer,
  p_occurred_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  day_start timestamptz;
  day_end timestamptz;
  last_day_start timestamptz;
  s public.user_stats%rowtype;
  applied boolean := false;
  new_current integer;
  new_longest integer;
begin
  if p_xp_awarded < 0 then
    raise exception 'p_xp_awarded must be >= 0';
  end if;

  -- Normalize to UTC day boundaries for idempotency/streak rules
  day_start := (date_trunc('day', p_occurred_at at time zone 'utc') at time zone 'utc');
  day_end := day_start + interval '1 day';

  -- One activity of a given type per UTC day per user (race-safe)
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_activity_type || ':' || day_start::text, 0)
  );

  if exists (
    select 1
    from public.user_activity a
    where a.user_id = p_user_id
      and a.activity_type = p_activity_type
      and a.occurred_at >= day_start
      and a.occurred_at < day_end
    limit 1
  ) then
    applied := false;
  else
    insert into public.user_activity (user_id, activity_type, xp_awarded, metadata, occurred_at)
    values (p_user_id, p_activity_type, p_xp_awarded, p_metadata, p_occurred_at);
    applied := true;
  end if;

  -- Ensure stats row exists (safety net; should already be created on signup)
  insert into public.user_stats (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into s
  from public.user_stats
  where user_id = p_user_id
  for update;

  -- Streak logic (MUST match services.gamification.compute_streak_update)
  if applied then
    if s.last_active_at is null then
      new_current := 1;
    else
      last_day_start := (date_trunc('day', s.last_active_at at time zone 'utc') at time zone 'utc');
      if last_day_start = day_start then
        new_current := greatest(s.current_streak_days, 1);
      elsif last_day_start = (day_start - interval '1 day') then
        new_current := greatest(s.current_streak_days, 0) + 1;
      else
        new_current := 1;
      end if;
    end if;

    new_longest := greatest(s.longest_streak_days, new_current);

    -- Update xp_total, level (from XP), streaks, last_active_at
    update public.user_stats
    set
      xp_total = xp_total + p_xp_awarded,
      level = public.xp_to_level(xp_total + p_xp_awarded),
      current_streak_days = new_current,
      longest_streak_days = new_longest,
      last_active_at = greatest(coalesce(last_active_at, p_occurred_at), p_occurred_at),
      updated_at = now()
    where user_id = p_user_id
    returning *
    into s;
  end if;

  return jsonb_build_object(
    'applied', applied,
    'xp_awarded', case when applied then p_xp_awarded else 0 end,
    'user_stats', to_jsonb(s)
  );
end;
$$;

-- Lock down execution
revoke all on function public.apply_activity(uuid, text, integer, timestamptz, jsonb) from public;
grant execute on function public.apply_activity(uuid, text, integer, timestamptz, jsonb) to service_role;


-- Backfill level for existing users (fix any row where level != xp_to_level(xp_total))
update public.user_stats
set level = public.xp_to_level(xp_total)
where level is distinct from public.xp_to_level(xp_total);
