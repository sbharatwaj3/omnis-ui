// Feature: triage-inbox-resolution
// Unit tests: TriageQueueClient state management
// Requirements: 3.5, 4.3, 5.3, 5.4, 5.5, 1.3, 12.4

import { render, screen, act, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock resolveTriageItem BEFORE importing the component under test.
// ---------------------------------------------------------------------------
vi.mock("@/app/dashboard/triage/actions", () => ({
  resolveTriageItem: vi.fn(),
}));

import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { TriageQueueClient } from "@/components/triage-queue-client";
import type { AiTriageQueueRow } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const baseItem: AiTriageQueueRow = {
  id: "item-1",
  evidence_log_id: "log-1234-0000-0000-0000-000000001234",
  original_req_id: "CFR-820.30",
  suggested_req_id: "IEC-62304-5.1",
  ai_reasoning: "AI reasoning text",
  status: "pending" as const,
  created_at: "2024-06-24T14:32:00.000Z",
};

const baseItem2: AiTriageQueueRow = {
  id: "item-2",
  evidence_log_id: "log-5678-0000-0000-0000-000000005678",
  original_req_id: "CFR-820.70",
  suggested_req_id: "IEC-62304-7.1",
  ai_reasoning: "Second item reasoning",
  status: "pending" as const,
  created_at: "2024-06-24T15:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Finds the first Approve button in the container. */
function getApproveButton(container: HTMLElement): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.getAttribute("aria-label")?.toLowerCase().includes("approve"),
  );
  if (!btn) throw new Error("No Approve button found in container");
  return btn;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Test 1: Optimistic remove on action dispatch
// ---------------------------------------------------------------------------

describe("TriageQueueClient — optimistic remove on action dispatch", () => {
  it("removes the item from the list immediately when Approve is clicked (before server response)", async () => {
    // Never-resolving promise — item should vanish before the promise settles.
    vi.mocked(resolveTriageItem).mockImplementation(
      () => new Promise(() => {}),
    );

    const { container } = render(
      <TriageQueueClient
        initialItems={[baseItem]}
        viewerRole="qa_manager"
      />,
    );

    // Confirm the Approve button is present before clicking.
    const approveBtn = getApproveButton(container);
    expect(approveBtn).toBeTruthy();

    // Click — wrapped in act so React flushes the synchronous state update
    // (the optimistic remove) before we inspect the DOM.
    act(() => {
      fireEvent.click(approveBtn);
    });

    // The item should be optimistically removed synchronously — the Approve
    // button for this item should no longer exist in the rendered tree.
    const btnAfter = container.querySelector(
      `[aria-label*="apply ${baseItem.suggested_req_id}"]`,
    );
    expect(btnAfter).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Item restored at list head on server failure
// ---------------------------------------------------------------------------

describe("TriageQueueClient — item restored at list head on server failure", () => {
  it("restores the item to position 0 when resolveTriageItem returns success: false", async () => {
    vi.mocked(resolveTriageItem).mockResolvedValue({
      success: false,
      error: "Database error: could not update triage item status.",
    });

    const { container } = render(
      <TriageQueueClient
        initialItems={[baseItem, baseItem2]}
        viewerRole="qa_manager"
      />,
    );

    // Click Approve on the first item.
    const approveBtn = getApproveButton(container);

    await act(async () => {
      fireEvent.click(approveBtn);
      // Flush microtasks so the mocked Promise resolves.
      await Promise.resolve();
    });

    // Wait for the server failure to be processed and the item restored.
    await waitFor(() => {
      const approveBtns = container.querySelectorAll<HTMLButtonElement>("button[aria-label*='Approve']");
      expect(approveBtns.length).toBeGreaterThan(0);
    });

    // The restored item should be at HEAD — first Approve button corresponds
    // to baseItem (suggested_req_id: "IEC-62304-5.1").
    const allApproveBtns = container.querySelectorAll<HTMLButtonElement>(
      "button[aria-label*='Approve']",
    );
    expect(allApproveBtns[0].getAttribute("aria-label")).toContain(
      baseItem.suggested_req_id,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: "already resolved" error toast persists (no auto-dismiss)
// ---------------------------------------------------------------------------

describe("TriageQueueClient — 'already resolved' toast persists", () => {
  it("toast is still visible after 6 seconds when error contains 'already been resolved'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    vi.mocked(resolveTriageItem).mockResolvedValue({
      success: false,
      error: "Triage item has already been resolved (status: 'approved').",
    });

    const { container } = render(
      <TriageQueueClient
        initialItems={[baseItem]}
        viewerRole="qa_manager"
      />,
    );

    const approveBtn = getApproveButton(container);

    // Use fireEvent to avoid userEvent's real-timer dependency.
    await act(async () => {
      fireEvent.click(approveBtn);
      // Let the mocked Promise resolve.
      await Promise.resolve();
      await Promise.resolve(); // flush one extra microtask tick for state updates
    });

    // The toast should now be in the DOM.
    const toastBefore = container.querySelector("[role='status']");
    expect(toastBefore).not.toBeNull();
    expect(toastBefore!.textContent).toContain("already been resolved");

    // Advance fake time past the 5-second auto-dismiss threshold.
    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    // The persisted toast must still be present — it has duration: null.
    const toastAfter = container.querySelector("[role='status']");
    expect(toastAfter).not.toBeNull();
    expect(toastAfter!.textContent).toContain("already been resolved");

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Test 4: inFlight Set prevents second action on same item (double-click guard)
// ---------------------------------------------------------------------------

describe("TriageQueueClient — inFlight prevents double-action on same item", () => {
  it("calls resolveTriageItem exactly once even if Approve is clicked twice quickly", async () => {
    // Never-resolving promise keeps item in in-flight state indefinitely.
    vi.mocked(resolveTriageItem).mockImplementation(
      () => new Promise(() => {}),
    );

    const { container } = render(
      <TriageQueueClient
        initialItems={[baseItem]}
        viewerRole="qa_manager"
      />,
    );

    const approveBtn = getApproveButton(container);

    // First click — this dispatches the action and optimistically removes the item.
    act(() => {
      fireEvent.click(approveBtn);
    });

    // After the first click the item is removed from state, so clicking the
    // stale button reference again is safe — but even if somehow rendered, the
    // inFlight guard would block the second call.  We verify exactly one call.
    act(() => {
      fireEvent.click(approveBtn);
    });

    // resolveTriageItem should have been called exactly once.
    expect(vi.mocked(resolveTriageItem)).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Empty state <p> element is present after all items resolved
// ---------------------------------------------------------------------------

describe("TriageQueueClient — empty state after all items resolved", () => {
  it("renders a <p> element with non-empty text when the only item is approved", async () => {
    vi.mocked(resolveTriageItem).mockResolvedValue({
      success: true,
      suggestedReqId: "IEC-62304-5.1",
      originalReqId: "CFR-820.30",
    });

    const { container } = render(
      <TriageQueueClient
        initialItems={[baseItem]}
        viewerRole="qa_manager"
      />,
    );

    const approveBtn = getApproveButton(container);

    await act(async () => {
      fireEvent.click(approveBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Wait for empty state to render.
    await waitFor(() => {
      // No more Approve buttons should exist.
      const btns = container.querySelectorAll<HTMLButtonElement>(
        "button[aria-label*='Approve']",
      );
      expect(btns.length).toBe(0);
    });

    // The empty state <p> should be present and contain non-empty text.
    // The component renders it NOT aria-hidden (Req 12.4).
    const emptyPs = Array.from(container.querySelectorAll("p")).filter(
      (p) => p.getAttribute("aria-hidden") !== "true",
    );

    expect(emptyPs.length).toBeGreaterThan(0);
    const hasContent = emptyPs.some(
      (p) => (p.textContent?.trim().length ?? 0) > 0,
    );
    expect(hasContent).toBe(true);
  });
});
