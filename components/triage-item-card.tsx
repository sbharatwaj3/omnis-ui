"use client";
// omnis-ui/components/triage-item-card.tsx
//
// TriageItemCard — QAVRO dark-canvas card for a single ai_triage_queue row.

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="bg-slate-800 border border-slate-700 rounded-sm hover:bg-slate-700/50 p-4 transition-colors"
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
          className="font-mono text-xs text-slate-400"
        >
          {truncateUuid(item.evidence_log_id)}
        </span>

        {/* Timestamp (Requirements 2.5, 11.4) */}
        <span className="font-mono text-xs text-slate-500">
          {formatTimestamp(item.created_at)}
        </span>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* req_id comparison row (Requirements 2.1, 2.2, 2.6)                */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Developer Tag */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
            Developer Tag
          </span>
          <span
            className={`font-mono text-sm ${
              reqIdsDiffer ? "text-yellow-400" : "text-slate-300"
            }`}
          >
            {item.original_req_id}
          </span>
        </div>

        {/* AI Suggestion */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
            AI Suggestion
          </span>
          <span
            className={`font-mono text-sm ${
              reqIdsDiffer ? "text-blue-400" : "text-slate-300"
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
            "text-slate-400 hover:text-slate-200 transition-colors",
            "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-slate-800 focus-visible:outline-none",
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
              <div className="mt-2 border border-slate-700 bg-slate-900/50 rounded-sm px-3 py-3">
                {item.ai_reasoning ? (
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {item.ai_reasoning}
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 italic">
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
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-700">
          {/* Viewer-owned tooltip hint (Requirement 6.4) */}
          {isViewerOwned && (
            <span className="text-xs text-slate-500 mr-auto">
              You cannot resolve your own submission
            </span>
          )}

          {/* Approve button (Requirements 3.8, 11.9, 12.1, 12.3, 12.7) */}
          <button
            onClick={() => onApprove(item.id)}
            disabled={isDisabled}
            aria-label={`Approve AI fix: apply ${item.suggested_req_id}`}
            aria-disabled={isDisabled}
            className={[
              "inline-flex items-center justify-center gap-1.5",
              "border border-green-600 text-green-400 hover:bg-green-900/30",
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
              "border border-red-700 text-red-400 hover:bg-red-900/30",
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
    </motion.div>
  );
}
