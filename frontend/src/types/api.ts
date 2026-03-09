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
