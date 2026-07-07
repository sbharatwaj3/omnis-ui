"use client";
// omnis-ui/components/triage-item-card.tsx
//
// TriageItemCard — QAVRO dark-canvas card for a single ai_triage_queue row.

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { TriageStatusBadge } from "@/components/triage-status-badge";
import type { AiTriageQueueRow } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Formatting helpers (Requirements 2.4, 2.5)
// ---------------------------------------------------------------------------

/**
 * Truncates a UUID to first-8 + ellipsis + last-4 for display.
 * The full UUID is placed in the `title` attribute of the wrapping element.
 */
function truncateUuid(uuid: string): string {
  return `${uuid.slice(0, 8)}\u2026${uuid.slice(-4)}`;
}

/**
 * Formats an ISO timestamp as "MMM DD, HH:mm UTC" (e.g. "Jun 24, 14:32 UTC").
 * Uses toLocaleString with explicit UTC timezone — no moment/date-fns dependency.
 */
function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return (
    d
      .toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      })
      .replace(",", "") + " UTC"
  );
}

// ---------------------------------------------------------------------------
// Component interface
// ---------------------------------------------------------------------------

interface TriageItemCardProps {
  item: AiTriageQueueRow;
  /** True while a resolve action for this item is in-flight. */
  isInFlight: boolean;
  /** True when the viewer owns the evidence log — disables action buttons. */
  isViewerOwned: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

// ---------------------------------------------------------------------------
// TriageItemCard
// ---------------------------------------------------------------------------

export function TriageItemCard({
  item,
  isInFlight,
  isViewerOwned,
  onApprove,
  onReject,
}: TriageItemCardProps): React.JSX.Element {
  const isDisabled = isInFlight || isViewerOwned;
  const reqIdsDiffer = item.original_req_id !== item.suggested_req_id;

  // Collapsible AI Reasoning — collapsed by default
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);

  // Approve confirmation dialog state
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);

  function handleApprovClick() {
    setShowApproveConfirm(true);
  }

  function handleConfirmApprove() {
    setShowApproveConfirm(false);
    onApprove(item.id);
  }

  function handleCancelApprove() {
    setShowApproveConfirm(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="bg-white border border-zinc-200 rounded-sm hover:bg-zinc-50 p-4 transition-colors"
    >
      {/* ----------------------------------------------------------------- */}
      {/* Card header — status badge + evidence log ID + timestamp           */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Status badge (Requirement 11.5) */}
        <TriageStatusBadge status={item.status} />

        {/* Evidence log ID (Requirements 2.4, 11.4) — no item.id in DOM    */}
        {/* NOTE: item.id (ai_triage_queue.id) is intentionally NOT rendered */}
        <span
          title={item.evidence_log_id}
          className="font-mono text-xs text-zinc-500"
        >
          {truncateUuid(item.evidence_log_id)}
        </span>

        {/* Timestamp (Requirements 2.5, 11.4) */}
        <span className="font-mono text-xs text-zinc-400">
          {formatTimestamp(item.created_at)}
        </span>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* req_id comparison row (Requirements 2.1, 2.2, 2.6)                */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Developer Tag */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
            Developer Tag
          </span>
          <span
            className={`font-mono text-sm ${
              reqIdsDiffer ? "text-amber-600" : "text-zinc-700"
            }`}
          >
            {item.original_req_id}
          </span>
        </div>

        {/* AI Suggestion */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
            AI Suggestion
          </span>
          <span
            className={`font-mono text-sm ${
              reqIdsDiffer ? "text-blue-600" : "text-zinc-700"
            }`}
          >
            {item.suggested_req_id}
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Collapsible AI Reasoning (Requirements 2.3, 2.8)                  */}
      {/* ----------------------------------------------------------------- */}
      <div className="mb-4">
        {/* Toggle button — always visible */}
        <button
          type="button"
          onClick={() => setIsReasoningExpanded((prev) => !prev)}
          aria-expanded={isReasoningExpanded}
          aria-controls={`reasoning-${item.id}`}
          className={[
            "inline-flex items-center gap-1.5 text-xs font-medium rounded-sm",
            "text-zinc-500 hover:text-zinc-800 transition-colors",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-white focus-visible:outline-none",
          ].join(" ")}
        >
          {isReasoningExpanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              Collapse AI Reasoning
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              View Full AI Reasoning
            </>
          )}
        </button>

        {/* Animated expand/collapse panel */}
        <AnimatePresence initial={false}>
          {isReasoningExpanded && (
            <motion.div
              id={`reasoning-${item.id}`}
              key="reasoning"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="mt-2 border border-zinc-200 bg-zinc-50 rounded-sm px-3 py-3">
                {item.ai_reasoning ? (
                  <p className="text-sm text-zinc-700 leading-relaxed">
                    {item.ai_reasoning}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400 italic">
                    No AI reasoning provided
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Action buttons — only rendered for pending items (Req 9.5, 15)    */}
      {/* ----------------------------------------------------------------- */}
      {item.status === "pending" && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-200">
          {/* Viewer-owned tooltip hint (Requirement 6.4) */}
          {isViewerOwned && (
            <span className="text-xs text-zinc-400 mr-auto">
              You cannot resolve your own submission
            </span>
          )}

          {/* Approve button — opens confirmation dialog */}
          <button
            onClick={handleApprovClick}
            disabled={isDisabled}
            aria-label={`Approve AI fix: apply ${item.suggested_req_id}`}
            aria-disabled={isDisabled}
            className={[
              "inline-flex items-center justify-center gap-1.5",
              "border border-green-600 text-green-700 hover:bg-green-50",
              "rounded-sm px-3 py-1.5 text-sm",
              "active:scale-95",
              "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors",
            ].join(" ")}
          >
            {isInFlight ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              "Approve AI Fix"
            )}
          </button>

          {/* Reject button (Requirements 4.5, 11.9, 12.1, 12.3, 12.7) */}
          <button
            onClick={() => onReject(item.id)}
            disabled={isDisabled}
            aria-label={`Reject: keep original ${item.original_req_id}`}
            aria-disabled={isDisabled}
            className={[
              "inline-flex items-center justify-center gap-1.5",
              "border border-red-300 text-red-600 hover:bg-red-50",
              "rounded-sm px-3 py-1.5 text-sm",
              "active:scale-95",
              "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors",
            ].join(" ")}
          >
            {isInFlight ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              "Reject / Keep Original"
            )}
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Approve confirmation dialog                                         */}
      {/* ----------------------------------------------------------------- */}
      <AnimatePresence>
        {showApproveConfirm && (
          <>
            {/* Backdrop */}
            <motion.div
              key="confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "tween", duration: 0.12 }}
              className="fixed inset-0 z-40 bg-zinc-900/50"
              onClick={handleCancelApprove}
              aria-hidden="true"
            />

            {/* Dialog panel */}
            <motion.div
              key="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-approve-title"
              aria-describedby="confirm-approve-desc"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="pointer-events-auto w-full max-w-md rounded-sm border border-zinc-200 bg-white shadow-none"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center gap-2.5 border-b border-zinc-100 px-5 py-4">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
                  <p id="confirm-approve-title" className="text-sm font-semibold text-zinc-800">
                    Confirm Approval — 21 CFR Part 11
                  </p>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-3">
                  <p id="confirm-approve-desc" className="text-sm text-zinc-700 leading-relaxed">
                    Approving this fix will perform an <span className="font-semibold">append-only correction</span>:
                  </p>
                  <ol className="space-y-3 text-sm text-zinc-600 list-none">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-zinc-400">1.</span>
                      <span className="leading-relaxed">
                        A new evidence log will be inserted with the corrected FDA code{" "}
                        <code className="font-mono text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-px align-baseline">
                          {item.suggested_req_id}
                        </code>
                        .
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-zinc-400">2.</span>
                      <span className="leading-relaxed">
                        The original log tagged{" "}
                        <code className="font-mono text-xs text-zinc-600 bg-zinc-100 rounded px-1 py-px align-baseline">
                          {item.original_req_id}
                        </code>{" "}
                        will be marked <span className="font-semibold">deprecated</span> and hidden from active views — preserved in the audit ledger.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-zinc-400">3.</span>
                      <span className="leading-relaxed">
                        The new log will appear in the Evidence Log with a{" "}
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-700 border border-amber-300 bg-amber-50 rounded px-1 py-px align-baseline">
                          QA Override
                        </span>{" "}
                        marker.
                      </span>
                    </li>
                  </ol>
                  <p className="text-xs text-zinc-400 border-t border-zinc-100 pt-3">
                    This action is immutable and will be recorded in the 21 CFR Part 11 audit trail.
                  </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
                  <button
                    onClick={handleCancelApprove}
                    className={[
                      "rounded-sm border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600",
                      "hover:bg-zinc-50 transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
                    ].join(" ")}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmApprove}
                    className={[
                      "rounded-sm border border-green-600 bg-white px-4 py-2 text-sm font-medium text-green-700",
                      "hover:bg-green-50 active:scale-95 transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
                    ].join(" ")}
                  >
                    Confirm &amp; Insert Corrected Log
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
