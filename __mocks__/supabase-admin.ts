/**
 * __mocks__/supabase-admin.ts
 *
 * Vitest mock for @/utils/supabase/admin.
 *
 * Property tests that exercise resolveTriageItem / getPendingTriageItems
 * must not make live Supabase calls. This stub provides a vi.fn()-backed
 * chainable builder that individual test files can configure via
 * vi.mocked() or vi.mock() factory overrides.
 *
 * Usage in a test file:
 *   vi.mock("@/utils/supabase/admin");
 *   import { adminClient } from "@/utils/supabase/admin";
 *   vi.mocked(adminClient.from).mockReturnValue(mockQueryBuilder({ data: [...], error: null }));
 */

import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds a chainable Supabase query-builder stub whose terminal methods
 * (`.single()`, `.maybeSingle()`, awaiting the builder) return the provided
 * `{ data, error, count }` result.
 *
 * Each chaining method returns the same builder so call chains like
 * `.from("x").select("*").eq("id", id).single()` resolve to the stub result.
 */
export function mockQueryBuilder(result: {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}) {
  const resolvedResult = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  };

  const builder: Record<string, unknown> = {};

  const chainMethods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "in",
    "is",
    "filter",
    "match",
    "not",
    "or",
    "order",
    "limit",
    "range",
    "abortSignal",
    "returns",
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods resolve the promise.
  builder["single"] = vi.fn().mockResolvedValue(resolvedResult);
  builder["maybeSingle"] = vi.fn().mockResolvedValue(resolvedResult);
  builder["throwOnError"] = vi.fn().mockReturnValue(builder);

  // Make the builder itself thenable so `await client.from(...).select(...)` works.
  builder["then"] = (
    resolve: (value: typeof resolvedResult) => void,
    reject: (reason: unknown) => void,
  ) => Promise.resolve(resolvedResult).then(resolve, reject);

  return builder;
}

// ---------------------------------------------------------------------------
// Default no-op stubs — individual tests override these via vi.mocked()
// ---------------------------------------------------------------------------

const defaultBuilder = mockQueryBuilder({ data: null, error: null });

export const adminClient = {
  from: vi.fn().mockReturnValue(defaultBuilder),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
} as unknown as SupabaseClient;

export function getAdminClient(): SupabaseClient {
  return adminClient;
}
