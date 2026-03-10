-- ============================================================
-- Badge Trigger System 4.3: seed badge catalog
-- Run after gamification_schema. Badge conditions evaluated in backend.
-- ============================================================

insert into public.badges (slug, name, description, xp_reward)
values
  ('getting_started', 'Getting started', 'You''re on your way! Complete quizzes and flashcards to earn more badges.', 0),
  ('first_xp', 'First XP', 'Earn your first XP by completing a quiz or flashcard session.', 0),
  ('50_xp', '50 XP', 'Reach 50 total XP from quizzes and flashcards.', 0),
  ('100_xp', '100 XP', 'Reach 100 total XP.', 0),
  ('500_xp', '500 XP', 'Reach 500 total XP.', 0),
  ('streak_7', '7-day streak', 'Study at least one day for 7 days in a row.', 0),
  ('streak_14', '14-day streak', 'Keep a 14-day study streak.', 0),
  ('streak_30', '30-day streak', 'Maintain a 30-day study streak.', 0),
  ('consistency_14', 'Consistency', 'Your longest streak reached 14 days.', 0),
  ('on_a_roll_30', 'On a roll', 'Your longest streak reached 30 days.', 0),
  ('scholar_1000', 'Scholar', 'Reach 1,000 total XP.', 0),
  ('mastery_5000', 'Mastery', 'Reach 5,000 total XP.', 0),
  ('legend_10000', 'Legend', 'Reach 10,000 total XP.', 0)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();
