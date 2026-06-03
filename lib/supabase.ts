// omnis-ui/lib/supabase.ts
// Server-side Supabase client for use in React Server Components.
// CONSTITUTION LAW II: Secrets loaded via environment variables only.
// No hardcoded URLs or keys.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "FATAL: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local",
  );
}

// A single shared client instance for server-side data fetching.
// This is safe in Server Components — it is never exposed to the browser bundle.
export const supabase = createClient(supabaseUrl.trim(), supabaseKey.trim());
