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
  GenerateQuizResponse,
  QuizResultResponse,
  QuizSubmitRequest,
  QuizSubmitResponse,
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
 * Generates a quiz from user notes (same notes used for summary).
 * Stores quiz in backend; returns quiz_set_id and questions.
 */
export async function generateQuiz(text: string): Promise<GenerateQuizResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/quiz`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ text: text.trim() }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
  }

  return response.json();
}

function isNetworkError(err: unknown): err is TypeError {
  return (
    err instanceof TypeError &&
    (err.message === "Failed to fetch" || err.message === "Load failed")
  );
}

/**
 * Submits quiz answers and returns score, results, and XP.
 */
export async function submitQuiz(
  request: QuizSubmitRequest
): Promise<QuizSubmitResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/quiz/submit`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(request),
    });
  } catch (err) {
    if (isNetworkError(err)) {
      throw new Error(
        `Cannot reach the server at ${API_BASE_URL}. Make sure the backend is running (e.g. \`uv run uvicorn backend.main:app\`).`
      );
    }
    throw err;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
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