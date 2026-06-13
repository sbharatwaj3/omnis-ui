// omnis-ui/utils/supabase/admin.ts
// Service-role Supabase client for privileged server-side operations only.
//
// CONSTITUTION LAW II: The service role key is loaded via process.env and
// is NEVER prefixed with NEXT_PUBLIC_ — it must never be bundled into or
// exposed to the browser under any circumstances.
//
// This client bypasses RLS and has full access to auth.users via the Admin
// API. It must only be used in Server Components, Server Actions, and
// Route Handlers — never in Client Components.
//
// NO MODULE-LEVEL SINGLETON: Previous versions exported a top-level constant
// created at module load time. In a Vercel serverless / Node runtime that
// constant is shared across requests in the same warm Lambda. A service-role
// client that bypasses RLS is the worst possible candidate for cross-request
// sharing — any accidentally attached state would leak globally. The lazy
// getter pattern below ensures the client is created on first use within a
// request and never persists state across users.

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

let _cachedClient: SupabaseClient | null = null;

function buildAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "must both be set to use the admin client.",
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Disable session persistence — this is a server-side only client.
      // It authenticates via the service role key in the Authorization header,
      // not via cookies or local storage.
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Bypass the Next.js Data Cache for every admin request.
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          next: { revalidate: 0 },
        }),
    },
  });
}

/**
 * Lazily-built service-role client. Safe across serverless cold starts because
 * it carries no per-user state and uses no cookie / session storage.
 *
 * Call as a function: `getAdminClient().from("organizations").insert(...)`.
 */
export function getAdminClient(): SupabaseClient {
  if (_cachedClient) return _cachedClient;
  _cachedClient = buildAdminClient();
  return _cachedClient;
}

/**
 * Backwards-compatible Proxy export. Existing call-sites that wrote
 *   `import { adminClient } from "@/utils/supabase/admin";`
 *   `adminClient.from("...").insert(...)`
 * continue to work — every property access on `adminClient` is forwarded to
 * the lazily-built underlying SupabaseClient.
 */
export const adminClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getAdminClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
