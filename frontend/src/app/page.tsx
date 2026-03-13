"use client";

import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { generateStudyPack, generateQuiz, submitQuiz } from "@/lib/api";
import {
  GenerateResponse,
  GenerateQuizResponse,
  MCQuizQuestion,
  QuizSubmitResponse,
} from "@/types/api";
import { useAuth } from "@/context/auth-context";

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
  const [quizData, setQuizData] = useState<GenerateQuizResponse | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizSubmitResult, setQuizSubmitResult] = useState<QuizSubmitResponse | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizSectionCollapsed, setQuizSectionCollapsed] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEmpty = !notes.trim();
  const isDisabled = isEmpty || loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isDisabled) return;

    setStudyPack(null);
    setQuizData(null);
    setQuizSubmitResult(null);
    setSelectedAnswers({});
    setErrorMessage(null);
    setQuizError(null);
    setLoading(true);
    try {
      const response = await generateStudyPack(notes.trim());
      setStudyPack(response);
    } catch (err) {
      console.error("Failed to generate study pack:", err);
      setErrorMessage(toUserFriendlyMessage(err));
      setStudyPack(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateQuiz() {
    if (!notes.trim()) return;
    setQuizError(null);
    setQuizData(null);
    setQuizSubmitResult(null);
    setSelectedAnswers({});
    setQuizLoading(true);
    try {
      const response = await generateQuiz(notes.trim());
      setQuizData(response);
      setQuizSectionCollapsed(false);
    } catch (err) {
      console.error("Failed to generate quiz:", err);
      setQuizError(toUserFriendlyMessage(err));
      setQuizData(null);
    } finally {
      setQuizLoading(false);
    }
  }

  function handleHideQuiz() {
    setQuizSectionCollapsed(true);
  }

  function handleShowQuiz() {
    setQuizSectionCollapsed(false);
  }

  async function handleSubmitQuiz() {
    if (!quizData) return;
    const answers = Object.entries(selectedAnswers)
      .map(([idx, answer]) => ({ question_index: Number(idx), selected_answer: answer }));
    if (answers.length !== quizData.quiz.length) return;
    setSubmittingQuiz(true);
    setQuizError(null);
    try {
      const result = await submitQuiz({
        quiz_id: quizData.quiz_set_id,
        answers,
      });
      setQuizSubmitResult(result);
    } catch (err) {
      console.error("Failed to submit quiz:", err);
      setQuizError(toUserFriendlyMessage(err));
    } finally {
      setSubmittingQuiz(false);
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

      // sample preview of study pack (summary only; quiz is generated separately)
      setStudyPack({
        summary: [
          "Summary 1",
          "Summary 2",
          "Summary 3",
        ],
        quiz: [],
      });
    }, 3000);
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-semibold">Socrato</h1>
        <p className="mb-6 text-muted-foreground">
          Paste your study notes below to generate a summary. You can then choose to generate a quiz from the same notes.
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
        
        {/* Summary; small Generate quiz button under it; quiz section only after user generates */}
        {studyPack && !loading && (
          <div className="mt-8 space-y-6">
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
              {/* Generate quiz button under summary, smaller */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <button
                  type="button"
                  onClick={handleGenerateQuiz}
                  disabled={quizLoading || !notes.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {quizLoading ? "Generating…" : "Generate quiz from notes"}
                </button>
              </div>
            </section>

            {/* Quiz section: only visible after user clicks Generate quiz; Hide quiz collapses to a tab */}
            {(quizData || quizLoading) && (
              <section className="rounded-lg border border-border bg-card overflow-hidden">
                {quizSectionCollapsed && quizData ? (
                  <div className="flex items-center justify-between gap-2 p-3 bg-muted/30">
                    <span className="text-sm text-muted-foreground">
                      Quiz ({quizData.quiz.length} question{quizData.quiz.length !== 1 ? "s" : ""})
                    </span>
                    <button
                      type="button"
                      onClick={handleShowQuiz}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      Show quiz
                    </button>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <h2 className="text-lg font-semibold">
                        Quiz
                      </h2>
                      <div className="flex shrink-0 flex-row gap-2">
                        <button
                          type="button"
                          onClick={handleHideQuiz}
                          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          Hide quiz
                        </button>
                        {quizData && (
                          <button
                            type="button"
                            onClick={handleGenerateQuiz}
                            disabled={quizLoading || !notes.trim()}
                            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                          >
                            {quizLoading ? "Regenerating…" : "Regenerate quiz"}
                          </button>
                        )}
                      </div>
                    </div>

                    {quizLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
                        <span>Generating quiz from your notes…</span>
                      </div>
                    )}

                    {quizError && (
                      <div
                        className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        role="alert"
                      >
                        {quizError}
                        <button
                          type="button"
                          onClick={() => setQuizError(null)}
                          className="ml-2 font-medium underline hover:no-underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {quizData && !quizSubmitResult && (
                      <QuizTake
                        quiz={quizData.quiz}
                        selectedAnswers={selectedAnswers}
                        onSelectAnswer={(index, answer) =>
                          setSelectedAnswers((prev) => ({ ...prev, [index]: answer }))
                        }
                        onSubmit={handleSubmitQuiz}
                        submitting={submittingQuiz}
                      />
                    )}

                    {quizData && quizSubmitResult && (
                      <QuizResults quiz={quizData.quiz} result={quizSubmitResult} />
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function QuizTake({
  quiz,
  selectedAnswers,
  onSelectAnswer,
  onSubmit,
  submitting,
}: {
  quiz: MCQuizQuestion[];
  selectedAnswers: Record<number, string>;
  onSelectAnswer: (index: number, answer: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const allAnswered = quiz.length > 0 && quiz.every((_, i) => selectedAnswers[i] != null);
  return (
    <div className="space-y-6">
      {quiz.map((q, index) => (
        <div key={index} className="space-y-2">
          <h3 className="text-sm font-semibold md:text-base">
            {index + 1}. {q.question}
          </h3>
          {q.topic && (
            <p className="text-xs text-muted-foreground">Topic: {q.topic}</p>
          )}
          <div className="space-y-2">
            {q.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onSelectAnswer(index, option)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedAnswers[index] === option
                    ? "border-primary border-2 bg-primary/25 text-foreground font-medium"
                    : "border-border bg-background hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!allAnswered || submitting}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit quiz"}
      </button>
    </div>
  );
}

function QuizResults({
  quiz,
  result,
}: {
  quiz: MCQuizQuestion[];
  result: QuizSubmitResponse;
}) {
  const [expandedExplanations, setExpandedExplanations] = useState<Set<number>>(new Set());

  function toggleExplanation(index: number) {
    setExpandedExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-lg font-semibold">
          Score: {result.total_correct} / {result.total_questions} ({result.score}%)
        </p>
        {result.xp_awarded > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">+{result.xp_awarded} XP awarded</p>
        )}
      </div>
      {result.results.map((r, i) => {
        const question = quiz[r.question_index];
        const options = question?.options ?? [];
        const showExplanation = expandedExplanations.has(i);
        const explanationText =
          r.correction_explanation ??
          (r as { correctionExplanation?: string }).correctionExplanation ??
          "";
        const hasExplanation = explanationText.length > 0;
        return (
          <div key={i} className="space-y-2">
            <h3 className="text-sm font-semibold md:text-base">
              {r.question_index + 1}. {r.question}
            </h3>
            {r.topic && (
              <p className="text-xs text-muted-foreground">Topic: {r.topic}</p>
            )}
            <div className="space-y-2">
              {options.map((option) => {
                const isSelected = r.selected_answer === option;
                const isCorrectOption = r.correct_answer === option;
                let style =
                  "w-full rounded-md border px-3 py-2 text-left text-sm ";
                if (isCorrectOption) {
                  style += "border-green-600 bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-100";
                } else if (isSelected && !r.is_correct) {
                  style += "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100";
                } else {
                  style += "border-border bg-muted/30 text-muted-foreground";
                }
                return (
                  <div key={option} className={style}>
                    {option}
                    {isSelected && r.is_correct && (
                      <span className="ml-2 text-xs font-medium text-green-700 dark:text-green-300">
                        ✓ Your answer
                      </span>
                    )}
                    {isSelected && !r.is_correct && (
                      <span className="ml-2 text-xs font-medium text-red-700 dark:text-red-300">
                        ✗ Your answer
                      </span>
                    )}
                    {isCorrectOption && !isSelected && !r.is_correct && (
                      <span className="ml-2 text-xs font-medium text-green-700 dark:text-green-300">
                        Correct answer
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={() => toggleExplanation(i)}
                className="text-xs font-medium text-primary underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {showExplanation ? "Hide explanation" : "Show explanation"}
              </button>
              {showExplanation && (
                <p className="mt-2 text-sm text-muted-foreground border-l-2 border-border pl-3">
                  {hasExplanation
                    ? explanationText
                    : "No explanation available for this question."}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}