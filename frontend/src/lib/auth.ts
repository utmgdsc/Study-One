/**
 * Supabase authentication helpers.
 *
 * Thin wrappers around supabase.auth so the rest of the app
 * doesn't import the Supabase client directly.
 */

import { supabase } from "./supabase";
import type { Session, User, AuthChangeEvent } from "@supabase/supabase-js";

export type { Session, User };

export type SignUpOptions = {
  firstName: string;
  lastName: string;
};

export async function signUp(
  email: string,
  password: string,
  options?: SignUpOptions,
) {
  const displayName =
    options?.firstName != null && options?.lastName != null
      ? `${options.firstName.trim()} ${options.lastName.trim()}`.trim()
      : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        ...(options?.firstName != null && { first_name: options.firstName.trim() }),
        ...(options?.lastName != null && { last_name: options.lastName.trim() }),
        ...(displayName && { display_name: displayName, name: displayName }),
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Base URL for auth redirects (e.g. http://localhost:3000). Set NEXT_PUBLIC_APP_URL so reset link matches Supabase allow list. */
function getAuthRedirectBase(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base ? base.replace(/\/$/, "") : "";
}

/** Send a password reset email. Redirect URL must be in Supabase: Authentication → URL Configuration → Redirect URLs. */
export async function requestPasswordReset(email: string, redirectTo?: string) {
  const base = getAuthRedirectBase();
  const url = redirectTo ?? (base ? `${base}/profile/reset-password` : undefined);
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: url });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("redirect") || msg.includes("url") || msg.includes("allow"))
      throw new Error(
        "Reset link URL is not allowed. Add this URL in Supabase: Authentication → URL Configuration → Redirect URLs: " +
          (url || "/profile/reset-password"),
      );
    throw error;
  }
}

/** Set a new password (use on reset-password page after user clicks email link). */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Update the user's first and last name in auth metadata (and display_name). */
export async function updateUserName(firstName: string, lastName: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  const displayName = [first, last].filter(Boolean).join(" ");
  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: first || undefined,
      last_name: last || undefined,
      display_name: displayName || undefined,
      name: displayName || undefined,
    },
  });
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  return supabase.auth.onAuthStateChange(callback);
}
