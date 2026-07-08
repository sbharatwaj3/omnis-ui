// Feature: triage-inbox-resolution
// Unit tests: TriageItemCard UI rules
// Requirements: 2.3, 2.8, 3.8, 4.5, 6.4, 11.2, 12.6, 12.7

import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TriageItemCard } from "@/components/triage-item-card";
import type { AiTriageQueueRow } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Base test fixture (pending item — buttons are rendered)
// ---------------------------------------------------------------------------

const baseItem: AiTriageQueueRow = {
  id: "test-id-1234",
  evidence_log_id: "abcd1234-0000-0000-0000-000000001234",
  original_req_id: "CFR-820.30",
  suggested_req_id: "IEC-62304-5.1",
  ai_reasoning: "The AI reasoning text.",
  status: "pending",
  created_at: "2024-06-24T14:32:00.000Z",
};

// Default no-op handlers
const noop = vi.fn();

// ---------------------------------------------------------------------------
// Helper: collect all class strings from the rendered subtree
// ---------------------------------------------------------------------------
function getAllClasses(container: HTMLElement): string {
  return Array.from(container.querySelectorAll("[class]"))
    .map((el) => el.getAttribute("class") ?? "")
    .join(" ");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TriageItemCard — AI reasoning placeholder", () => {
  it("renders placeholder text when ai_reasoning is null", () => {
    const item = { ...baseItem, ai_reasoning: null } as unknown as AiTriageQueueRow;
    const { container } = render(
      <TriageItemCard
        item={item}
        isInFlight={false}
        isViewerOwned={false}
        onApprove={noop}
        onReject={noop}
      />,
    );
    expect(container.innerHTML).toContain("No AI reasoning provided");
  });

  it("renders placeholder text when ai_reasoning is an empty string", () => {
    const item = { ...baseItem, ai_reasoning: "" };
    const { container } = render(
      <TriageItemCard
        item={item}
        isInFlight={false}
        isViewerOwned={false}
        onApprove={noop}
        onReject={noop}
      />,
    );
    expect(container.innerHTML).toContain("No AI reasoning provided");
  });
});

describe("TriageItemCard — isInFlight loading state", () => {
  it("both buttons have aria-disabled=\"true\" when isInFlight=true", () => {
    const { container } = render(
      <TriageItemCard
        item={baseItem}
        isInFlight={true}
        isViewerOwned={false}
        onApprove={noop}
        onReject={noop}
      />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);
    for (const btn of buttons) {
      expect(btn.getAttribute("aria-disabled")).toBe("true");
    }
  });

  it("renders a Loader2 spinner (SVG with animate-spin) when isInFlight=true", () => {
    const { container } = render(
      <TriageItemCard
        item={baseItem}
        isInFlight={true}
        isViewerOwned={false}
        onApprove={noop}
        onReject={noop}
      />,
    );

    // The Loader2 icon renders as an SVG; the component adds animate-spin class
    const spinners = container.querySelectorAll("svg.animate-spin");
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });
});

describe("TriageItemCard — isViewerOwned disabled state", () => {
  it("both buttons are disabled when isViewerOwned=true", () => {
    const { container } = render(
      <TriageItemCard
        item={baseItem}
        isInFlight={false}
        isViewerOwned={true}
        onApprove={noop}
        onReject={noop}
      />,
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);
    for (const btn of buttons) {
      // The HTML `disabled` property is true when the attribute is present
      expect(btn.disabled).toBe(true);
    }
  });

  it("renders tooltip text 'You cannot resolve your own submission' when isViewerOwned=true", () => {
    const { container } = render(
      <TriageItemCard
        item={baseItem}
        isInFlight={false}
        isViewerOwned={true}
        onApprove={noop}
        onReject={noop}
      />,
    );
    expect(container.innerHTML).toContain(
      "You cannot resolve your own submission",
    );
  });
});

describe("TriageItemCard — design system classes", () => {
  it("card root has bg-gray-900, border-slate-700, and rounded-sm classes", () => {
    const { container } = render(
      <TriageItemCard
        item={baseItem}
        isInFlight={false}
        isViewerOwned={false}
        onApprove={noop}
        onReject={noop}
      />,
    );

    const allClasses = getAllClasses(container);
    expect(allClasses).toContain("bg-gray-900");
    expect(allClasses).toContain("border-slate-700");
    expect(allClasses).toContain("rounded-sm");
  });

  it("the element displaying the evidence_log_id has font-mono class", () => {
    const { container } = render(
      <TriageItemCard
        item={baseItem}
        isInFlight={false}
        isViewerOwned={false}
        onApprove={noop}
        onReject={noop}
      />,
    );

    // The evidence_log_id is rendered truncated: first-8 + … + last-4.
    // Find the element with the title attribute set to the full UUID.
    const evidenceSpan = container.querySelector(
      `[title="${baseItem.evidence_log_id}"]`,
    );
    expect(evidenceSpan).not.toBeNull();
    expect(evidenceSpan!.className).toContain("font-mono");
  });
});

describe("TriageItemCard — no shadow classes in rendered output", () => {
  it("no class attribute anywhere in the rendered tree contains 'shadow'", () => {
    const { container } = render(
      <TriageItemCard
        item={baseItem}
        isInFlight={false}
        isViewerOwned={false}
        onApprove={noop}
        onReject={noop}
      />,
    );

    const allElements = container.querySelectorAll("[class]");
    for (const el of Array.from(allElements)) {
      const cls = el.getAttribute("class") ?? "";
      expect(cls).not.toMatch(/\bshadow\b/);
    }
  });
});
