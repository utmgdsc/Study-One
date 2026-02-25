"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";

const DISMISS_KEY = "socrato-auth-prompt-dismissed";

export function AuthPrompt() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(true); // start true to avoid flash

  useEffect(() => {
    if (loading) return;
    if (user) {
      setDismissed(true);
      return;
    }
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      setDismissed(stored === "true");
    } catch {
      setDismissed(false);
    }
  }, [user, loading]);

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {}
    setDismissed(true);
  }

  if (loading || user || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Sign in reminder"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
    >
      <span>Sign in to save your progress and keep it in your profile.</span>
      <div className="flex items-center gap-2">
        <Link
          href="/profile"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md px-2 py-1.5 hover:bg-muted hover:text-foreground"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
