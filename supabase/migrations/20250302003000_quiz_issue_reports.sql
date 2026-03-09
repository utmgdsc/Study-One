-- ============================================================
-- Quiz issue reports
-- Users can report incorrect or low-quality quiz questions.
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

create table if not exists public.quiz_issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  options jsonb not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.quiz_issue_reports enable row level security;

drop policy if exists "Users can read own quiz reports" on public.quiz_issue_reports;
create policy "Users can read own quiz reports"
  on public.quiz_issue_reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own quiz reports" on public.quiz_issue_reports;
create policy "Users can insert own quiz reports"
  on public.quiz_issue_reports for insert
  with check (auth.uid() = user_id);

create index if not exists quiz_issue_reports_user_created_idx
  on public.quiz_issue_reports (user_id, created_at desc);

comment on table public.quiz_issue_reports is 'User-submitted reports about quiz issues or incorrect answers.';

