"use client";

import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { generateStudyMaterials } from "@/lib/api";

const USER_FRIENDLY_FALLBACK =
  "Something went wrong. Please try again.";

function toUserFriendlyMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const isTechnical =
    /request failed with status \d+/i.test(raw) ||
    /^status \d+/i.test(raw) ||
    /network|fetch|econnrefused|timeout/i.test(raw);
  return isTechnical ? USER_FRIENDLY_FALLBACK : raw;
}

export default function Home() {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEmpty = !notes.trim();
  const isDisabled = isEmpty || loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isDisabled) return;

    setErrorMessage(null);
    setLoading(true);
    try {
      const response = await generateStudyMaterials(notes.trim());
      console.log("Study materials response:", response);
    } catch (err) {
      console.error("Failed to generate study materials:", err);
      setErrorMessage(toUserFriendlyMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, []);

  function previewLoading() {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setLoading(true);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      setLoading(false);
    }, 3000);
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-semibold">Socrato</h1>
        <p className="mb-6 text-muted-foreground">
          Paste your study notes below to generate a summary and quiz.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label htmlFor="notes" className="sr-only">
            Study notes
          </label>
          <div className="relative">
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="Paste or type your study notes here..."
              rows={12}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground" aria-live="polite">
              {notes.length} character{notes.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3">
            <button
              type="submit"
              disabled={isDisabled}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate study pack"}
            </button>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  aria-hidden="true"
                />
                <span>Generating your study pack…</span>
              </div>
            )}

            {errorMessage && (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
                aria-live="assertive"
              >
                <span className="flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="shrink-0 font-medium underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Dismiss error"
                >
                  Dismiss
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={previewLoading}
              disabled={loading}
              className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
            >
              Preview loading (no API call)
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
