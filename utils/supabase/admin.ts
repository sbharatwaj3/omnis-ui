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
// NO MODULE-LEVEL SINGLETON: No top-level singleton is created at module load
// time. In a Vercel serverless / Node runtime, module-level state is shared
// across requests in the same warm Lambda invocation. A service-role client
// that bypasses RLS must never cache a failed initialisation state (e.g. a
// cold start that fired before env vars were injected), as the poisoned null
// would persist for the lifetime of the Lambda. The factory function below
// constructs a fresh client on every call-site invocation, which is safe
// because the SupabaseClient constructor is cheap and carries no per-user
// session state.

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Factory — builds a fresh service-role SupabaseClient on every invocation.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * process.env at call time (never at module load time), which guarantees the
 * correct values are read after Vercel injects environment variables into the
 * serverless function.
 *
 * Throws a loud FATAL error if either variable is absent so misconfiguration
 * surfaces immediately in Vercel Function logs rather than producing a silent
 * RLS bypass or a cryptic downstream Supabase 401.
 */
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
 * Returns a service-role SupabaseClient built from the current process.env.
 *
 * Call as a function: `getAdminClient().from("organizations").insert(...)`.
 */
export function getAdminClient(): SupabaseClient {
  return buildAdminClient();
}

/**
 * Backwards-compatible Proxy export. Existing call-sites that wrote
 *   `import { adminClient } from "@/utils/supabase/admin";`
 *   `adminClient.from("...").insert(...)`
 * continue to work — every property access on `adminClient` is forwarded to
 * a freshly-built underlying SupabaseClient, reading env vars at access time.
 */
export const adminClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getAdminClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
