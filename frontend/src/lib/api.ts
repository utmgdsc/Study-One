/**
 * API Service for Socrato Frontend
 * 
 * Handles communication with the backend API.
 */

import type { GenerateRequest, GenerateResponse } from "../types/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Generates study materials (summary and quiz) from user notes.
 * 
 * @param text - The user's study notes to process
 * @returns Promise containing summary bullet points and quiz questions
 * @throws Error if the request fails or validation fails
 */
export async function generateStudyMaterials(
  text: string
): Promise<GenerateResponse> {
  const request: GenerateRequest = { text };

  const response = await fetch(`${API_BASE_URL}/api/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
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

  // get response
  const response = await fetch(`${API_BASE_URL}/generate-study-pack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  // check for any errors
  if (!response.ok){
    const error = await response.json().catch(()=>({}));
    throw new Error(
      error.detail[0].msg || `Request failed with status ${response.status}`
    );
  }
  return response.json();
}