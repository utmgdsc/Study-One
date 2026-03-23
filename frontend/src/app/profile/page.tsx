"use client";

import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { signIn, signUp, signOut, updateUserName } from "@/lib/auth";
import { getProfile, updateProfile, getFullName, type Profile } from "@/lib/profile";
import { ContributionHeatmap } from "@/components/profile/contribution-heatmap";
import { StudyProgressDashboard } from "@/components/profile/study-progress-dashboard";
import { supabase } from "@/lib/supabase";
import { fetchContributionStats, type ContributionStats } from "@/lib/contribution-stats";

function ProfileNameForm({
  initialFirst,
  initialLast,
  onSave,
  onCancel,
  busy,
}: {
  initialFirst: string;
  initialLast: string;
  onSave: (first: string, last: string) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  useEffect(() => {
    setFirst(initialFirst);
    setLast(initialLast);
  }, [initialFirst, initialLast]);
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSave(first, last);
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="profile-edit-first-name" className="mb-1 block text-sm font-medium text-muted-foreground">
          First name <span className="text-destructive">*</span>
        </label>
        <input
          id="profile-edit-first-name"
          type="text"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          required
          autoComplete="given-name"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label htmlFor="profile-edit-last-name" className="mb-1 block text-sm font-medium text-muted-foreground">
          Last name <span className="text-destructive">*</span>
        </label>
        <input
          id="profile-edit-last-name"
          type="text"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          required
          autoComplete="family-name"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

/** Placeholder graphic for badge (medal shape). Use currentColor so parent can style it. */
function BadgePlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="10" r="6" />
      <path d="M12 16v4M9 20h6" />
      <path d="M8 6L7 4h2l1 2M16 6l1-2h2l-1 2" />
    </svg>
  );
}

function BadgePopup({
  badge,
  onClose,
}: {
  badge: BadgeDef;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const modal = (
    <>
      <style>{`
        @keyframes badge-modal-enter {
          from {
            opacity: 0;
            transform: perspective(1000px) rotateX(16deg) translateY(36px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: perspective(1000px) rotateX(0deg) translateY(0) scale(1);
          }
        }
      `}</style>
      {/* Strong dim + blur so the glass modal pops */}
      <div
        className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md sm:backdrop-blur-lg"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="pointer-events-none fixed inset-0 z-[205] flex items-center justify-center p-4 sm:p-6"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="badge-popup-title"
          onClick={(e) => e.stopPropagation()}
          className="badge-modal-panel pointer-events-auto w-[min(92vw,380px)] [animation:badge-modal-enter_0.55s_cubic-bezier(0.22,1,0.36,1)_forwards] [transform-style:preserve-3d]"
        >
          <div
            className={[
              "relative overflow-hidden rounded-2xl border border-white/30",
              "bg-card/95 backdrop-blur-xl",
              "text-card-foreground",
              "ring-1 ring-white/15",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.12),0_32px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(0,0,0,0.2)]",
              "p-5 sm:p-6",
            ].join(" ")}
          >
            <span
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-primary/5"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent opacity-80"
              aria-hidden
            />
            {/* “Plaque” — the badge as a floating glass object */}
            <div className="relative mb-5 flex justify-center [perspective:600px]">
              <div
                className={[
                  "relative flex aspect-square w-[min(72vw,200px)] items-center justify-center rounded-2xl",
                  "border border-white/30 bg-gradient-to-br from-white/15 to-background/40",
                  "backdrop-blur-md",
                  "shadow-[inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-2px_8px_rgba(0,0,0,0.2),0_12px_40px_rgba(15,23,42,0.45)]",
                  "[transform:rotateX(8deg)_translateZ(12px)]",
                ].join(" ")}
              >
                <span
                  className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-primary/15 to-transparent"
                  aria-hidden
                />
                <BadgePlaceholderIcon className="relative z-10 h-[52%] w-[52%] text-primary drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <h3 id="badge-popup-title" className="relative text-center text-lg font-semibold tracking-tight">
              {badge.name}
            </h3>
            <p className="relative mt-3 text-center text-sm leading-relaxed text-muted-foreground">
              {badge.description}
            </p>
            <div className="relative mt-6 flex justify-center">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/20 bg-background/50 px-5 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-background/80 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function formatDayLabel(daysFromToday: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

type BadgeDef = { name: string; description: string; earned: (stats: ContributionStats | null) => boolean };
const BADGES: BadgeDef[] = [
  {
    name: "Getting started",
    description: "You're on your way! Complete quizzes and flashcards to earn more badges.",
    earned: (stats) => (stats?.totalXp ?? 0) >= 0,
  },
  {
    name: "First XP",
    description: "Earn your first XP by completing a quiz or flashcard session.",
    earned: (stats) => (stats?.totalXp ?? 0) > 0,
  },
  {
    name: "50 XP",
    description: "Reach 50 total XP from quizzes and flashcards.",
    earned: (stats) => (stats?.totalXp ?? 0) >= 50,
  },
  {
    name: "100 XP",
    description: "Reach 100 total XP.",
    earned: (stats) => (stats?.totalXp ?? 0) >= 100,
  },
  {
    name: "500 XP",
    description: "Reach 500 total XP.",
    earned: (stats) => (stats?.totalXp ?? 0) >= 500,
  },
  {
    name: "7-day streak",
    description: "Study at least one day for 7 days in a row.",
    earned: (stats) => (stats?.currentStreak ?? 0) >= 7,
  },
  {
    name: "14-day streak",
    description: "Keep a 14-day study streak.",
    earned: (stats) => (stats?.currentStreak ?? 0) >= 14,
  },
  {
    name: "30-day streak",
    description: "Maintain a 30-day study streak.",
    earned: (stats) => (stats?.currentStreak ?? 0) >= 30,
  },
  {
    name: "Consistency",
    description: "Your longest streak reached 14 days.",
    earned: (stats) => (stats?.longestStreak ?? 0) >= 14,
  },
  {
    name: "On a roll",
    description: "Your longest streak reached 30 days.",
    earned: (stats) => (stats?.longestStreak ?? 0) >= 30,
  },
  {
    name: "Scholar",
    description: "Reach 1,000 total XP.",
    earned: (stats) => (stats?.totalXp ?? 0) >= 1000,
  },
  {
    name: "Mastery",
    description: "Reach 5,000 total XP.",
    earned: (stats) => (stats?.totalXp ?? 0) >= 5000,
  },
  {
    name: "Legend",
    description: "Reach 10,000 total XP.",
    earned: (stats) => (stats?.totalXp ?? 0) >= 10000,
  },
];

function FullScreenModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-0 bg-background text-foreground"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<{ title: string; cards: number } | null>(null);
  const [pastQuizzesViewAllOpen, setPastQuizzesViewAllOpen] = useState(false);
  const [pastFlashcardsViewAllOpen, setPastFlashcardsViewAllOpen] = useState(false);
  const [stats, setStats] = useState<ContributionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [badgePopup, setBadgePopup] = useState<BadgeDef | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    getProfile(user.id)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`profile-data-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        () => {
          getProfile(user.id)
            .then(setProfile)
            .catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setStats(null);
      setStatsLoading(false);
      return;
    }

    let cancelled = false;
    const userId = user.id;
    async function refresh() {
      setStatsLoading(true);
      try {
        const next = await fetchContributionStats(userId);
        if (!cancelled) setStats(next);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    refresh().catch(() => {});

    const channel = supabase
      .channel(`profile-stats-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_daily_contributions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refresh().catch(() => {});
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage({ type: "error", text: "Email is required." });
      return;
    }
    if (!password) {
      setMessage({ type: "error", text: "Password is required." });
      return;
    }
    if (mode === "signup") {
      const first = firstName.trim();
      const last = lastName.trim();
      if (!first || !last) {
        setMessage({ type: "error", text: "First name and last name are required." });
        return;
      }
      if (password.length < 6) {
        setMessage({ type: "error", text: "Password must be at least 6 characters." });
        return;
      }
      if (password !== confirmPassword) {
        setMessage({ type: "error", text: "Passwords do not match." });
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(trimmedEmail, password);
        setMessage({ type: "success", text: "Signed in." });
      } else {
        await signUp(trimmedEmail, password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        setMessage({ type: "success", text: "Check your email to confirm your account." });
      }
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestLogin() {
    if (process.env.NODE_ENV === "production") {
      setMessage({
        type: "error",
        text: "Test login is only available in non-production environments.",
      });
      return;
    }
    const testEmail = process.env.NEXT_PUBLIC_TEST_USER_EMAIL;
    const testPassword = process.env.NEXT_PUBLIC_TEST_USER_PASSWORD;
    if (!testEmail?.trim() || !testPassword?.trim()) {
      setMessage({
        type: "error",
        text: "Test user not configured. Set NEXT_PUBLIC_TEST_USER_EMAIL and NEXT_PUBLIC_TEST_USER_PASSWORD in .env.local",
      });
      return;
    }
    setMessage(null);
    setBusy(true);
    try {
      await signIn(testEmail, testPassword);
      setMessage({ type: "success", text: "Signed in with test account." });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const hint =
        /invalid login credentials/i.test(raw) || /invalid credentials/i.test(raw)
          ? " Check: (1) User exists in Supabase Auth → Users. (2) When adding the user, enable 'Auto Confirm User' so email confirmation isn’t required."
          : "";
      setMessage({
        type: "error",
        text: raw + hint,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage(null);
    try {
      await signOut();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to sign out.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="mx-auto max-w-md text-center text-muted-foreground">
          Loading…
        </div>
      </main>
    );
  }

  if (user) {
    const fullNameFromMeta = (() => {
      const first = user.user_metadata?.first_name ?? "";
      const last = user.user_metadata?.last_name ?? "";
      const full = user.user_metadata?.display_name ?? user.user_metadata?.name;
      if (full && typeof full === "string" && full.trim()) return full.trim();
      return [first, last].filter(Boolean).join(" ").trim();
    })();
    const displayFullName = getFullName(profile) || fullNameFromMeta || "—";
    const initialFirst = (profile?.first_name ?? user.user_metadata?.first_name ?? "").trim() ||
      (typeof fullNameFromMeta === "string" && fullNameFromMeta !== "—" ? fullNameFromMeta.split(/\s+/)[0] ?? "" : "");
    const initialLast = (profile?.last_name ?? user.user_metadata?.last_name ?? "").trim() ||
      (typeof fullNameFromMeta === "string" && fullNameFromMeta !== "—" ? fullNameFromMeta.split(/\s+/).slice(1).join(" ") : "");

    return (
      <main className="min-h-screen p-3 sm:p-6">
        <div className="mx-auto w-full max-w-5xl min-w-0 space-y-8 pb-10 sm:space-y-10">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">Study dashboard</h1>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Track your points, streaks, and study progress across quizzes and flashcards.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground sm:text-sm">
              <span>{user.email ?? "Current student"}</span>
            </div>
          </header>
          <div className="card-hover fade-in rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4">
            {/* Name row: full name + edit icon */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Name</span>
                {!editingName && (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Edit name"
                  >
                    <EditIcon />
                  </button>
                )}
              </div>
              {editingName ? (
                <ProfileNameForm
                  initialFirst={initialFirst}
                  initialLast={initialLast}
                  onSave={async (first, last) => {
                    setMessage(null);
                    const f = first.trim();
                    const l = last.trim();
                    if (!f || !l) {
                      setMessage({ type: "error", text: "First name and last name are required." });
                      return;
                    }
                    setBusy(true);
                    try {
                      await updateUserName(f, l);
                      await updateProfile(user.id, {
                        first_name: f,
                        last_name: l,
                        display_name: [f, l].filter(Boolean).join(" "),
                        email: user.email ?? undefined,
                      });
                      const next = await getProfile(user.id);
                      setProfile(next);
                      setEditingName(false);
                      setMessage({ type: "success", text: "Name updated." });
                    } catch (err) {
                      setMessage({
                        type: "error",
                        text: err instanceof Error ? err.message : String(err),
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                  onCancel={() => setEditingName(false)}
                  busy={busy}
                />
              ) : (
                <p className="font-medium">{displayFullName}</p>
              )}
            </div>

            {profileLoading && (
              <p className="text-xs text-muted-foreground">Loading profile…</p>
            )}
            <div className="mt-4 space-y-2 text-sm">
              <div className="min-w-0">
                <span className="text-muted-foreground">Email</span>
                <p className="truncate font-medium">{user.email ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">User ID</span>
                <p className="truncate font-mono text-xs text-muted-foreground">{user.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Courses</span>
                <p className="text-sm text-muted-foreground">—</p>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={busy}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Sign out
              </button>
            </div>
          </div>

          <section aria-label="Progress and activity" className="space-y-5 sm:space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Progress &amp; activity
            </h2>
            <StudyProgressDashboard userId={user.id} />
            <div className="min-w-0">
              <h3 className="mb-3 text-sm font-semibold">Contribution activity</h3>
              <ContributionHeatmap userId={user.id} />
            </div>
          </section>

          {/* Badges: full width, own section */}
          <section
            aria-label="Badges"
            className="card-hover fade-in rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5"
          >
              <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
                <h2 className="text-base font-semibold">Badges</h2>
              </div>
              <p className="mb-3 text-[11px] text-muted-foreground sm:text-xs">
                Tap a badge to open a detailed view.
              </p>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 lg:grid-cols-10">
                {BADGES.map((b) => {
                  const earned = b.earned(stats);
                  return earned ? (
                    <button
                      key={b.name}
                      type="button"
                      title={b.name}
                      onClick={() => setBadgePopup(b)}
                      className={[
                        "aspect-square rounded-lg border border-border",
                        "flex items-center justify-center overflow-hidden",
                        "bg-primary text-primary-foreground shadow-sm",
                        "transition-transform hover:scale-105 hover:opacity-95",
                        "focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring",
                      ].join(" ")}
                    >
                      <BadgePlaceholderIcon className="h-[60%] w-[60%]" />
                    </button>
                  ) : (
                    <div
                      key={b.name}
                      title="Badges will appear here"
                      className={[
                        "aspect-square rounded-lg border border-dashed border-border",
                        "flex items-center justify-center overflow-hidden bg-muted/30 text-muted-foreground",
                      ].join(" ")}
                    >
                      <BadgePlaceholderIcon className="h-[50%] w-[50%] opacity-50" />
                    </div>
                  );
                })}
              </div>
              {badgePopup && (
                <BadgePopup
                  badge={badgePopup}
                  onClose={() => setBadgePopup(null)}
                />
              )}
              <p className="mt-2 text-[11px] text-muted-foreground sm:mt-3 sm:text-xs">
                Badges will be unlocked from quizzes, flashcards, streaks, and XP milestones.
              </p>
          </section>

          {/* History shortcuts */}
          <section aria-label="Study history" className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              History
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4">
            <section className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4">
              <h3 className="mb-1.5 text-sm font-semibold sm:mb-2">Past quizzes</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                View all your previous quiz attempts.
              </p>
              <button
                type="button"
                onClick={() => setPastQuizzesViewAllOpen(true)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
              >
                View all
              </button>
            </section>
            <section className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm sm:p-4">
              <h3 className="mb-1.5 text-sm font-semibold sm:mb-2">Past flashcards</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                View all your flashcard decks and sessions.
              </p>
              <Link
                href="/flashcards"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
              >
                View all
              </Link>
            </section>
            </div>
          </section>
          <FullScreenModal
            open={pastQuizzesViewAllOpen}
            title="All past quizzes"
            onClose={() => setPastQuizzesViewAllOpen(false)}
          >
            <div className="mx-auto w-full max-w-3xl space-y-4">
              <p className="text-sm text-muted-foreground">
                No quizzes to show. Your quiz history will appear here once you complete some quizzes.
              </p>
              <ul className="space-y-2 text-sm">
                {/* Fetched quizzes will be listed here */}
              </ul>
            </div>
          </FullScreenModal>
          <FullScreenModal
            open={pastFlashcardsViewAllOpen}
            title="All past flashcards"
            onClose={() => setPastFlashcardsViewAllOpen(false)}
          >
            <div className="mx-auto w-full max-w-3xl space-y-4">
              <p className="text-sm text-muted-foreground">
                For a full gallery of your saved flashcard sets, head to the dedicated review page.
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/flashcards"
                    className="text-sm text-muted-foreground underline hover:text-foreground"
                  >
                    Open flashcard review page
                  </Link>
                </li>
              </ul>
            </div>
          </FullScreenModal>
          {message && (
            <p
              className={
                message.type === "error"
                  ? "text-sm text-destructive"
                  : "text-sm text-green-600 dark:text-green-400"
              }
            >
              {message.text}
            </p>
          )}
          <Link
            href="/"
            className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground">
          Sign in to save your study packs and keep them in your profile. You can
          still use Socrato without an account; progress just won’t be saved.
        </p>
        <form onSubmit={handleAuth} className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          {mode === "signup" && (
            <>
              <div>
                <label htmlFor="profile-first-name" className="mb-1 block text-sm font-medium">
                  First name <span className="text-destructive">*</span>
                </label>
                <input
                  id="profile-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="profile-last-name" className="mb-1 block text-sm font-medium">
                  Last name <span className="text-destructive">*</span>
                </label>
                <input
                  id="profile-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </>
          )}
          <div>
            <label htmlFor="profile-email" className="mb-1 block text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="profile-password" className="mb-1 block text-sm font-medium">
              Password <span className="text-destructive">*</span>
            </label>
            <input
              id="profile-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "signup" ? 6 : undefined}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {mode === "signup" && (
            <div>
              <label htmlFor="profile-confirm-password" className="mb-1 block text-sm font-medium">
                Confirm password <span className="text-destructive">*</span>
              </label>
              <input
                id="profile-confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="rounded border-input"
            />
            Show password
          </label>
          {message && (
            <p
              className={
                message.type === "error"
                  ? "text-sm text-destructive"
                  : "text-sm text-green-600 dark:text-green-400"
              }
            >
              {message.text}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {mode === "signin" ? "Sign in" : "Sign up"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === "signin" ? "signup" : "signin"));
                setMessage(null);
                setConfirmPassword("");
                setFirstName("");
                setLastName("");
              }}
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              {mode === "signin" ? "Create an account" : "Already have an account? Sign in"}
            </button>
            {mode === "signin" && (
              <Link
                href="/profile/forgot-password"
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Forgot password?
              </Link>
            )}
          </div>
          {process.env.NODE_ENV !== "production" &&
            process.env.NEXT_PUBLIC_TEST_USER_EMAIL &&
            process.env.NEXT_PUBLIC_TEST_USER_PASSWORD && (
            <div className="mt-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={handleTestLogin}
                disabled={busy}
                className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Test login
              </button>
            </div>
          )}
        </form>
        <Link
          href="/"
          className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
