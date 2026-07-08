// Feature: triage-inbox-resolution, Property 2: Sort order invariant

import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fcNonEmptyTriageRowArray, type AiTriageQueueRow } from "../test-fixtures";

/**
 * Validates: Requirements 1.2, 9.4
 *
 * The sort logic extracted as a pure function from TriageQueueClient's
 * displayItems useMemo computation — identical implementation, no React
 * dependency, safe to call directly in a property test.
 */
function sortItems(
  items: AiTriageQueueRow[],
  sortOrder: "oldest_first" | "newest_first",
): AiTriageQueueRow[] {
  return [...items].sort((a, b) => {
    const diff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortOrder === "oldest_first" ? diff : -diff;
  });
}

describe("sortItems — sort order invariant", () => {
  it("oldest_first produces non-decreasing created_at order", () => {
    fc.assert(
      fc.property(fcNonEmptyTriageRowArray(), (items) => {
        const sorted = sortItems(items, "oldest_first");
        for (let i = 1; i < sorted.length; i++) {
          const prev = new Date(sorted[i - 1].created_at).getTime();
          const curr = new Date(sorted[i].created_at).getTime();
          expect(curr).toBeGreaterThanOrEqual(prev);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("newest_first produces non-increasing created_at order", () => {
    fc.assert(
      fc.property(fcNonEmptyTriageRowArray(), (items) => {
        const sorted = sortItems(items, "newest_first");
        for (let i = 1; i < sorted.length; i++) {
          const prev = new Date(sorted[i - 1].created_at).getTime();
          const curr = new Date(sorted[i].created_at).getTime();
          expect(curr).toBeLessThanOrEqual(prev);
        }
      }),
      { numRuns: 100 },
    );
  });
});
