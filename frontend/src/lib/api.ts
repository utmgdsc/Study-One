/**
 * API Service for Socrato Frontend
 *
 * Handles communication with the backend API.
 * Automatically attaches the Supabase auth token when available.
 */

import type { GenerateRequest, GenerateResponse } from "../types/api";
import { getAccessToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  try {
    const token = await getAccessToken();
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn("Failed to retrieve auth token:", err);
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
