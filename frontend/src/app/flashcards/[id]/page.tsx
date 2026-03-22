"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import {
  fetchFlashcardHistory,
  submitFlashcardReview,
  submitFlashcardSessionComplete,
} from "@/lib/api";
import type { AnkiRating, Flashcard, FlashcardSessionCompleteResponse } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FlashcardSetRow = {
  id: string;
  topic: string | null;
  source_text: string | null;
  created_at: string;
  cards: Flashcard[];
};

/** Derive a short title from notes or topic: first non-empty line, max 50 chars. */
function titleFromNotesOrTopic(notes: string | null, topic: string | null): string {
  const text = (notes ?? "").trim() || (topic ?? "").trim();
  if (!text) return "Flashcard set";
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "Flashcard set";
  return line.length > 50 ? line.slice(0, 50) + "…" : line;
}

type QueueItem = {
  index: number;
  // Lower means sooner in the queue
  position: number;
};

const RATING_OFFSETS: Record<AnkiRating, number> = {
  again: 1,
  hard: 3,
  good: 6,
  easy: 10,
};

/** Next queue after rating the front card; empty means the session is complete. */
function computeNextQueueAfterRate(
  prev: QueueItem[],
  rating: AnkiRating,
  repeatCounts: Record<number, number>,
): QueueItem[] {
  if (!prev.length) return prev;
  const [, ...rest] = prev;
  const ratedIndex = prev[0].index;

  const repeatsSoFar = repeatCounts[ratedIndex] ?? 0;
  const maxRepeats = rating === "again" ? 2 : rating === "hard" ? 1 : 0;
  const shouldRequeue = repeatsSoFar < maxRepeats;

  if (!rest.length && !shouldRequeue) {
    return [];
  }

  const updated = [...rest];
  if (shouldRequeue) {
    const offset = RATING_OFFSETS[rating] ?? 5;
    const insertPosition = Math.min(offset, updated.length);
    updated.splice(insertPosition, 0, { index: ratedIndex, position: 0 });
  }

  return updated.map((item, idx) => ({ ...item, position: idx }));
}

function sessionCompleteErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const isTechnical =
    /request failed with status \d+/i.test(raw) ||
    /^status \d+/i.test(raw) ||
    /network|fetch|econnrefused|timeout/i.test(raw);
  return isTechnical
    ? "Could not record your session XP. Your reviews were saved."
    : raw;
}

export default function FlashcardReviewPage() {
  const params = useParams<{ id: string }>();
  const flashcardSetId = params?.id;
  const { user } = useAuth();

  const [setRow, setSetRow] = useState<FlashcardSetRow | null>(null);
  const [allSets, setAllSets] = useState<FlashcardSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [currentRating, setCurrentRating] = useState<AnkiRating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [repeatCounts, setRepeatCounts] = useState<Record<number, number>>({});
  const [flipped, setFlipped] = useState(false);
  const [sessionGamification, setSessionGamification] =
    useState<FlashcardSessionCompleteResponse | null>(null);
  const [sessionGamificationError, setSessionGamificationError] = useState<string | null>(
    null,
  );
  const sessionCompleteRequestedRef = useRef(false);

  useEffect(() => {
    if (!user || !flashcardSetId) {
      setLoading(false);
      return;
    }

    const userId = user.id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Load all sets for sidebar carousel.
        const { data: allData, error: allErr } = await supabase
          .from("flashcards")
          .select("id, topic, source_text, created_at, cards")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (allErr) throw allErr;
        const all = (allData ?? []) as unknown as FlashcardSetRow[];

        const active = all.find((row) => row.id === flashcardSetId) ?? null;
        if (!active) {
          throw new Error("That flashcard set could not be found.");
        }

        const history = await fetchFlashcardHistory(flashcardSetId);

        // Initialise queue: most difficult cards first, unseen in the middle.
        const totalCards = active.cards?.length ?? 0;
        const seenByIndex = new Map<number, AnkiRating>();
        for (const item of history.history) {
          seenByIndex.set(item.card_index, item.rating);
        }

        const unseen: QueueItem[] = [];
        const again: QueueItem[] = [];
        const hard: QueueItem[] = [];
        const good: QueueItem[] = [];
        const easy: QueueItem[] = [];

        for (let i = 0; i < totalCards; i++) {
          const rating = seenByIndex.get(i);
          const base: QueueItem = { index: i, position: 0 };
          if (!rating) {
            unseen.push(base);
          } else if (rating === "again") {
            again.push(base);
          } else if (rating === "hard") {
            hard.push(base);
          } else if (rating === "good") {
            good.push(base);
          } else {
            easy.push(base);
          }
        }

        const initialQueue = [...again, ...hard, ...unseen, ...good, ...easy].map(
          (item, idx) => ({ ...item, position: idx }),
        );

        if (!cancelled) {
          sessionCompleteRequestedRef.current = false;
          setSessionGamification(null);
          setSessionGamificationError(null);
          setAllSets(all);
          setSetRow(active);
          setQueue(initialQueue);
          setCurrentIndex(initialQueue[0]?.index ?? null);
          setSessionFinished(initialQueue.length === 0);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load flashcard review set:", err);
          setError("Could not load this flashcard set. Please go back and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [flashcardSetId, user]);

  const relatedSets = useMemo(() => {
    if (!setRow) return [];
    const sameTopic = allSets.filter(
      (s) => s.id !== setRow.id && (s.topic ?? "").trim() === (setRow.topic ?? "").trim(),
    );
    const others = allSets.filter(
      (s) => s.id !== setRow.id && (s.topic ?? "").trim() !== (setRow.topic ?? "").trim(),
    );
    return [...sameTopic, ...others].slice(0, 12);
  }, [allSets, setRow]);

  async function handleRate(rating: AnkiRating) {
    if (
      !user ||
      !setRow ||
      currentIndex === null ||
      submitting ||
      sessionFinished
    ) {
      return;
    }

    const ratedCardIndex = currentIndex;

    setSubmitting(true);
    setCurrentRating(rating);
    try {
      await submitFlashcardReview(setRow.id, ratedCardIndex, rating);

      const nextQueue = computeNextQueueAfterRate(queue, rating, repeatCounts);

      if (nextQueue.length === 0) {
        setSessionFinished(true);
      }
      setQueue(nextQueue);
      setRepeatCounts((prev) => ({
        ...prev,
        [ratedCardIndex]: (prev[ratedCardIndex] ?? 0) + 1,
      }));

      if (nextQueue.length === 0 && !sessionCompleteRequestedRef.current) {
        sessionCompleteRequestedRef.current = true;
        setSessionGamificationError(null);
        try {
          const res = await submitFlashcardSessionComplete(setRow.id);
          setSessionGamification(res);
        } catch (err) {
          console.error("Failed to record flashcard session XP:", err);
          sessionCompleteRequestedRef.current = false;
          setSessionGamification(null);
          setSessionGamificationError(sessionCompleteErrorMessage(err));
        }
      }
    } catch (err) {
      console.error("Failed to submit flashcard review:", err);
      setError("Could not save your rating. Please try again.");
    } finally {
      setSubmitting(false);
      setCurrentRating(null);
    }
  }

  useEffect(() => {
    if (!queue.length) {
      setCurrentIndex(null);
      return;
    }
    setCurrentIndex(queue[0].index);
  }, [queue]);

  // Reset answer visibility when advancing to the next card
  useEffect(() => {
    setFlipped(false);
  }, [currentIndex]);

  if (!user) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-2xl font-semibold">Flashcards</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to review your saved flashcards.
          </p>
          <Link
            href="/profile"
            className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Go to profile to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-2xl text-sm text-muted-foreground">
          Loading flashcard set…
        </div>
      </main>
    );
  }

  if (!setRow || error) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-2xl font-semibold">Flashcards</h1>
          <p className="text-sm text-destructive">
            {error ?? "That flashcard set could not be found."}
          </p>
          <Link
            href="/flashcards"
            className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Back to all flashcards
          </Link>
        </div>
      </main>
    );
  }

  const currentCard: Flashcard | null =
    currentIndex !== null ? setRow.cards[currentIndex] ?? null : null;

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {titleFromNotesOrTopic(setRow.source_text, setRow.topic)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Review your cards Anki-style. Difficult cards will come back more often.
          </p>
        </div>

        <section className="rounded-lg border border-border bg-card p-6 text-center">
          {sessionFinished || !currentCard ? (
            <div className="space-y-3">
              <p className="text-lg font-semibold">Great work!</p>
              <p className="text-sm text-muted-foreground">
                You have finished this review session. You can always come back later to keep
                reinforcing the material.
              </p>
              {sessionGamification && !sessionGamificationError && (
                <p className="text-base text-muted-foreground">
                  {sessionGamification.applied ? (
                    <>
                      XP earned:{" "}
                      <span className="font-semibold text-foreground">
                        {sessionGamification.xp_awarded}
                      </span>
                    </>
                  ) : (
                    <span>
                      Daily flashcard session XP was already counted today. Keep studying!
                    </span>
                  )}
                </p>
              )}
              {sessionGamificationError && (
                <p className="text-sm text-destructive">{sessionGamificationError}</p>
              )}
              <Link
                href="/flashcards"
                className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Back to all flashcard sets
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-xs text-muted-foreground">
                Card {currentIndex! + 1} of {setRow.cards.length}
              </div>
              <div className="mx-auto max-w-xl perspective-[1000px]">
                <div
                  className={`relative min-h-[220px] w-full cursor-pointer rounded-lg border border-border bg-card shadow-sm transition-transform duration-500 transform-3d ${
                    flipped ? "transform-[rotateY(180deg)]" : ""
                  }`}
                  onClick={() => setFlipped((f) => !f)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFlipped((f) => !f);
                    }
                  }}
                  aria-label={flipped ? "Show question" : "Reveal answer"}
                >
                  <div className="absolute inset-0 flex flex-col rounded-lg border-0 bg-card p-6 text-left backface-hidden">
                    <p className="text-xs text-muted-foreground">Question</p>
                    <p className="mt-3 flex-1 text-base font-medium text-foreground">
                      {currentCard.question}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Tap to reveal answer</p>
                  </div>
                  <div className="absolute inset-0 flex flex-col rounded-lg border-0 bg-card p-6 text-left transform-[rotateY(180deg)] backface-hidden">
                    <p className="text-xs text-muted-foreground">Answer</p>
                    <p className="mt-3 flex-1 text-sm text-foreground">{currentCard.answer}</p>
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        How well did you know this?
                      </p>
                      <div
                        className="flex flex-wrap gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(["again", "hard", "good", "easy"] as AnkiRating[]).map((rating) => {
                          const label =
                            rating === "again"
                              ? "Again"
                              : rating === "hard"
                              ? "Hard"
                              : rating === "good"
                              ? "Good"
                              : "Easy";
                          const buttonClass =
                            rating === "again"
                              ? "rounded-full bg-red-500/90 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
                              : rating === "hard"
                              ? "rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-60"
                              : rating === "good"
                              ? "rounded-full bg-green-500/90 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-60"
                              : "rounded-full bg-blue-500/90 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60";
                          return (
                            <button
                              key={rating}
                              type="button"
                              disabled={submitting}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRate(rating);
                              }}
                              className={buttonClass}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {relatedSets.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                More flashcard sets to review
              </h2>
              <Link
                href="/flashcards"
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                View all
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {relatedSets.map((set) => (
                <Link key={set.id} href={`/flashcards/${set.id}`}>
                  <Card className="min-w-[200px] max-w-[220px] transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm truncate">
                        {titleFromNotesOrTopic(set.source_text, set.topic)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground space-y-1.5">
                      <p>{set.cards?.length ?? 0} cards</p>
                      <p>
                        {new Date(set.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Link
          href="/flashcards"
          className="inline-block text-sm text-muted-foreground underline hover:text-foreground"
        >
          ← Back to all flashcards
        </Link>
      </div>
    </main>
  );
}

