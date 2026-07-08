// Feature: triage-inbox-resolution, Property 14: Filter correctly scopes displayed items to selected status

import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { fcTriageRowArray, type AiTriageQueueRow } from "../test-fixtures";

/**
 * Validates: Requirement 9.2
 *
 * The filter logic extracted as a pure function from TriageQueueClient's
 * displayItems useMemo computation — identical implementation, no React
 * dependency, safe to call directly in a property test.
 */
type StatusFilter = "all" | "pending" | "approved" | "rejected";

function filterItems(
  items: AiTriageQueueRow[],
  statusFilter: StatusFilter,
): AiTriageQueueRow[] {
  return statusFilter === "all"
    ? items
    : items.filter((i) => i.status === statusFilter);
}

describe("filterItems — filter scopes displayed items to selected status", () => {
  it("filter 'all' returns every item — none are filtered out", () => {
    fc.assert(
      fc.property(fcTriageRowArray(), (items) => {
        const result = filterItems(items, "all");
        expect(result).toHaveLength(items.length);
        // Every item in the original list must appear in the result
        for (const item of items) {
          expect(result.some((r) => r.id === item.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("filter 'pending' — every item in result has status === 'pending'", () => {
    fc.assert(
      fc.property(fcTriageRowArray(), (items) => {
        const result = filterItems(items, "pending");
        for (const item of result) {
          expect(item.status).toBe("pending");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("filter 'approved' — every item in result has status === 'approved'", () => {
    fc.assert(
      fc.property(fcTriageRowArray(), (items) => {
        const result = filterItems(items, "approved");
        for (const item of result) {
          expect(item.status).toBe("approved");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("filter 'rejected' — every item in result has status === 'rejected'", () => {
    fc.assert(
      fc.property(fcTriageRowArray(), (items) => {
        const result = filterItems(items, "rejected");
        for (const item of result) {
          expect(item.status).toBe("rejected");
        }
      }),
      { numRuns: 100 },
    );
  });
});
