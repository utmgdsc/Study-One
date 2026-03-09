"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import {
  fetchFlashcardHistory,
  submitFlashcardReview,
  submitFlashcardSessionComplete,
} from "@/lib/api";
import type { AnkiRating, Flashcard } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type FlashcardSetRow = {
  id: string;
  topic: string | null;
  created_at: string;
  cards: Flashcard[];
};

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

  useEffect(() => {
    if (!user || !flashcardSetId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Load all sets for sidebar carousel.
        const { data: allData, error: allErr } = await supabase
          .from("flashcards")
          .select("id, topic, created_at, cards")
          .eq("user_id", user.id)
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

    setSubmitting(true);
    setCurrentRating(rating);
    try {
      await submitFlashcardReview(setRow.id, currentIndex, rating);

      setQueue((prev) => {
        if (!prev.length) return prev;
        const [, ...rest] = prev;

        // Decide whether to re-queue this card during this session.
        // - good/easy: considered learned for the session → do not requeue
        // - hard: allow one extra repeat
        // - again: allow two extra repeats
        const repeatsSoFar = repeatCounts[currentIndex] ?? 0;
        const maxRepeats =
          rating === "again" ? 2 : rating === "hard" ? 1 : 0;
        const shouldRequeue = repeatsSoFar < maxRepeats;

        if (!rest.length && !shouldRequeue) {
          setSessionFinished(true);
          void submitFlashcardSessionComplete(setRow.id).catch(() => {});
          return [];
        }

        const updated = [...rest];
        if (shouldRequeue) {
          const offset = RATING_OFFSETS[rating] ?? 5;
          const insertPosition = Math.min(offset, updated.length);
          updated.splice(insertPosition, 0, { index: currentIndex, position: 0 });
        }

        const next = updated.map((item, idx) => ({ ...item, position: idx }));
        if (!next.length) {
          setSessionFinished(true);
          void submitFlashcardSessionComplete(setRow.id).catch(() => {});
        }
        return next;
      });

      setRepeatCounts((prev) => ({
        ...prev,
        [currentIndex]: (prev[currentIndex] ?? 0) + 1,
      }));
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
            {setRow.topic?.trim() || "Flashcard set"}
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
                Card {currentIndex + 1} of {setRow.cards.length}
              </div>
              <Card className="mx-auto max-w-xl">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">
                    Question
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base font-medium text-left">{currentCard.question}</p>
                </CardContent>
              </Card>
              <details className="mx-auto max-w-xl rounded-lg border border-dashed border-border bg-background/60 p-4 text-left">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Show answer
                </summary>
                <p className="mt-3 text-sm text-foreground">{currentCard.answer}</p>
              </details>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  How well did you know this?
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {(["again", "hard", "good", "easy"] as AnkiRating[]).map((rating) => {
                    const label =
                      rating === "again"
                        ? "Again"
                        : rating === "hard"
                        ? "Hard"
                        : rating === "good"
                        ? "Good"
                        : "Easy";
                    return (
                      <button
                        key={rating}
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleRate(rating)}
                        className="rounded-full bg-muted px-4 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 disabled:opacity-60"
                      >
                        {label}
                      </button>
                    );
                  })}
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
                        {set.topic?.trim() || "Untitled set"}
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

