/**
 * Profile data from public.profiles (Supabase).
 * Use getProfile / updateProfile to read and write; RLS restricts to current user.
 */

import { supabase } from "./supabase";

export type Profile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  canvas_api_key: string | null;
  created_at: string;
  updated_at: string;
};

/** Fetch the current user's profile from public.profiles. Returns null if not found or not signed in. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, display_name, canvas_api_key, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Update the current user's profile in public.profiles. RLS ensures only own row. Uses upsert so a missing row is created (requires "Users can insert own profile" RLS policy). */
export async function updateProfile(
  userId: string,
  updates: { first_name?: string; last_name?: string; display_name?: string; email?: string; canvas_api_key?: string },
): Promise<void> {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

/** Build full display name from profile or first/last. */
export function getFullName(profile: Profile | null): string {
  if (!profile) return "";
  const d = profile.display_name?.trim();
  if (d) return d;
  const first = profile.first_name?.trim() ?? "";
  const last = profile.last_name?.trim() ?? "";
  return [first, last].filter(Boolean).join(" ").trim() || "";
}
