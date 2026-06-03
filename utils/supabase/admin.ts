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

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function createAdminClient() {
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
  });
}

// Export a lazily-created singleton. The instance is created on first call
// and reused within the same server request lifecycle.
// Never call this from a Client Component.
export const adminClient = createAdminClient();
