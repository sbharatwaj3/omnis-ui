// Feature: triage-inbox-resolution, Property 4: Card renders all required fields correctly for any triage item

/**
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8
 *
 * For any AiTriageQueueRow, TriageItemCard must render all 7 required fields:
 *   (a) original_req_id with "Developer Tag" label
 *   (b) suggested_req_id with "AI Suggestion" label
 *   (c) evidence_log_id truncated (first-8 + … + last-4) in font-mono, full UUID in title
 *   (d) created_at formatted with "UTC" suffix in a font-mono element
 *   (e) text-yellow-400 for original_req_id / text-blue-400 for suggested_req_id when they differ
 *   (f) ai_triage_queue.id UUID must NOT appear as a visible text node
 *   (g) "No AI reasoning provided" placeholder when ai_reasoning is null or empty string
 */

import React from "react";
import { render, cleanup } from "@testing-library/react";
import fc from "fast-check";
import { TriageItemCard } from "@/components/triage-item-card";
import { fcAiTriageQueueRow, fcPendingTriageRow } from "../test-fixtures";
import type { AiTriageQueueRow } from "../test-fixtures";
import type { AiTriageQueueRow as SupabaseRow } from "@/types/supabase";
import { describe, it, expect, afterEach } from "vitest";

// Cast helper: the test-fixture type allows ai_reasoning: string | null, but
// the Supabase-generated type declares it as string. The component's runtime
// logic handles null/falsy values correctly — we cast to satisfy TypeScript.
function toCardItem(row: AiTriageQueueRow): SupabaseRow {
  return row as unknown as SupabaseRow;
}

// Standard no-op handlers for required callbacks
const noop = () => {};

// Convenience render wrapper
function renderCard(row: AiTriageQueueRow) {
  return render(
    <TriageItemCard
      item={toCardItem(row)}
      isInFlight={false}
      isViewerOwned={false}
      onApprove={noop}
      onReject={noop}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("Property 4 — TriageItemCard renders all required fields", () => {
  // ---------------------------------------------------------------------------
  // (a) original_req_id with "Developer Tag" label
  // (b) suggested_req_id with "AI Suggestion" label
  // ---------------------------------------------------------------------------
  it("(a+b) renders original_req_id under 'Developer Tag' and suggested_req_id under 'AI Suggestion'", () => {
    fc.assert(
      fc.property(fcAiTriageQueueRow(), (row) => {
        const { unmount, container } = renderCard(row);

        // (a) "Developer Tag" label is visible (case-insensitive search in innerHTML)
        expect(container.innerHTML.toLowerCase()).toContain("developer tag");

        // original_req_id value is rendered somewhere in the card
        expect(container.innerHTML).toContain(row.original_req_id);

        // (b) "AI Suggestion" label is visible
        expect(container.innerHTML.toLowerCase()).toContain("ai suggestion");

        // suggested_req_id value is rendered somewhere in the card
        expect(container.innerHTML).toContain(row.suggested_req_id);

        unmount();
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // (c) evidence_log_id truncated to first-8 + … + last-4 in font-mono,
  //     full UUID in title attribute
  // ---------------------------------------------------------------------------
  it("(c) renders evidence_log_id truncated with first-8+ellipsis+last-4, full UUID in title", () => {
    fc.assert(
      fc.property(fcAiTriageQueueRow(), (row) => {
        const { unmount, container } = renderCard(row);

        const expectedFirst8 = row.evidence_log_id.slice(0, 8);
        const expectedLast4 = row.evidence_log_id.slice(-4);
        // U+2026 ellipsis character used by truncateUuid()
        const expectedTruncated = `${expectedFirst8}\u2026${expectedLast4}`;

        // The truncated text must appear in the rendered HTML
        expect(container.innerHTML).toContain(expectedFirst8);
        expect(container.innerHTML).toContain(expectedLast4);

        // Find the element with the title attribute set to the full UUID
        const titleEl = container.querySelector(
          `[title="${row.evidence_log_id}"]`,
        );
        expect(titleEl).not.toBeNull();

        // That element must have font-mono class
        expect(titleEl!.className).toContain("font-mono");

        // Its text content must be the truncated form
        expect(titleEl!.textContent).toBe(expectedTruncated);

        unmount();
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // (d) created_at formatted with "UTC" suffix in a font-mono element
  // ---------------------------------------------------------------------------
  it("(d) renders created_at with 'UTC' suffix in a font-mono element", () => {
    fc.assert(
      fc.property(fcAiTriageQueueRow(), (row) => {
        const { unmount, container } = renderCard(row);

        // Find all font-mono elements and check one contains "UTC"
        const monoEls = container.querySelectorAll(".font-mono");
        const hasUtcInMono = Array.from(monoEls).some((el) =>
          el.textContent?.includes("UTC"),
        );
        expect(hasUtcInMono).toBe(true);

        unmount();
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // (e) text-yellow-400 for original_req_id and text-blue-400 for
  //     suggested_req_id when the two values differ
  // ---------------------------------------------------------------------------
  it("(e) applies text-yellow-400 to original_req_id and text-blue-400 to suggested_req_id when they differ", () => {
    fc.assert(
      fc.property(
        fcPendingTriageRow().filter(
          (row) => row.original_req_id !== row.suggested_req_id,
        ),
        (row) => {
          const { unmount, container } = renderCard(row);

          // Find all elements containing original_req_id text and check one has text-yellow-400
          const allEls = Array.from(container.querySelectorAll("[class]"));

          const origHasYellow = allEls.some(
            (el) =>
              el.textContent === row.original_req_id &&
              el.className.includes("text-yellow-400"),
          );
          expect(origHasYellow).toBe(true);

          // Find all elements containing suggested_req_id text and check one has text-blue-400
          const suggestedHasBlue = allEls.some(
            (el) =>
              el.textContent === row.suggested_req_id &&
              el.className.includes("text-blue-400"),
          );
          expect(suggestedHasBlue).toBe(true);

          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // (f) item.id (ai_triage_queue UUID) must NOT appear as a visible text node
  // ---------------------------------------------------------------------------
  it("(f) ai_triage_queue.id UUID does not appear as a visible text node", () => {
    fc.assert(
      fc.property(fcAiTriageQueueRow(), (row) => {
        const { unmount, container } = renderCard(row);

        // The item's UUID id must not appear anywhere in the rendered text
        expect(container.textContent ?? "").not.toContain(row.id);

        unmount();
      }),
      { numRuns: 50 },
    );
  });

  // ---------------------------------------------------------------------------
  // (g) "No AI reasoning provided" placeholder when ai_reasoning is null or ""
  // ---------------------------------------------------------------------------
  it("(g) renders 'No AI reasoning provided' placeholder when ai_reasoning is null or empty string", () => {
    fc.assert(
      fc.property(
        fcAiTriageQueueRow({
          ai_reasoning: fc.oneof(fc.constant(null), fc.constant("")),
        }),
        (row) => {
          const { unmount, container } = renderCard(row);

          expect(container.innerHTML).toContain("No AI reasoning provided");

          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });
});
