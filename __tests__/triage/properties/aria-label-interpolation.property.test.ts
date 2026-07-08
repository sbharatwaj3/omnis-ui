// Feature: triage-inbox-resolution, Property 17: aria-labels contain interpolated req_id values for any triage item
/**
 * Validates: Requirement 12.1
 *
 * For any AiTriageQueueRow with pending status, the "Approve AI Fix" button's
 * aria-label must contain the exact suggested_req_id value, and the
 * "Reject / Keep Original" button's aria-label must contain the exact
 * original_req_id value. The interpolation must use the actual field values,
 * not placeholder strings.
 */

import { describe, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fc from "fast-check";
import React from "react";
import { TriageItemCard } from "@/components/triage-item-card";
import { fcUuid, fcIsoTimestamp } from "../test-fixtures";

// ---------------------------------------------------------------------------
// Local generator: pending triage row with arbitrary req_id strings.
// Uses fc.string({ minLength: 4, maxLength: 32 }) as specified by the task,
// rather than fcReqId which applies a regex constraint.
// ---------------------------------------------------------------------------
const fcPendingRowWithArbitraryReqIds = () =>
  fc.record({
    id: fcUuid(),
    evidence_log_id: fcUuid(),
    original_req_id: fc.string({ minLength: 4, maxLength: 32 }),
    suggested_req_id: fc.string({ minLength: 4, maxLength: 32 }),
    ai_reasoning: fc.oneof(
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.constant(null),
    ),
    status: fc.constant("pending" as const),
    created_at: fcIsoTimestamp(),
  });

// ---------------------------------------------------------------------------
// Property 17: aria-labels contain interpolated req_id values
// ---------------------------------------------------------------------------

describe("Property 17: aria-labels contain interpolated req_id values for any triage item", () => {
  it(
    "Approve button aria-label contains suggested_req_id and Reject button aria-label contains original_req_id",
    () => {
      fc.assert(
        fc.property(
          fcPendingRowWithArbitraryReqIds(),
          (item) => {
            // ---- Arrange & Act -------------------------------------------
            render(
              React.createElement(TriageItemCard, {
                item,
                isInFlight: false,
                isViewerOwned: false,
                onApprove: () => {},
                onReject: () => {},
              }),
            );

            // ---- Assert: Approve button aria-label -----------------------
            const approveButton = screen.getByRole("button", {
              name: /Approve AI fix/i,
            });
            const approveLabel = approveButton.getAttribute("aria-label") ?? "";
            if (!approveLabel.includes(item.suggested_req_id)) {
              cleanup();
              throw new Error(
                `Approve button aria-label "${approveLabel}" does not contain suggested_req_id "${item.suggested_req_id}"`,
              );
            }

            // ---- Assert: Reject button aria-label ------------------------
            const rejectButton = screen.getByRole("button", {
              name: /Reject: keep original/i,
            });
            const rejectLabel = rejectButton.getAttribute("aria-label") ?? "";
            if (!rejectLabel.includes(item.original_req_id)) {
              cleanup();
              throw new Error(
                `Reject button aria-label "${rejectLabel}" does not contain original_req_id "${item.original_req_id}"`,
              );
            }

            // ---- Cleanup between runs ------------------------------------
            cleanup();
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
