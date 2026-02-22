/**
 * Supabase browser client for use in Client Components.
 *
 * Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 * (see .env.example). Get values from Supabase Dashboard → Project Settings → API.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;

/**
 * Lazily-initialised singleton. Throws on first real use if env is missing,
 * but does NOT crash the module at import time (safer for builds / CI).
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_client) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
          "Missing Supabase env vars. " +
            "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local",
        );
      }
      _client = createClient(supabaseUrl, supabaseAnonKey);
    }
    return Reflect.get(_client, prop, receiver);
  },
});
