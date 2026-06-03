// omnis-ui/utils/supabase/server.ts
// Server-side Supabase client using @supabase/ssr.
// Must be used in Server Components, Server Actions, and Route Handlers only.
// Reads cookies from the incoming request to rehydrate the user session.
// CONSTITUTION LAW II: All secrets loaded via process.env — never hardcoded.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — cookies can only be
            // mutated from Server Actions or Route Handlers. Safe to ignore
            // here; the middleware handles session refresh instead.
          }
        },
      },
    },
  );
}
