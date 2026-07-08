/**
 * omnis-ui/__tests__/triage/unit/triage-skeleton.test.tsx
 *
 * Unit tests for the TriageSkeleton component.
 *
 * Validates:
 * - Exactly 3 skeleton cards are rendered
 * - Each card carries the required design-system classes
 * - No shadow classes appear anywhere in the output
 * - Each card has at least 3 children (1 header + 2 body lines)
 */

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TriageSkeleton } from "@/components/triage-skeleton";

describe("TriageSkeleton", () => {
  it("renders exactly 3 skeleton cards", () => {
    const { container } = render(<TriageSkeleton />);

    // The skeleton cards are direct children of the wrapper div
    const wrapper = container.firstElementChild!;
    const cards = Array.from(wrapper.children);

    expect(cards).toHaveLength(3);
  });

  it("applies animate-pulse to every skeleton card", () => {
    const { container } = render(<TriageSkeleton />);

    const wrapper = container.firstElementChild!;
    const cards = Array.from(wrapper.children);

    for (const card of cards) {
      expect(card.className).toContain("animate-pulse");
    }
  });

  it("applies bg-slate-800 to every skeleton card", () => {
    const { container } = render(<TriageSkeleton />);

    const wrapper = container.firstElementChild!;
    const cards = Array.from(wrapper.children);

    for (const card of cards) {
      expect(card.className).toContain("bg-slate-800");
    }
  });

  it("applies border-slate-700 to every skeleton card", () => {
    const { container } = render(<TriageSkeleton />);

    const wrapper = container.firstElementChild!;
    const cards = Array.from(wrapper.children);

    for (const card of cards) {
      expect(card.className).toContain("border-slate-700");
    }
  });

  it("applies rounded-sm to every skeleton card", () => {
    const { container } = render(<TriageSkeleton />);

    const wrapper = container.firstElementChild!;
    const cards = Array.from(wrapper.children);

    for (const card of cards) {
      expect(card.className).toContain("rounded-sm");
    }
  });

  it("renders no shadow classes anywhere in the output (design system: flat elevation only)", () => {
    const { container } = render(<TriageSkeleton />);

    // Walk every element in the subtree and assert no shadow-* class is present
    const allElements = container.querySelectorAll("*");
    for (const el of Array.from(allElements)) {
      // Match shadow, shadow-sm, shadow-md, shadow-lg, shadow-xl, shadow-2xl, shadow-inner, etc.
      expect(el.className).not.toMatch(/\bshadow\b/);
    }
  });

  it("gives each card at least 3 children (1 header placeholder + 2 body placeholders)", () => {
    const { container } = render(<TriageSkeleton />);

    const wrapper = container.firstElementChild!;
    const cards = Array.from(wrapper.children);

    for (const card of cards) {
      expect(card.children.length).toBeGreaterThanOrEqual(3);
    }
  });
});
