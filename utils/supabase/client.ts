// omnis-ui/utils/supabase/client.ts
// Browser-side Supabase client using @supabase/ssr.
// Use this in Client Components ("use client") only.
// CONSTITUTION LAW II: All secrets loaded via process.env — never hardcoded.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
