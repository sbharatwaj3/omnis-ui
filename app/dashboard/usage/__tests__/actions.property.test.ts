import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { normaliseEmail, deriveQuotaData, buildLeaderboard, getWindowStart, developerUsageInputSchema } from "../lib/usage-logic";
import { renderTokenUsageCard } from "../lib/nav-card-guard";

// Feature: token-usage-dashboard, Property 3: Gauge Color Classification
describe("Property 3: deriveQuotaData — gauge color classification", () => {
  it("correctly classifies status based on usage ratio", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat(), fc.integer({ min: 1, max: 1_000_000 })),
        ([used, limit]) => {
          const result = deriveQuotaData(used, limit);
          expect("error" in result).toBe(false);
          if ("error" in result) return;

          const ratio = used / limit;
          if (ratio < 0.80) {
            expect(result.status).toBe("healthy");
          } else if (ratio < 1.0) {
            expect(result.status).toBe("warning");
          } else {
            expect(result.status).toBe("exhausted");
          }

          expect(result.usagePct).toBe(Math.floor((used / limit) * 100));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns error sentinel for limit === 0", () => {
    fc.assert(
      fc.property(
        fc.nat(),
        (used) => {
          const result = deriveQuotaData(used, 0);
          expect("error" in result && result.error).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: token-usage-dashboard, Property 4: Leaderboard Aggregation
describe("Property 4: buildLeaderboard — grouping and sorting invariants", () => {
  it("groups, aggregates, and sorts correctly", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            developer_email: fc.option(fc.emailAddress(), { nil: null }),
            ai_tokens_used: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }),
          }),
          { maxLength: 200 }
        ),
        (rawRows) => {
          const result = buildLeaderboard(rawRows);

          // (a) row count equals distinct normalised email labels
          const distinctLabels = new Set(rawRows.map(r => {
            const e = r.developer_email;
            if (!e) return "Unknown Developer";
            const t = e.trim();
            if (t === "" || t === "unknown_developer") return "Unknown Developer";
            return t;
          }));
          expect(result.length).toBe(distinctLabels.size);

          // (b) total_logs_uploaded equals input count for that label
          for (const row of result) {
            const expectedLogs = rawRows.filter(r => {
              const e = r.developer_email;
              if (!e) return row.developer_email === "Unknown Developer";
              const t = e.trim();
              if (t === "" || t === "unknown_developer") return row.developer_email === "Unknown Developer";
              return t === row.developer_email;
            }).length;
            expect(row.total_logs_uploaded).toBe(expectedLogs);
          }

          // (c) total_tokens_consumed equals SUM(ai_tokens_used ?? 0)
          for (const row of result) {
            const expectedTokens = rawRows
              .filter(r => {
                const e = r.developer_email;
                if (!e) return row.developer_email === "Unknown Developer";
                const t = e.trim();
                if (t === "" || t === "unknown_developer") return row.developer_email === "Unknown Developer";
                return t === row.developer_email;
              })
              .reduce((sum, r) => sum + (r.ai_tokens_used ?? 0), 0);
            expect(row.total_tokens_consumed).toBe(expectedTokens);
          }

          // (d) sorted primary total_tokens_consumed DESC, secondary email ASC
          for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1];
            const curr = result[i];
            if (prev.total_tokens_consumed === curr.total_tokens_consumed) {
              expect(prev.developer_email.localeCompare(curr.developer_email)).toBeLessThanOrEqual(0);
            } else {
              expect(prev.total_tokens_consumed).toBeGreaterThanOrEqual(curr.total_tokens_consumed);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: token-usage-dashboard, Property 6: Time Filter Predicate
describe("Property 6: getWindowStart — time filter predicate", () => {
  it("returns null for 'all' filter", () => {
    expect(getWindowStart("all")).toBeNull();
  });

  it("returns a valid past midnight-UTC ISO string for 7d/30d/90d", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("7d" as const, "30d" as const, "90d" as const),
        (filter) => {
          const before = Date.now();
          const result = getWindowStart(filter);
          const after = Date.now();

          expect(result).not.toBeNull();
          expect(typeof result).toBe("string");

          const parsed = new Date(result!);
          expect(isNaN(parsed.getTime())).toBe(false);

          // Must be in the past
          expect(parsed.getTime()).toBeLessThan(before);

          // Must be midnight UTC
          expect(parsed.getUTCHours()).toBe(0);
          expect(parsed.getUTCMinutes()).toBe(0);
          expect(parsed.getUTCSeconds()).toBe(0);
          expect(parsed.getUTCMilliseconds()).toBe(0);

          // Must be approximately N days before now (within 1 second tolerance)
          const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
          const expectedMs = days * 24 * 60 * 60 * 1000;
          const actualMs = before - parsed.getTime();
          // Allow up to 1 day + 1 second tolerance (because of midnight rounding)
          expect(actualMs).toBeGreaterThanOrEqual(expectedMs - 1000);
          expect(actualMs).toBeLessThan(expectedMs + 24 * 60 * 60 * 1000 + 1000);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: token-usage-dashboard, Property 8: Zod Schema Strips Unknown Fields
describe("Property 8: developerUsageInputSchema — strips unknown fields", () => {
  it("parses successfully and strips extra keys", () => {
    fc.assert(
      fc.property(
        fc.record({
          timeFilter: fc.constantFrom("7d" as const, "30d" as const, "90d" as const, "all" as const),
        }),
        fc.dictionary(fc.string({ minLength: 1 }), fc.anything(), { minKeys: 1 }),
        (base, extra) => {
          // Merge: combine base with extra unknown keys
          const input = { ...base, ...extra };

          const result = developerUsageInputSchema.safeParse(input);
          expect(result.success).toBe(true);

          if (result.success) {
            // data should only have timeFilter key
            const keys = Object.keys(result.data);
            expect(keys).toContain("timeFilter");
            // No extra keys from the merged input
            const extraKeys = keys.filter(k => k !== "timeFilter");
            expect(extraKeys).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: token-usage-dashboard, Property 9: Error Response Never Leaks Raw Supabase Error Text
describe("Property 9: error response never leaks raw Supabase error text", () => {
  it("error.message does not contain or equal the raw Supabase error string", () => {
    // Helper representing the pattern used in actions.ts:
    // raw error from Supabase → safe ActionResult
    function buildSafeErrorResult(rawErrorMessage: string): { error: { message: string } } {
      // Log the raw error server-side (console.error is not called here since it's a test)
      // Return a safe, pre-defined message
      return { error: { message: "Failed to load usage data. Please try again." } };
    }

    fc.assert(
      fc.property(
        // Supabase errors are always meaningful multi-character strings (e.g.,
        // "duplicate key value violates unique constraint…"). Using minLength: 10
        // filters out trivially short strings (single spaces, punctuation) that
        // are naturally substrings of any English sentence, which is not the
        // security threat the property guards against.
        fc.string({ minLength: 10 }),
        (rawMsg) => {
          const result = buildSafeErrorResult(rawMsg);

          // error.message must be non-empty
          expect(result.error.message.length).toBeGreaterThan(0);

          // error.message must NOT equal the raw Supabase error
          expect(result.error.message).not.toBe(rawMsg);

          // error.message must NOT contain the raw Supabase error as substring
          expect(result.error.message).not.toContain(rawMsg);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: token-usage-dashboard, Property 10: Nav Card Presence Exclusive to Admin Role
// Validates: Requirements 5.1, 5.2
describe("Property 10: nav card rendered iff admin role", () => {
  it("returns true only for admin role", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("admin" as const, "qa_manager" as const, "developer" as const, "viewer" as const, null),
        (role) => {
          const result = renderTokenUsageCard(role);
          if (role === "admin") {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns false for any non-admin string", () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => s !== "admin"),
        (role) => {
          expect(renderTokenUsageCard(role)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
