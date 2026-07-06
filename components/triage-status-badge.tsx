"use client";
// omnis-ui/components/triage-status-badge.tsx
//
// TriageStatusBadge — QAVRO design system compliance status badge.
//
// Flat, square badge with 1px semantic-color border and transparent background.
// Conforms to the QAVRO dark-canvas design system:
//   - rounded-none (0px border radius — no pills, no rounding)
//   - border 1px solid in the semantic status color
//   - transparent background (no solid fill)

import React from "react";
//   - uppercase text
//   - no box-shadow, no shadow-* utilities
//
// Status → color mapping (Requirement 11.5):
//   PENDING  : border-yellow-500 text-yellow-500
//   APPROVED : border-green-500  text-green-500
//   REJECTED : border-red-500    text-red-500

const STATUS_CLASSES: Record<
  "pending" | "approved" | "rejected",
  string
> = {
  pending: "border-yellow-500 text-yellow-500",
  approved: "border-green-500 text-green-500",
  rejected: "border-red-500 text-red-500",
};

interface TriageStatusBadgeProps {
  status: "pending" | "approved" | "rejected";
}

export function TriageStatusBadge({
  status,
}: TriageStatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-none border px-2 py-0.5 text-xs font-medium uppercase ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}
