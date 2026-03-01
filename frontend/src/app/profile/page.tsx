"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { signIn, signUp, signOut, updateUserName } from "@/lib/auth";
import { getProfile, updateProfile, getFullName, type Profile } from "@/lib/profile";

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
      <main className="min-h-screen p-6">
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
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-md space-y-6">
          <h1 className="text-2xl font-semibold">Profile</h1>
          <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
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
              <div>
                <span className="text-muted-foreground">Email</span>
                <p className="font-medium">{user.email ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">User ID</span>
                <p className="truncate font-mono text-xs text-muted-foreground">{user.id}</p>
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
    <main className="min-h-screen p-6">
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
