"use client";

import { useState, type FormEvent, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { updatePassword } from "@/lib/auth";

export default function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // After clicking the email link, Supabase sets the session; we might have user or recovery type in URL
  useEffect(() => {
    if (!loading && !user) {
      // Give Supabase a moment to parse hash (recovery link)
      const t = setTimeout(() => {}, 500);
      return () => clearTimeout(t);
    }
  }, [loading, user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setMessage({ type: "success", text: "Password updated. Redirecting…" });
      setTimeout(() => router.push("/profile"), 1500);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong. The link may have expired; request a new one.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-md text-center text-muted-foreground">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Set new password</h1>
        <p className="text-muted-foreground">
          Enter your new password below. If you didn’t come here from the email link, use{" "}
          <Link href="/profile/forgot-password" className="underline hover:no-underline">
            Forgot password
          </Link>{" "}
          first.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="mb-1 block text-sm font-medium">
              New password
            </label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-1 block text-sm font-medium">
              Confirm password
            </label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {message && (
            <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-green-600 dark:text-green-400"}>
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
        <Link href="/profile" className="inline-block text-sm text-muted-foreground underline hover:text-foreground">
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
