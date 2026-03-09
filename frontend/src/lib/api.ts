/**
 * API Service for Socrato Frontend
 *
 * Handles communication with the backend API.
 * Automatically attaches the Supabase auth token when available.
 */

import type {
  FlashcardSessionCompleteResponse,
  GenerateRequest,
  GenerateResponse,
  QuizResultResponse,
  QuizExplanationResponse,
} from "../types/api";
import { getAccessToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  let token: string | null;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error("Failed to retrieve access token:", err);
    token = null;
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Generates study materials (summary and quiz) from user notes.
 *
 * @param text - The user's study notes to process
 * @returns Promise containing summary bullet points and quiz questions
 * @throws Error if the request fails or validation fails
 */
export async function generateStudyMaterials(
  text: string,
): Promise<GenerateResponse> {
  const request: GenerateRequest = { text };

  const response = await fetch(`${API_BASE_URL}/api/v1/generate`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
  }

  return response.json();
}

/**
 * Generates study pack from user notes.
 * 
 * @param text - The user's study notes to process
 * @returns Promise containing summary bullet points and quiz questions
 * @throws Error if the request fails or validation fails
 */
export async function generateStudyPack(
  text: string
): Promise<GenerateResponse>{
  const request : GenerateRequest = { text };

  const response = await fetch(`${API_BASE_URL}/generate-study-pack`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok){
    const error = await response.json().catch(()=>({}));
    const errorMessage = error.detail?.[0]?.msg || error.detail || `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }
  return response.json();
}

/**
 * Records flashcard session completion for XP. Awards 10 XP. Idempotent per day
 * (one session per day counts). Call when the user finishes a flashcard session.
 */
export async function submitFlashcardSessionComplete(
  flashcardSetId: string
): Promise<FlashcardSessionCompleteResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/flashcards/session-complete`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ flashcard_set_id: flashcardSetId }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Submits quiz completion for XP. Awards 25 XP base + 15 bonus for perfect score.
 * Idempotent per day (second quiz same day returns applied: false).
 */
export async function submitQuizResult(
  correct: number,
  total: number,
  quizId?: string
): Promise<QuizResultResponse> {
  const body: { correct: number; total: number; quiz_id?: string } = {
    correct,
    total,
  };
  if (quizId) body.quiz_id = quizId;

  const response = await fetch(`${API_BASE_URL}/api/v1/quiz/result`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Requests an AI explanation for a specific quiz question, optionally with a follow-up prompt.
 */
export async function requestQuizExplanation(params: {
  question: string;
  options: string[];
  answer: string;
  userAnswer?: string | null;
  correctionExplanation?: string | null;
  followupPrompt?: string | null;
}): Promise<QuizExplanationResponse> {
  const body = {
    question: params.question,
    options: params.options,
    answer: params.answer,
    user_answer: params.userAnswer ?? null,
    correction_explanation: params.correctionExplanation ?? null,
    followup_prompt: params.followupPrompt?.trim() || null,
  };

  const response = await fetch(`${API_BASE_URL}/api/v1/quiz/explain`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`
    );
  }

  return response.json();
}