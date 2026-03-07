"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  const isProfile = pathname === "/profile";
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold text-foreground hover:opacity-90"
        >
          Socrato
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Learn how to use this page"
          >
            <span className="text-lg font-medium leading-none">?</span>
          </button>
          <Link
            href="/profile"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-current={isProfile ? "page" : undefined}
          >
            Profile
          </Link>
        </div>
      </div>
      {helpOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden
            onClick={() => setHelpOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-dialog-title"
            className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
          >
            <h2 id="help-dialog-title" className="text-base font-semibold">
              How to use this page
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Help content will go here.
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
        </>
      )}
    </header>
  );
}
