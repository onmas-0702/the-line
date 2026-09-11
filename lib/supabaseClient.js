// Thin Supabase client wrapper. The app must keep working with zero
// configuration (wireframe mode, localStorage-only) — so everything here
// is optional: if the env vars aren't set, isSupabaseConfigured is false
// and callers fall back to local-only behavior instead of crashing.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
