/**
 * API Types for Socrato Frontend
 *
 * These types mirror the shared contract in /shared/types.ts
 * and the backend Pydantic models.
 */

// ============================================
// REQUEST SCHEMA
// ============================================

/**
 * Request body for POST /api/v1/generate
 * @property text - The user's study notes to process
 */
export interface GenerateRequest {
  text: string;
}


// ============================================
// RESPONSE SCHEMA
// ============================================

/**
 * A single quiz question with multiple choice options
 */
export interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
  /**
   * Optional single explanation covering why the correct answer is right
   * and why the other options are wrong.
   */
  correctionExplanation?: string;
  /**
   * Optional explanation for why the correct answer is right.
   */
  correctExplanation?: string;
  /**
   * Optional map of option → explanation for why that option is incorrect.
   * The correct answer can also be included here if the backend prefers a single map.
   */
  optionExplanations?: Record<string, string>;
}

/**
 * Response from POST /api/v1/generate
 * @property summary - Array of bullet point summaries
 * @property quiz - Array of quiz questions with options and answers
 */
export interface GenerateResponse {
  summary: string[];
  quiz: QuizQuestion[];
}

// ============================================
// FLASHCARDS
// ============================================

/** A single Q/A flashcard. Mirrors backend `Flashcard` model. */
export interface Flashcard {
  question: string;
  answer: string;
}

/** Response from POST /api/v1/flashcards. */
export interface FlashcardResponse {
  flashcard_set_id: string;
  flashcards: Flashcard[];
}

/** Anki-style rating values for a flashcard review. */
export type AnkiRating = "again" | "hard" | "good" | "easy";

/** Response from POST /api/v1/flashcards/review. */
export interface FlashcardReviewResponse {
  xp_awarded: number;
  total_xp: number;
  already_reviewed: boolean;
}

/** History item from GET /api/v1/flashcards/{flashcard_set_id}/history. */
export interface FlashcardHistoryItem {
  card_index: number;
  rating: AnkiRating;
  reviewed_at: string;
}

/** History payload from GET /api/v1/flashcards/{flashcard_set_id}/history. */
export interface FlashcardHistoryResponse {
  history: FlashcardHistoryItem[];
}

/** Response from POST /api/v1/quiz/result (XP and streak). */
export interface QuizResultResponse {
  applied: boolean;
  xp_awarded: number;
  user_stats: {
    xp_total?: number;
    current_streak_days?: number;
    longest_streak_days?: number;
  };
}

/** Response from POST /api/v1/flashcards/session-complete (XP and streak). */
export interface FlashcardSessionCompleteResponse {
  applied: boolean;
  xp_awarded: number;
  user_stats: {
    xp_total?: number;
    current_streak_days?: number;
    longest_streak_days?: number;
  };
}
