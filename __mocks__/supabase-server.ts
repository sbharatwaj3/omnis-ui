/**
 * __mocks__/supabase-server.ts
 *
 * Vitest mock for @/utils/supabase/server.
 *
 * The server client reads cookies via `next/headers`, which is unavailable in
 * the jsdom test environment. This stub replaces `createClient` with a
 * configurable vi.fn() so Server Actions can be imported and tested without
 * Next.js cookie infrastructure.
 *
 * Usage in a test file:
 *   vi.mock("@/utils/supabase/server");
 *   import { createClient } from "@/utils/supabase/server";
 *   vi.mocked(createClient).mockResolvedValue(mockSupabaseServerClient({ user: { id: "...", ... } }));
 */

import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds a minimal server-client stub with a configurable `auth.getUser`
 * response. The `from` method falls through to the same chainable builder
 * pattern as the admin mock to keep test authoring consistent.
 */
export function mockSupabaseServerClient(options: {
  user?: {
    id: string;
    email?: string;
    [key: string]: unknown;
  } | null;
  userError?: unknown;
} = {}): SupabaseClient {
  const user = options.user ?? null;
  const userError = options.userError ?? null;

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
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  builder["single"] = vi.fn().mockResolvedValue({ data: null, error: null });
  builder["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
  builder["then"] = (
    resolve: (value: { data: null; error: null }) => void,
    reject: (reason: unknown) => void,
  ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);

  return {
    from: vi.fn().mockReturnValue(builder),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: userError,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as unknown as SupabaseClient;
}

/**
 * Default stub for `createClient` — returns a client with no authenticated user.
 * Tests override this per-test via vi.mocked(createClient).mockResolvedValue(...).
 */
export const createClient = vi
  .fn()
  .mockResolvedValue(mockSupabaseServerClient({ user: null }));
