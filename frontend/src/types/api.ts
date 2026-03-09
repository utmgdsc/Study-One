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
