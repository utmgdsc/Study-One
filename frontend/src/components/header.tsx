"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  const isProfile = pathname === "/profile";
  const isFlashcards = pathname === "/flashcards" || pathname.startsWith("/flashcards/");
  const [helpOpen, setHelpOpen] = useState(false);

  const helpTitle = isProfile ? "How to use your profile" : "How to use Socrato";
  const helpBody = isProfile
    ? "Use this page to see your XP, streaks, badges, and contribution history over time."
    : "Paste your study notes, then generate a study pack with summaries and quizzes. You can also preview a sample pack before running a real generation.";

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-3 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold text-foreground hover:opacity-90"
        >
          Socrato
        </Link>
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHelpOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Learn how to use this page"
          >
            <span className="text-lg font-medium leading-none">?</span>
          </button>
          <Link
            href="/flashcards"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-current={isFlashcards ? "page" : undefined}
          >
            Review
          </Link>
          <Link
            href="/profile"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-current={isProfile ? "page" : undefined}
          >
            Profile
          </Link>
          {helpOpen && (
            <div
              role="dialog"
              aria-labelledby="help-dialog-title"
              className="absolute right-0 top-full z-50 mt-2 w-[min(90vw,320px)] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            >
              <h2 id="help-dialog-title" className="text-base font-semibold">
                {helpTitle}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {helpBody}
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
