// Feature: triage-inbox-resolution, Property 15: Non-pending items never render action buttons

/**
 * Validates: Requirement 9.5
 *
 * For any AiTriageQueueRow with status = 'approved' or status = 'rejected',
 * the TriageItemCard must NOT render the "Approve AI Fix" or
 * "Reject / Keep Original" buttons regardless of the active filter or user role.
 */

import { render, screen, cleanup } from "@testing-library/react";
import fc from "fast-check";
import { TriageItemCard } from "@/components/triage-item-card";
import { fcAiTriageQueueRow } from "../test-fixtures";
import type { AiTriageQueueRow } from "../test-fixtures";
import type { AiTriageQueueRow as SupabaseRow } from "@/types/supabase";
import { describe, it, expect, afterEach } from "vitest";

// Cast helper: the test-fixture type allows ai_reasoning: string | null, but
// the Supabase-generated type declares it as string. The component's runtime
// logic handles null/falsy fine — we cast to satisfy TypeScript.
function toCardItem(row: AiTriageQueueRow): SupabaseRow {
  return row as unknown as SupabaseRow;
}

const noop = () => {};

afterEach(() => {
  cleanup();
});

describe("Property 15 — TriageItemCard: non-pending items never render action buttons", () => {
  it("does not render Approve or Reject buttons for any resolved (approved/rejected) item", () => {
    const resolvedRow = fcAiTriageQueueRow({
      status: fc.constantFrom("approved", "rejected"),
    });

    fc.assert(
      fc.property(resolvedRow, (row) => {
        const { unmount } = render(
          <TriageItemCard
            item={toCardItem(row)}
            isInFlight={false}
            isViewerOwned={false}
            onApprove={noop}
            onReject={noop}
          />,
        );

        // No button with aria-label containing "Approve AI fix" should exist
        const approveButtons = screen.queryAllByRole("button", {
          name: /approve ai fix/i,
        });

        // No button with aria-label containing "Reject: keep original" should exist
        const rejectButtons = screen.queryAllByRole("button", {
          name: /reject.*keep original/i,
        });

        unmount();

        return approveButtons.length === 0 && rejectButtons.length === 0;
      }),
      { numRuns: 50 },
    );
  });
});
