// omnis-ui/components/triage-badge.tsx
//
// TriageBadge — Navigation badge showing the pending AI triage count.
//
// Server Component fragment rendered in the DashboardLayout nav adjacent to
// the Triage Inbox link. No "use client" directive — this is pure JSX with
// zero interactivity.
//
// Design system compliance (QAVRO dark-canvas):
//   - rounded-none (0px border radius — no pills)
//   - border 1px solid — primary accent color (violet) for nav context
//   - no shadow-* utilities
//   - no arbitrary Tailwind values
//   - Uses border-violet-500 text-violet-400 per QAVRO nav accent
//   - text-xs font-medium px-1.5 py-0.5
//
// Role gate (Requirements 8.4):
//   - Renders ONLY for role === 'admin' or role === 'qa_manager'
//   - Returns null for 'developer', 'viewer', or any other role string
//

import React from "react";
// Count display (Requirements 8.2, 8.3):
//   - count === 0  → null (badge absent from DOM)
//   - 1 ≤ count ≤ 99 → String(count)
//   - count > 99  → "99+"
//
// formatBadgeCount is exported as a named export so property tests can
// exercise the pure logic without rendering React (Property 11).

interface TriageBadgeProps {
  count: number;
  role: string;
}

/**
 * Pure helper: maps a pending count to the badge display string.
 *
 * Returns null  when count === 0 (badge must not render).
 * Returns "99+" when count > 99 (cap per Requirement 8.3).
 * Returns String(count) for 1–99.
 */
export function formatBadgeCount(count: number): string | null {
  if (count === 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

/**
 * TriageBadge — displays the pending triage count in the nav.
 *
 * Returns null (nothing in DOM) when:
 *   - count === 0
 *   - role is 'developer' or 'viewer'
 */
export function TriageBadge({ count, role }: TriageBadgeProps): React.JSX.Element | null {
  // Role gate — only admin and qa_manager see the badge (Requirement 8.4)
  if (role === "developer" || role === "viewer") return null;
  if (role !== "admin" && role !== "qa_manager") return null;

  const label = formatBadgeCount(count);

  // Zero-count gate — badge must not appear in DOM (Requirement 8.2)
  if (label === null) return null;

  return (
    <span
      aria-label={`${count} pending triage item${count === 1 ? "" : "s"}`}
      className="inline-flex items-center rounded-none border border-violet-500 px-1.5 py-0.5 text-xs font-medium text-violet-400"
    >
      {label}
    </span>
  );
}
