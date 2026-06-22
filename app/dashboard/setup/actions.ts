"use server";
// omnis-ui/app/dashboard/setup/actions.ts
// Server actions for the CLI setup/onboarding page.
//
// CONSTITUTION LAW II:
//   - Session verified server-side on every invocation.
//   - org_id resolved from verified session — never trusted from client.
//   - All secrets loaded via process.env; nothing hardcoded.

import { createClient } from "@/utils/supabase/server";
import { listApiKeys, type ApiKeyRow } from "@/app/dashboard/settings/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupStatusResult {
  /** Total evidence log count for the authenticated user's org. */
  logCount: number;
  error?: string;
}

export interface SetupPageData {
  /** The first API key (most recently created) for display. */
  firstKey: ApiKeyRow | null;
  /** Total log count — used to determine if onboarding is complete. */
  logCount: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Action: getSetupPageData
// ---------------------------------------------------------------------------
// Fetches both the org's API keys and evidence log count in parallel.
// Used on initial page load to hydrate the server component shell.
// ---------------------------------------------------------------------------

export async function getSetupPageData(): Promise<SetupPageData> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { firstKey: null, logCount: 0, error: "Unauthorized." };
  }

  // Resolve org_id
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return {
      firstKey: null,
      logCount: 0,
      error: "Could not resolve your organization.",
    };
  }

  const orgId: string = profile.org_id;

  // Fetch keys and log count in parallel
  const [keysResult, countResult] = await Promise.all([
    listApiKeys(),
    supabase
      .from("evidence_logs")
      .select("log_id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  const logCount = countResult.count ?? 0;
  const firstKey = keysResult.keys[0] ?? null;

  return { firstKey, logCount };
}

// ---------------------------------------------------------------------------
// Action: getOrgLogCount
// ---------------------------------------------------------------------------
// Lightweight action called by the client polling loop.
// Returns only the log count so the payload is minimal.
// ---------------------------------------------------------------------------

export async function getOrgLogCount(): Promise<SetupStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { logCount: 0, error: "Unauthorized." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return { logCount: 0, error: "Could not resolve your organization." };
  }

  const { count, error: countError } = await supabase
    .from("evidence_logs")
    .select("log_id", { count: "exact", head: true })
    .eq("org_id", profile.org_id);

  if (countError) {
    return { logCount: 0, error: countError.message };
  }

  return { logCount: count ?? 0 };
}
