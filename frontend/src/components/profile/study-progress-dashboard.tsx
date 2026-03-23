"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  fetchStudyDashboardAnalytics,
  formatStudyDuration,
  type StudyDashboardAnalytics,
} from "@/lib/study-analytics";
import { supabase } from "@/lib/supabase";

function StatBlock({
  label,
  value,
  sub,
  delayClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delayClass?: string;
}) {
  return (
    <div
      className={[
        "rounded-lg border border-border bg-card p-4 text-card-foreground fade-in",
        delayClass ?? "",
      ].join(" ")}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function StudyProgressDashboard({ userId }: { userId: string }) {
  const [data, setData] = React.useState<StudyDashboardAnalytics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchStudyDashboardAnalytics(userId);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  React.useEffect(() => {
    const channel = supabase
      .channel(`study-dashboard-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_stats", filter: `user_id=eq.${userId}` },
        () => {
          refresh().catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_activity", filter: `user_id=eq.${userId}` },
        () => {
          refresh().catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  if (loading && !data) {
    return (
      <section
        aria-label="Study progress"
        className="rounded-xl border border-border bg-card p-6 sm:p-8"
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm">Loading analytics…</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Study progress"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8"
      >
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Retry
        </button>
      </section>
    );
  }

  const d = data!;
  const topicMasteryPct = Math.min(100, Math.round((d.totalXp / 500) * 100));

  return (
    <section aria-label="Study progress" className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Study progress</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            XP, streaks, quiz completions, and estimated time from your account activity.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-right">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          ) : null}
          <span>
            Level {d.level} · {d.totalXp.toLocaleString()} XP
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatBlock
          label="Total XP"
          value={d.totalXp.toLocaleString()}
          sub="From quizzes and flashcards"
          delayClass="delay-1"
        />
        <StatBlock
          label="Day streak"
          value={d.currentStreak}
          sub="Consecutive active days"
          delayClass="delay-2"
        />
        <StatBlock
          label="Quizzes completed"
          value={d.quizzesCompleted}
          sub="Recorded submissions"
          delayClass="delay-3"
        />
        <StatBlock
          label="Study time (est.)"
          value={formatStudyDuration(d.estimatedStudyMinutes)}
          sub={`${d.flashcardSessionsCompleted} flashcard session${d.flashcardSessionsCompleted === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/50 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Level progress</h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              Level {d.level} → {d.nextLevel}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {d.xpIntoLevel.toLocaleString()} / {d.xpSpanToNext.toLocaleString()} XP this level
            </span>
            <span className="tabular-nums font-medium text-foreground">{d.levelProgressPercent}%</span>
          </div>
          <div
            className="mt-2 h-2.5 w-full overflow-hidden rounded-sm bg-muted"
            role="progressbar"
            aria-valuenow={d.levelProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress toward next level"
          >
            <div
              className="h-full rounded-sm bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${d.levelProgressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground sm:text-xs">
            Total XP sets your level; complete quizzes and flashcard sessions to advance.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Topic mastery</h3>
            <span className="text-xs tabular-nums text-muted-foreground">{topicMasteryPct}%</span>
          </div>
          <div className="mb-2 text-xs text-muted-foreground">
            Overall progress toward 500 XP on this scale.
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-sm bg-muted"
            role="progressbar"
            aria-valuenow={topicMasteryPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Topic mastery based on total XP"
          >
            <div
              className="h-full rounded-sm bg-foreground/25 transition-[width] duration-500"
              style={{ width: `${topicMasteryPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground sm:text-xs">
            Per-topic bars can be added when courses are tagged.
          </p>
        </div>
      </div>

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Longest streak: <span className="font-medium text-foreground">{d.longestStreak}</span> days
      </p>
    </section>
  );
}
