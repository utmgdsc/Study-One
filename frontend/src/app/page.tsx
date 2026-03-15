"use client";

import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { generateStudyPack, generateQuizQuestions, requestQuizExplanation, submitQuiz, submitQuizResult } from "@/lib/api";
import { GenerateResponse, QuizQuestion, QuizSubmitResponse, QuestionResult } from "@/types/api";

const XP_PER_CORRECT = 25;
const PERFECT_SCORE_BONUS = 15;

function buildPreviewSubmitResult(
  quiz: QuizQuestion[],
  answers: (string | null)[],
): QuizSubmitResponse {
  const results: QuestionResult[] = quiz.map((q, i) => {
    const selected = answers[i] ?? "";
    const is_correct = selected === q.answer;
    return {
      question_index: i,
      question: q.question,
      selected_answer: selected,
      correct_answer: q.answer,
      is_correct,
      topic: q.topic,
      correction_explanation: q.correctionExplanation,
    };
  });
  const total_correct = results.filter((r) => r.is_correct).length;
  const total_questions = results.length;
  const score = total_questions > 0 ? total_correct / total_questions : 0;
  let xp_awarded = total_correct * XP_PER_CORRECT;
  if (total_correct === total_questions && total_questions > 0) {
    xp_awarded += PERFECT_SCORE_BONUS;
  }
  return {
    attempt_id: "preview",
    quiz_set_id: "preview",
    score,
    total_correct,
    total_questions,
    xp_awarded,
    results,
  };
}
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

function generateQuizId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `quiz-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export default function Home() {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [studyPack, setStudyPack] = useState<GenerateResponse | null>(null);
  const [quizSetId, setQuizSetId] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<(string | null)[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<QuizSubmitResponse | null>(null);
  const [submitQuizLoading, setSubmitQuizLoading] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  const isEmpty = !notes.trim();
  const isDisabled = isEmpty || loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isDisabled) return;

    setStudyPack(null);
    setQuizSetId(null);
    setQuizAnswers([]);
    setErrorMessage(null);
    setLoading(true);
    try {
      const trimmed = notes.trim();
      const packResponse = await generateStudyPack(trimmed);
      setStudyPack({
        summary: packResponse.summary,
        quiz: [],
      });
    } catch (err) {
      console.error("Failed to generate study pack:", err);
      setErrorMessage(toUserFriendlyMessage(err));
      setStudyPack(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateQuiz() {
    if (!studyPack || quizLoading || !notes.trim()) return;
    setErrorMessage(null);
    setSubmitResult(null);
    setQuizLoading(true);
    try {
      const quizResponse = await generateQuizQuestions(notes.trim());
      setStudyPack((prev) =>
        prev ? { ...prev, quiz: quizResponse.quiz } : null,
      );
      setQuizSetId(quizResponse.quiz_set_id);
      setQuizAnswers(
        Array(quizResponse.quiz.length)
          .fill(null)
          .map(() => null),
      );
    } catch (err) {
      console.error("Failed to generate quiz:", err);
      setErrorMessage(toUserFriendlyMessage(err));
    } finally {
      setQuizLoading(false);
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

      // sample preview: summary + quiz so both formats are visible (no API, no submit)
      const sample = {
        summary: [
          "Summary 1",
          "Summary 2",
          "Summary 3",
        ],
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
              "and they are not the main place where proteins are made (that is mostly ribosomes).",
            topic: "Cellular Biology",
          },
        ],
      };
      setStudyPack(sample);
      setQuizSetId(null);
      setQuizAnswers(Array(sample.quiz.length).fill(null));
      setSubmitResult(null);
    }, 3000);
  }

  function handleAnswerSelected(questionIndex: number, answer: string) {
    setQuizAnswers((prev) => {
      const next =
        prev.length === (studyPack?.quiz.length ?? 0)
          ? [...prev]
          : Array(studyPack?.quiz.length ?? 0)
              .fill(null)
              .map(() => null);
      if (questionIndex >= 0 && questionIndex < next.length) {
        next[questionIndex] = answer;
      }
      return next;
    });
  }

  async function handleSubmitQuiz() {
    if (!studyPack?.quiz.length || submitQuizLoading) return;
    const filled = studyPack.quiz.map((_, i) => quizAnswers[i]).filter((a): a is string => a != null);
    if (filled.length !== studyPack.quiz.length) return;
    setErrorMessage(null);

    // Preview: no quizSetId — show score/answers locally without saving
    if (!quizSetId) {
      setSubmitResult(buildPreviewSubmitResult(studyPack.quiz, quizAnswers));
      return;
    }

    setSubmitQuizLoading(true);
    try {
      const result = await submitQuiz({
        quiz_id: quizSetId,
        answers: studyPack.quiz.map((_, i) => ({
          question_index: i,
          selected_answer: filled[i] as string,
        })),
      });
      await submitQuizResult(result.total_correct, result.total_questions, quizSetId);
      setSubmitResult(result);
    } catch (err) {
      console.error("Failed to submit quiz:", err);
      setErrorMessage(toUserFriendlyMessage(err));
    } finally {
      setSubmitQuizLoading(false);
    }
  }

  const allQuestionsAnswered =
    studyPack?.quiz.length !== undefined &&
    studyPack.quiz.length > 0 &&
    studyPack.quiz.every((_, i) => quizAnswers[i] != null);

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
        
        {studyPack && !loading && (
          <div className="mt-8 space-y-6">
            <h1 className="mb-4 text-lg font-bold">Study Pack</h1>
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
              {/* Generate quiz button (only when quiz not yet loaded) */}
              {studyPack.quiz.length === 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleGenerateQuiz}
                    disabled={quizLoading}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  >
                    {quizLoading ? (
                      <>
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] mr-1.5" aria-hidden />
                        Generating quiz…
                      </>
                    ) : (
                      "Generate quiz"
                    )}
                  </button>
                </div>
              )}
            </section>

            {/* Quiz Section (only when quiz has been generated) */}
            {studyPack.quiz.length > 0 && (
              <section className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Quiz</h2>
                  {!quizLoading && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateQuiz}
                        className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                      >
                        Regenerate quiz
                      </button>
                      {!submitResult && (
                        <button
                          type="button"
                          onClick={handleSubmitQuiz}
                          disabled={!allQuestionsAnswered || submitQuizLoading}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        >
                          {submitQuizLoading ? (
                            <>
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] mr-1.5" aria-hidden />
                              Submitting…
                            </>
                          ) : (
                            "Submit quiz"
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {quizLoading ? (
                  <div className="flex items-center gap-2 py-8 text-muted-foreground" aria-live="polite">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                    <span>Generating new questions…</span>
                  </div>
                ) : (
                  <>
                    {submitResult && (
                      <div className="mb-6 rounded-lg border border-border bg-muted/40 p-6">
                        <p className="text-lg font-semibold">
                          Score: {submitResult.total_correct} / {submitResult.total_questions}
                          {submitResult.total_questions > 0 && (
                            <span className="ml-2 text-muted-foreground font-medium">
                              ({(100 * submitResult.total_correct / submitResult.total_questions).toFixed(0)}%)
                            </span>
                          )}
                        </p>
                        <p className="mt-2 text-base text-muted-foreground">
                          XP earned: <span className="font-semibold text-foreground">{submitResult.xp_awarded}</span>
                        </p>
                      </div>
                    )}
                    <div className="space-y-6">
                      {studyPack.quiz.map((q, index) => (
                        <QuestionDisplay
                          key={index}
                          question={q}
                          index={index}
                          selectedAnswer={quizAnswers[index] ?? null}
                          result={submitResult?.results.find((r) => r.question_index === index) ?? null}
                          userId={user?.id ?? null}
                          onAnswerSelected={handleAnswerSelected}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}


// before submitting quiz: only selection is shown
// after submitting quiz: correct/incorrect and explanation are shown
function QuestionDisplay({
  question,
  index,
  selectedAnswer,
  result,
  userId,
  onAnswerSelected,
}: {
  question: QuizQuestion;
  index: number;
  selectedAnswer: string | null;
  result: QuestionResult | null;
  userId: string | null;
  onAnswerSelected?: (index: number, answer: string) => void;
}) {
  const isSubmitted = result !== null;
  const showAnswer = isSubmitted;
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [hasReported, setHasReported] = useState(false);
  const [lastReportAt, setLastReportAt] = useState<number | null>(null);
  const [whyWrongOpen, setWhyWrongOpen] = useState(false);
  const [whyWrongLoading, setWhyWrongLoading] = useState(false);
  const [whyWrongError, setWhyWrongError] = useState<string | null>(null);
  const [whyWrongExplanation, setWhyWrongExplanation] = useState<string | null>(
    null,
  );
  const [followupInput, setFollowupInput] = useState("");

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

  async function fetchWhyWrongExplanation(followupPrompt?: string) {
    if (!selectedAnswer || selectedAnswer === question.answer) {
      return;
    }

    setWhyWrongLoading(true);
    setWhyWrongError(null);

    try {
      const response = await requestQuizExplanation({
        question: question.question,
        options: question.options,
        answer: question.answer,
        userAnswer: selectedAnswer,
        correctionExplanation: question.correctionExplanation ?? null,
        followupPrompt: followupPrompt,
      });
      setWhyWrongExplanation(response.explanation);
    } catch (err) {
      setWhyWrongError(toUserFriendlyMessage(err));
    } finally {
      setWhyWrongLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold md:text-base">
        {index + 1}. {question.question}
      </h3>
      <p className="text-xs text-muted-foreground">Topic: {question.topic}</p>
      <div className="space-y-2">
        {question.options.map((option, optIndex) => {
          const isCorrectOption = isSubmitted ? option === result!.correct_answer : option === question.answer;
          const isUserChoice = option === selectedAnswer;
          const isWrongChoice = isSubmitted && isUserChoice && !result!.is_correct && option === result!.selected_answer;
          return (
            <button
              key={optIndex}
              type="button"
              onClick={() => {
                if (!isSubmitted) onAnswerSelected?.(index, option);
              }}
              disabled={isSubmitted}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                isSubmitted
                  ? isCorrectOption
                    ? "border-green-500 bg-green-50 dark:bg-green-950"
                    : isWrongChoice
                    ? "border-red-500 bg-red-50 dark:bg-red-950"
                    : "border-border bg-background opacity-50"
                  : isUserChoice
                  ? "border-primary bg-accent"
                  : "border-border bg-background hover:border-primary hover:bg-accent"
              } ${isSubmitted ? "cursor-default" : "cursor-pointer"}`}
            >
              {option}
              {isSubmitted && isCorrectOption && (
                <span className="ml-2 text-green-600 dark:text-green-400">Correct</span>
              )}
              {isSubmitted && isWrongChoice && (
                <span className="ml-2 text-red-600 dark:text-red-400">Incorrect</span>
              )}
            </button>
          );
        })}
      </div>
      {showAnswer && result && (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
          {(result.correction_explanation ?? question.correctionExplanation) ? (
            <div>
              <p className="font-medium text-foreground">Explanation</p>
              <p className="mt-1 text-muted-foreground">
                {result.correction_explanation ?? question.correctionExplanation}
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
        <div className="flex flex-wrap items-center gap-3">
          {showAnswer &&
            result &&
            !result.is_correct &&
            selectedAnswer && (
              <button
                type="button"
                onClick={async () => {
                  const nextOpen = !whyWrongOpen;
                  setWhyWrongOpen(nextOpen);
                  if (nextOpen && !whyWrongExplanation && !whyWrongLoading) {
                    await fetchWhyWrongExplanation();
                  }
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Why was I wrong?
              </button>
            )}
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
      </div>
      {whyWrongOpen && showAnswer && result && !result.is_correct && selectedAnswer && (
        <div className="mt-2 space-y-2 rounded-md border border-border bg-card/60 p-3 text-xs">
          <p className="font-medium text-foreground">Why your answer was incorrect</p>
          {whyWrongLoading && (
            <p className="text-muted-foreground">Getting an explanation…</p>
          )}
          {whyWrongError && (
            <p className="text-destructive">{whyWrongError}</p>
          )}
          {!whyWrongLoading && !whyWrongError && whyWrongExplanation && (
            <p className="text-muted-foreground">{whyWrongExplanation}</p>
          )}
          <div className="mt-2 space-y-1">
            <label className="block font-medium text-foreground">
              Ask a follow-up about this question
              <textarea
                value={followupInput}
                onChange={(e) => setFollowupInput(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="e.g., I thought my answer was also true because…"
              />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFollowupInput("");
                  setWhyWrongOpen(false);
                }}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                Close
              </button>
              <button
                type="button"
                disabled={whyWrongLoading || !followupInput.trim()}
                onClick={async () => {
                  const prompt = followupInput.trim();
                  if (!prompt) return;
                  await fetchWhyWrongExplanation(prompt);
                }}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {whyWrongLoading ? "Asking…" : "Ask follow-up"}
              </button>
            </div>
          </div>
        </div>
      )}
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