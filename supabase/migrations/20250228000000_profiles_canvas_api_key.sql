-- ============================================================
-- Add Canvas API key to profiles (for future Canvas API calls).
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

alter table public.profiles
  add column if not exists canvas_api_key text;

comment on column public.profiles.canvas_api_key is 'User Canvas LMS API key (sensitive; consider encryption at rest for production).';
