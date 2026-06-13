// omnis-ui/utils/supabase/server.ts
// Server-side Supabase client using @supabase/ssr.
// Must be used in Server Components, Server Actions, and Route Handlers only.
// Reads cookies from the incoming request to rehydrate the user session.
// CONSTITUTION LAW II: All secrets loaded via process.env — never hardcoded.
//
// CACHE-LEAK HARDENING (Constitution §II — defence in depth):
//   The default global fetch() inside Next.js app router can — under some
//   build/runtime combinations — be wrapped by the Next.js Data Cache. While
//   Next.js 16 no longer caches fetches by default, we explicitly opt OUT on
//   every request originating from this client. This guarantees no Supabase
//   response can ever be persisted in the per-deployment Data Cache and
//   served to a different user, regardless of route-level cache directives.

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
      global: {
        // Force every Supabase HTTP call to bypass the Next.js Data Cache.
        // `cache: 'no-store'` disables persistent caching, and the Next.js
        // `next.revalidate: 0` hint disables time-based revalidation. Setting
        // both is intentional: each disables a separate caching mechanism in
        // the patched fetch() that Next.js installs at runtime.
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            next: { revalidate: 0 },
          }),
      },
    },
  );
}
