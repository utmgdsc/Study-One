"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a password reset link to <strong>{email}</strong>. Click the link in that email to set a new password.
          </p>
          <p className="text-sm text-muted-foreground">
            Not seeing it? Check your spam folder. If you still get nothing, your project must allow the reset URL in
            Supabase: <strong>Authentication → URL Configuration → Redirect URLs</strong> — add{" "}
            <strong>{typeof window !== "undefined" ? `${window.location.origin}/profile/reset-password` : "/profile/reset-password"}</strong>.
          </p>
          <Link
            href="/profile"
            className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
          >
            ← Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Forgot password</h1>
        <p className="text-muted-foreground">
          Enter your account email and we’ll send you a link to reset your password.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <Link
          href="/profile"
          className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
        >
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
