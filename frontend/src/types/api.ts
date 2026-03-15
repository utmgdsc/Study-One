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
  topic: string;
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

/** Response from POST /api/v1/quiz/explain. */
export interface QuizExplanationResponse {
  explanation: string;
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

// ============================================
// QUIZ (generate_quiz / submit_quiz)
// ============================================

/** Response from POST /api/v1/quiz (generate quiz from notes). */
export interface GenerateQuizResponse {
  quiz_set_id: string;
  quiz: QuizQuestion[];
}

/** Single answer for submit_quiz. */
export interface QuestionAnswer {
  question_index: number;
  selected_answer: string;
}

/** Request body for POST /api/v1/quiz/submit. */
export interface QuizSubmitRequest {
  quiz_id: string;
  answers: QuestionAnswer[];
}

/** Result for one question after submit. */
export interface QuestionResult {
  question_index: number;
  question: string;
  selected_answer: string;
  correct_answer: string;
  is_correct: boolean;
  topic: string;
  /** Explanation of why the correct answer is right (and why others are wrong). */
  correction_explanation?: string;
}

/** Response from POST /api/v1/quiz/submit. */
export interface QuizSubmitResponse {
  attempt_id: string;
  quiz_set_id: string;
  score: number;
  total_correct: number;
  total_questions: number;
  xp_awarded: number;
  results: QuestionResult[];
}
