import { supabase } from "@/lib/supabase";

/** Matches `xp_for_level` in backend `services/gamification.py` / SQL. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) * (80 + 10 * level);
}

/** Matches `xp_to_level` in backend / SQL. */
export function xpToLevel(xpTotal: number): number {
  if (xpTotal <= 0) return 1;
  const level = Math.floor((-70 + Math.sqrt(8100 + 40 * xpTotal)) / 20);
  return Math.max(1, level);
}

export type StudyDashboardAnalytics = {
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  quizzesCompleted: number;
  flashcardSessionsCompleted: number;
  /** Rough estimate from activity counts (no per-session clock in DB). */
  estimatedStudyMinutes: number;
  /** Progress toward the next level, 0–100. */
  levelProgressPercent: number;
  xpIntoLevel: number;
  xpSpanToNext: number;
  nextLevel: number;
};

const MIN_PER_QUIZ = 4;
const MIN_PER_FLASHCARD_SESSION = 6;

function levelProgress(xpTotal: number): Pick<
  StudyDashboardAnalytics,
  "level" | "levelProgressPercent" | "xpIntoLevel" | "xpSpanToNext" | "nextLevel"
> {
  const level = xpToLevel(xpTotal);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  const into = Math.max(0, xpTotal - floor);
  const pct = Math.min(100, Math.round((into / span) * 100));
  return {
    level,
    levelProgressPercent: pct,
    xpIntoLevel: into,
    xpSpanToNext: span,
    nextLevel: level + 1,
  };
}

/**
 * Loads gamification + engagement metrics from Supabase (user_stats, user_activity).
 * Quizzes = rows with activity_type `quiz_attempt`; flashcard sessions = `flashcard_session`.
 */
export async function fetchStudyDashboardAnalytics(userId: string): Promise<StudyDashboardAnalytics> {
  const [statsRes, quizCountRes, fcCountRes] = await Promise.all([
    supabase
      .from("user_stats")
      .select("xp_total, level, current_streak_days, longest_streak_days")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_activity")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("activity_type", "quiz_attempt"),
    supabase
      .from("user_activity")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("activity_type", "flashcard_session"),
  ]);

  if (statsRes.error) throw statsRes.error;
  if (quizCountRes.error && process.env.NODE_ENV === "development") {
    console.warn("[study-analytics] quiz count:", quizCountRes.error.message);
  }
  if (fcCountRes.error && process.env.NODE_ENV === "development") {
    console.warn("[study-analytics] flashcard count:", fcCountRes.error.message);
  }

  const row = statsRes.data as
    | {
        xp_total: number;
        level: number;
        current_streak_days: number;
        longest_streak_days: number;
      }
    | null;

  const totalXp = row?.xp_total ?? 0;
  const dbLevel = row?.level ?? xpToLevel(totalXp);
  const currentStreak = row?.current_streak_days ?? 0;
  const longestStreak = row?.longest_streak_days ?? 0;

  const quizzesCompleted = quizCountRes.error ? 0 : (quizCountRes.count ?? 0);
  const flashcardSessionsCompleted = fcCountRes.error ? 0 : (fcCountRes.count ?? 0);

  const estimatedStudyMinutes =
    quizzesCompleted * MIN_PER_QUIZ + flashcardSessionsCompleted * MIN_PER_FLASHCARD_SESSION;

  const prog = levelProgress(totalXp);
  // Prefer DB level when present; keep progress math from XP for consistency
  return {
    totalXp,
    level: dbLevel,
    currentStreak,
    longestStreak,
    quizzesCompleted,
    flashcardSessionsCompleted,
    estimatedStudyMinutes,
    levelProgressPercent: prog.levelProgressPercent,
    xpIntoLevel: prog.xpIntoLevel,
    xpSpanToNext: prog.xpSpanToNext,
    nextLevel: prog.nextLevel,
  };
}

export function formatStudyDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
