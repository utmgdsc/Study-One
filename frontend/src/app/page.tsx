"use client";

import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import {
  generateStudyPack,
  generateFlashcards,
  submitFlashcardReview,
  submitFlashcardSessionComplete,
} from "@/lib/api";
import {
  type AnkiRating,
  type Flashcard,
  type FlashcardResponse,
  type GenerateResponse,
  type QuizQuestion,
} from "@/types/api";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";

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
  const [studyPack, setStudyPack] = useState<GenerateResponse | null>(null);
  const [flashcardSet, setFlashcardSet] = useState<FlashcardResponse | null>(null);
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const [saveFlashcardsToProfile, setSaveFlashcardsToProfile] = useState(false);
  const [flashcardsSaved, setFlashcardsSaved] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  const isEmpty = !notes.trim();
  const isDisabled = isEmpty || loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isDisabled) return;

    setStudyPack(null);
    setFlashcardSet(null);
    setErrorMessage(null);
    setFlashcardError(null);
    setFlashcardsSaved(false);
    setLoading(true);
    try {
      const includeAuthForFlashcards = saveFlashcardsToProfile && !!user;
      const [packResult, flashcardsResult] = await Promise.allSettled([
        generateStudyPack(notes.trim()),
        generateFlashcards(notes.trim(), undefined, { includeAuth: includeAuthForFlashcards }),
      ] as const);

      if (packResult.status === "fulfilled") {
        setStudyPack(packResult.value);
      } else {
        console.error("Failed to generate study pack:", packResult.reason);
        setStudyPack(null);
        setErrorMessage(toUserFriendlyMessage(packResult.reason));
      }

      if (flashcardsResult.status === "fulfilled") {
        setFlashcardSet(flashcardsResult.value);
        setFlashcardsSaved(includeAuthForFlashcards);
      } else {
        console.error("Failed to generate flashcards:", flashcardsResult.reason);
        setFlashcardSet(null);
        setFlashcardError(toUserFriendlyMessage(flashcardsResult.reason));
      }
    } catch (err) {
      console.error("Failed to generate study pack:", err);
      setErrorMessage(toUserFriendlyMessage(err));
      setStudyPack(null);
      setFlashcardSet(null);
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
    setStudyPack(null);
    setFlashcardSet(null);
    setErrorMessage(null);
    setFlashcardError(null);
    setFlashcardsSaved(false);
    setLoading(true);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      setLoading(false);

      // sample preview of study pack
      setStudyPack({
        summary: ["Summary 1", "Summary 2", "Summary 3"],
        quiz: [
          {
            question: "Which option best describes the mitochondria?",
            options: [
              "They make energy for the cell",
              "They store genetic information",
              "They control what enters and leaves the cell",
              "They make proteins for the cell",
            ],
            answer: "They make energy for the cell",
            correctionExplanation:
              "Mitochondria are like tiny batteries for the cell: they turn food into usable energy. " +
              "They do not store DNA (that is mostly the nucleus), they are not the outer membrane that controls entry and exit, " +
              "and they are not the main place where proteins are made (that is mostly ribosomes.",
          },
        ],
      });

      // sample preview of flashcards
      setFlashcardSet({
        flashcard_set_id: "preview-set",
        flashcards: [
          {
            question: "What is the main role of mitochondria?",
            answer: "They generate ATP, the usable energy for the cell.",
          },
          {
            question: "Where is most of the cell's genetic material stored?",
            answer: "In the nucleus.",
          },
          {
            question: "Which cell structure controls what enters and leaves the cell?",
            answer: "The cell membrane (plasma membrane).",
          },
          {
            question: "Which organelles are primarily responsible for protein synthesis?",
            answer: "Ribosomes.",
          },
          {
            question: "Why are mitochondria called the 'powerhouses' of the cell?",
            answer: "Because they convert nutrients into ATP through cellular respiration.",
          },
        ],
      });
      setFlashcardsSaved(false);
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
        
        {/* Study pack and flashcards */}
        {studyPack && !loading && (
          <div className="mt-8 space-y-6">
            <h1 className="mb-4 text-lg font-bold">Study pack</h1>
            {/* Summary Section */}
            <section className="rounded-lg border border-border bg-card p-6">
              <h2 className="mb-4 text-lg font-semibold">Summary</h2>
              <ul className="space-y-2">
                {studyPack.summary.map((point, index) => (
                  <li key={index} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground">-</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Quiz Section */}
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Quiz</h2>
              </div>
              <div className="space-y-6">
                {studyPack.quiz.map((q, index) => (
                  <QuestionDisplay
                    key={index}
                    question={q}
                    index={index}
                    userId={user?.id ?? null}
                  />
                ))}
              </div>
            </section>

            {/* Flashcards Section */}
            {flashcardSet && (
              <section className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Flashcards</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Flip each card to reveal the answer, then rate how well you knew it.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveFlashcardsToProfile}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (next && !user) {
                          setFlashcardError("Sign in to save flashcards to your profile.");
                          setSaveFlashcardsToProfile(false);
                          return;
                        }
                        setFlashcardError(null);
                        setSaveFlashcardsToProfile(next);
                      }}
                      disabled={!user}
                      className="h-3 w-3 rounded border-input"
                    />
                    Save to profile for later review
                  </label>
                </div>
                <FlashcardGridPreview
                  flashcardSet={flashcardSet}
                  sourceLength={notes.length}
                  userId={user?.id ?? null}
                  savingEnabled={saveFlashcardsToProfile && !!user && flashcardsSaved}
                />
                {flashcardError && (
                  <p className="mt-3 text-xs text-destructive">{flashcardError}</p>
                )}
                {!flashcardsSaved && saveFlashcardsToProfile && !!user && flashcardSet.flashcard_set_id !== "preview-set" && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Save is enabled, but this set was generated without being saved. Generate again to save it to your profile.
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

type FlashcardGridPreviewProps = {
  flashcardSet: FlashcardResponse;
  sourceLength: number;
  userId: string | null;
  savingEnabled: boolean;
};

function FlashcardGridPreview({
  flashcardSet,
  sourceLength,
  userId,
  savingEnabled,
}: FlashcardGridPreviewProps) {
  const maxCards =
    sourceLength < 800 ? 5 : sourceLength < 2000 ? 8 : Math.min(10, flashcardSet.flashcards.length);
  const cardsToShow = flashcardSet.flashcards.slice(0, maxCards);

  if (!cardsToShow.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cardsToShow.map((card, index) => (
        <FlashcardPreviewCard
          key={index}
          card={card}
          index={index}
          flashcardSetId={flashcardSet.flashcard_set_id}
          userId={userId}
          isPreview={flashcardSet.flashcard_set_id === "preview-set"}
          savingEnabled={savingEnabled}
        />
      ))}
    </div>
  );
}

type FlashcardPreviewCardProps = {
  card: Flashcard;
  index: number;
  flashcardSetId: string;
  userId: string | null;
  isPreview?: boolean;
  savingEnabled: boolean;
};

function FlashcardPreviewCard({
  card,
  index,
  flashcardSetId,
  userId,
  isPreview,
  savingEnabled,
}: FlashcardPreviewCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [selectedRating, setSelectedRating] = useState<AnkiRating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRate(rating: AnkiRating) {
    if (submitting || selectedRating || isPreview) return;

    if (!userId || !savingEnabled) {
      setSelectedRating(rating);
      setError(
        !userId
          ? "Sign in from the top-right to save your flashcard progress."
          : "Enable “Save to profile” and regenerate to track progress and update your heatmap.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await submitFlashcardReview(flashcardSetId, index, rating);
      setSelectedRating(rating);
      // Award XP + heatmap update (idempotent per day per set).
      await submitFlashcardSessionComplete(flashcardSetId);
    } catch (err) {
      console.error("Failed to submit flashcard review:", err);
      setError(toUserFriendlyMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const faceClass =
    "absolute inset-0 flex h-full w-full flex-col justify-between rounded-lg border border-border bg-background p-4 text-left shadow-sm backface-hidden";

  return (
    <div className="group relative h-48 cursor-pointer perspective-[1000px]">
      <div
        className={`relative h-full w-full transition-transform duration-500 transform-3d ${
          flipped ? "transform-[rotateY(180deg)]" : ""
        }`}
        onClick={() => setFlipped((f) => !f)}
        aria-label={`Flashcard ${index + 1}`}
      >
        {/* Front: question */}
        <div className={`${faceClass}`}>
          <p className="text-xs text-muted-foreground">Question {index + 1}</p>
          <p className="mt-2 line-clamp-5 text-sm font-medium">{card.question}</p>
          <p className="mt-3 text-xs text-muted-foreground">Tap to reveal answer</p>
        </div>

        {/* Back: answer */}
        <div className={`${faceClass} transform-[rotateY(180deg)] backface-hidden`}>
          <p className="text-xs text-muted-foreground">Answer</p>
          <p className="mt-2 line-clamp-5 text-sm">{card.answer}</p>
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] text-muted-foreground">How well did you know this?</p>
            <div className="flex flex-wrap gap-1.5">
              {(["again", "hard", "good", "easy"] as AnkiRating[]).map((rating) => {
                const label =
                  rating === "again"
                    ? "Again"
                    : rating === "hard"
                    ? "Hard"
                    : rating === "good"
                    ? "Good"
                    : "Easy";
                const isSelected = selectedRating === rating;
                return (
                  <button
                    key={rating}
                    type="button"
                    disabled={!!selectedRating || submitting}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRate(rating);
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    } disabled:opacity-60`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}


// quiz question display for testing end-to-end connectivity
function QuestionDisplay({
  question,
  index,
  userId,
}: {
  question: QuizQuestion;
  index: number;
  userId: string | null;
}) {
  // answer selected
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  // show answer
  const [showAnswer, setShowAnswer] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [hasReported, setHasReported] = useState(false);
  const [lastReportAt, setLastReportAt] = useState<number | null>(null);

  async function handleReportSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      setReportMessage("You need to be signed in to report an issue.");
      return;
    }
    if (hasReported) {
      setReportMessage("You already reported this question. Thank you!");
      return;
    }
    const now = Date.now();
    if (lastReportAt && now - lastReportAt < 30_000) {
      setReportMessage("Please wait a bit before sending another report.");
      return;
    }

    const description = reportText.trim();
    if (!description) {
      setReportMessage("Please add a short description of the issue.");
      return;
    }

    setReportSubmitting(true);
    setReportMessage(null);
    try {
      const { error } = await supabase.from("quiz_issue_reports").insert({
        user_id: userId,
        question: question.question,
        answer: question.answer,
        options: question.options,
        description,
      });
      if (error) {
        setReportMessage("Failed to send report. Please try again later.");
        return;
      }
      setHasReported(true);
      setLastReportAt(now);
      setReportMessage("Report sent. Thank you for your feedback!");
      setReportOpen(false);
      setReportText("");
    } catch {
      setReportMessage("Failed to send report. Please try again later.");
    } finally {
      setReportSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold md:text-base">
        {index + 1}. {question.question}
      </h3>
      <div className="space-y-2">
        {question.options.map((option, optIndex) => (
          <button
            key={optIndex}
            onClick={() => {
              setSelectedAnswer(option);
              setShowAnswer(true);
            }}
            disabled={showAnswer}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              showAnswer
                ? option === question.answer
                  ? "border-green-500 bg-green-50 dark:bg-green-950"
                  : option === selectedAnswer
                  ? "border-red-500 bg-red-50 dark:bg-red-950"
                  : "border-border bg-background opacity-50"
                : "border-border bg-background hover:border-primary hover:bg-accent"
            } ${showAnswer ? "cursor-default" : "cursor-pointer"}`}
          >
            {option}
            {showAnswer && option === question.answer && (
              <span className="ml-2 text-green-600 dark:text-green-400">Correct</span>
            )}
            {showAnswer && option === selectedAnswer && option !== question.answer && (
              <span className="ml-2 text-red-600 dark:text-red-400">Incorrect</span>
            )}
          </button>
        ))}
      </div>
      {showAnswer && (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
          {question.correctionExplanation ? (
            <div>
              <p className="font-medium text-foreground">Explanation</p>
              <p className="mt-1 text-muted-foreground">
                {question.correctionExplanation}
              </p>
            </div>
          ) : (
            <>
              {question.correctExplanation && (
                <div>
                  <p className="font-medium text-foreground">Why this answer is correct</p>
                  <p className="mt-1 text-muted-foreground">{question.correctExplanation}</p>
                </div>
              )}
              {question.optionExplanations && (
                <div>
                  <p className="font-medium text-foreground">
                    Why the other options are incorrect
                  </p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {question.options
                      .filter((opt) => opt !== question.answer)
                      .map((opt) => (
                        <li key={opt}>
                          <span className="font-medium">{opt}:</span>{" "}
                          {question.optionExplanations?.[opt] ??
                            "Explanation not provided yet."}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (!userId) {
              setReportMessage("You need to be signed in to report an issue.");
              return;
            }
            setReportOpen((open) => !open);
          }}
          disabled={hasReported}
          className="text-xs text-muted-foreground underline hover:text-foreground disabled:cursor-default disabled:opacity-60"
        >
          {hasReported ? "Reported" : "Report an issue"}
        </button>
      </div>
      {reportOpen && userId && (
        <form
          onSubmit={handleReportSubmit}
          className="mt-2 space-y-2 rounded-md border border-border bg-card/60 p-3 text-xs"
        >
          <label className="block font-medium text-foreground">
            Describe the issue
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g., The correct answer should be B, not A."
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReportOpen(false);
                setReportText("");
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reportSubmitting}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {reportSubmitting ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      )}
      {reportMessage && (
        <p className="mt-2 text-xs text-muted-foreground">{reportMessage}</p>
      )}
    </div>
  );
}