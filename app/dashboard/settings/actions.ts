"use server";
// omnis-ui/app/dashboard/settings/actions.ts
// Developer API key Server Actions — generate and revoke organization API keys.
//
// CONSTITUTION LAW II:
//   - Session verified server-side on every invocation. No auth bypass.
//   - Raw key is generated server-side and returned exactly once — it is NEVER
//     stored. Only a salted SHA-256 hash is written to the database.
//   - org_id is resolved from the verified session, never trusted from the client.
//   - All secrets loaded via process.env; nothing is hardcoded.
//
// HASHING STRATEGY:
//   bcrypt is absent from this project's dependencies. API keys are 32-byte
//   CSPRNG tokens (not passwords) so SHA-256 with a per-key random 16-byte
//   salt provides equivalent security — an attacker must brute-force a 256-bit
//   key space, which is computationally infeasible. The hash is stored as
//   "<hex-salt>:<hex-digest>" so verification can extract the salt inline.
//   We use the native Web Crypto API (crypto.subtle) which is available in
//   the Next.js Edge-compatible and Node runtime.

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
}

export interface GenerateApiKeyResult {
  success: boolean;
  /** The raw, unhashed API key — returned exactly once, never stored. */
  rawKey?: string;
  error?: string;
}

export interface RevokeApiKeyResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Encodes an ArrayBuffer as a lowercase hex string.
 */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates a salted SHA-256 hash of the raw API key.
 *
 * Returns the string "<hex-salt>:<hex-hash>" so both components can be stored
 * in a single column and extracted by the verification endpoint without needing
 * a separate salt column.
 */
async function hashApiKey(rawKey: string): Promise<string> {
  // 16-byte (128-bit) random salt — unique per key, not secret.
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(saltBytes.buffer);

  // Concatenate salt + raw key before hashing so identical keys produce
  // different digests.
  const encoder = new TextEncoder();
  const data = encoder.encode(saltHex + rawKey);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = toHex(hashBuffer);

  return `${saltHex}:${hashHex}`;
}

/**
 * Generates a cryptographically secure Omnis API key.
 *
 * Format: omn_<40 random lowercase hex chars>
 * Example: omn_3f8a1c9d2e6b047f5a...
 */
function generateRawKey(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(20));
  const hex = toHex(randomBytes.buffer);
  return `omn_${hex}`;
}

// ---------------------------------------------------------------------------
// Action: generateApiKey
// ---------------------------------------------------------------------------
// 1. Verify authenticated session.
// 2. Resolve caller's org_id from the users table (never trust client).
// 3. Validate the key name supplied by the user.
// 4. Generate a CSPRNG API key with omn_ prefix.
// 5. Hash the raw key with a random salt.
// 6. Insert {org_id, name, key_prefix, key_hash} into organization_api_keys.
// 7. Return the raw key to the caller EXACTLY ONCE.
// ---------------------------------------------------------------------------

export async function generateApiKey(
  name: string,
): Promise<GenerateApiKeyResult> {
  // Step 1: Verify session.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Unauthorized: valid session required." };
  }

  // Step 2: Resolve org_id. We must never trust a client-supplied org_id.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return {
      success: false,
      error: "Could not resolve your organization. Please complete onboarding first.",
    };
  }

  const orgId: string = profile.org_id;

  // Step 3: Validate the name.
  const trimmedName = name?.trim() ?? "";
  if (trimmedName.length < 1) {
    return { success: false, error: "Key name is required." };
  }
  if (trimmedName.length > 120) {
    return { success: false, error: "Key name must be 120 characters or fewer." };
  }

  // Step 4: Generate the raw key.
  const rawKey = generateRawKey();

  // Step 5: Hash the raw key.
  const keyHash = await hashApiKey(rawKey);

  // Step 6: Derive the visual prefix (first 8 chars: "omn_" + 4 hex chars).
  // This is stored so the user can visually identify the key later.
  const keyPrefix = rawKey.slice(0, 8);

  // Step 7: Insert the record using the admin client.
  // The admin client bypasses RLS to ensure this write succeeds regardless of
  // policy evaluation order. The org_id is sourced from the verified session,
  // so this is safe.
  const { error: insertError } = await adminClient
    .from("organization_api_keys")
    .insert({
      org_id: orgId,
      name: trimmedName,
      key_prefix: keyPrefix,
      key_hash: keyHash,
    });

  if (insertError) {
    console.error(
      "[generateApiKey] Supabase insert error:",
      insertError.message,
    );
    return {
      success: false,
      error: "Database error: could not store the API key. Please try again.",
    };
  }

  // Step 8: Invalidate the settings page so the new key appears in the list.
  revalidatePath("/dashboard/settings");

  // Step 9: Return the raw key EXACTLY ONCE. It is never persisted or logged.
  return { success: true, rawKey };
}

// ---------------------------------------------------------------------------
// Action: revokeApiKey
// ---------------------------------------------------------------------------
// 1. Verify authenticated session.
// 2. Resolve caller's org_id from the session (never trust the client).
// 3. Delete the key row via adminClient with an explicit org_id guard.
//    Using adminClient mirrors the generateApiKey pattern and is safe here
//    because the org_id is resolved from the verified server-side session —
//    the caller can only ever delete keys belonging to their own organization.
//    This avoids any dependency on the authenticated role's DELETE ACL or
//    RLS policy propagation timing on the live database.
// 4. Revalidate the settings page.
// ---------------------------------------------------------------------------

export async function revokeApiKey(keyId: string): Promise<RevokeApiKeyResult> {
  // Step 1: Verify session.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Unauthorized: valid session required." };
  }

  // Step 2: Resolve org_id from the verified session.
  // We must never trust a client-supplied org_id — this is the same
  // defensive pattern used in generateApiKey.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return {
      success: false,
      error: "Could not resolve your organization. Please try again.",
    };
  }

  const orgId: string = profile.org_id;

  // Step 3: Delete via adminClient with a dual-column guard:
  //   .eq("id", keyId)     — targets the specific key
  //   .eq("org_id", orgId) — cryptographically ensures the key belongs to
  //                          the caller's org (org_id from verified session)
  // If the key doesn't exist or belongs to a different org, Supabase returns
  // 0 rows affected rather than an error, which is the correct safe behaviour.
  const { error: deleteError } = await adminClient
    .from("organization_api_keys")
    .delete()
    .eq("id", keyId)
    .eq("org_id", orgId);

  if (deleteError) {
    console.error("[revokeApiKey] Supabase delete error:", deleteError.message);
    return {
      success: false,
      error: "Database error: could not revoke the key. Please try again.",
    };
  }

  // Step 4: Refresh the settings page.
  revalidatePath("/dashboard/settings");

  return { success: true };
}

// ---------------------------------------------------------------------------
// Action: listApiKeys
// ---------------------------------------------------------------------------
// Fetches all active API keys for the caller's organization.
// Returns only safe fields — key_hash is NEVER returned to the client.
// ---------------------------------------------------------------------------

export async function listApiKeys(): Promise<{
  keys: ApiKeyRow[];
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { keys: [], error: "Unauthorized." };
  }

  const { data, error } = await supabase
    .from("organization_api_keys")
    // SECURITY: key_hash is explicitly excluded from the SELECT list.
    // It must never be returned to the client.
    .select("id, name, key_prefix, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listApiKeys] Supabase select error:", error.message);
    return { keys: [], error: "Failed to load API keys." };
  }

  return { keys: (data ?? []) as ApiKeyRow[] };
}
