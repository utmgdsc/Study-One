import { supabase } from "@/lib/supabase";

function localDateString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDate(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export type ContributionStats = {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
};

export async function fetchContributionStats(userId: string): Promise<ContributionStats> {
  // Pull enough history for realistic totals/streaks without exploding.
  // (Backends can later replace with a SQL view / RPC for performance.)
  const today = startOfLocalDay(new Date());
  const start = new Date(today.getFullYear() - 5, 0, 1); // last ~5 years

  const { data, error } = await supabase
    .from("user_daily_contributions")
    .select("date, count")
    .eq("user_id", userId)
    .gte("date", localDateString(start))
    .lte("date", localDateString(today))
    .order("date", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as Array<{ date: string; count: number }>;

  const totalXp = rows.reduce((acc, r) => acc + (Number(r.count) || 0), 0);

  // For streaks we only care about days with XP > 0
  const active = rows
    .filter((r) => (Number(r.count) || 0) > 0)
    .map((r) => r.date);

  const activeSet = new Set(active);

  // Current streak: count backward from today
  let currentStreak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDateString(d);
    if (activeSet.has(key)) currentStreak += 1;
    else break;
  }

  // Longest streak: iterate through sorted active days
  let longestStreak = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const dateStr of active) {
    const dt = startOfLocalDay(parseLocalDate(dateStr));
    if (!prev) {
      run = 1;
    } else {
      const diffDays = Math.round((dt.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
      run = diffDays === 1 ? run + 1 : 1;
    }
    prev = dt;
    if (run > longestStreak) longestStreak = run;
  }

  return { totalXp, currentStreak, longestStreak };
}

