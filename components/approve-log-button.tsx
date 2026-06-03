"use client";
// omnis-ui/components/approve-log-button.tsx
// 21 CFR Part 11 digital signature button.
//
// State 1 — Unsigned:   Primary "Approve & Lock Log" button. Triggers the
//                       server action and shows a loading spinner.
// State 2 — Signed:     Disabled green badge showing approver email/ID and
//                       the ISO timestamp of the approval.
//
// The actual database write happens entirely in the Server Action (actions.ts).
// This component only manages loading state and surfaces errors.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { approveLog } from "@/app/logs/[id]/actions";
import { ShieldCheck, Loader2, Lock } from "lucide-react";

interface ApproveLogButtonProps {
  logId: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approverEmail: string | null;
}

export function ApproveLogButton({
  logId,
  approvedBy,
  approvedAt,
  approverEmail,
}: ApproveLogButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── State 2: Already approved ──────────────────────────────────────────
  if (approvedBy) {
    const formattedAt = approvedAt
      ? new Date(approvedAt).toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : null;

    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 shadow-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-emerald-700">
              Approved &amp; Locked
            </span>
            {(formattedAt || approverEmail) && (
              <span className="text-[10px] leading-tight text-emerald-600">
                {approverEmail ?? approvedBy}
                {formattedAt ? ` · ${formattedAt}` : ""}
              </span>
            )}
          </div>
          <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        </div>
      </div>
    );
  }

  // ── State 1: Unsigned ──────────────────────────────────────────────────
  async function handleApprove() {
    setError(null);
    setLoading(true);
    try {
      const result = await approveLog(logId);
      if (!result.success) {
        setError(result.error ?? "Approval failed. Please try again.");
      }
      // On success, revalidatePath in the server action refreshes this page
      // server-side, so React re-renders with State 2 automatically.
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={handleApprove}
        disabled={loading}
        size="sm"
        className="flex items-center gap-2 bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Signing…
          </>
        ) : (
          <>
            <ShieldCheck className="h-3.5 w-3.5" />
            Approve &amp; Lock Log
          </>
        )}
      </Button>
      {error && (
        <p className="text-right text-[11px] text-red-500">{error}</p>
      )}
    </div>
  );
}
