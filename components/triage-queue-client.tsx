"use client";
// omnis-ui/components/triage-queue-client.tsx
import { useState, useCallback, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Brain, Tag, Lightbulb, FileText, Inbox } from "lucide-react";
import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import type { AiTriageQueueRow } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Inline toast
// ---------------------------------------------------------------------------

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((type: Toast["type"], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, add, dismiss };
}

// ---------------------------------------------------------------------------
// Per-row action state
// ---------------------------------------------------------------------------

type RowAction = "approving" | "rejecting" | null;

// ---------------------------------------------------------------------------
// TriageRow
// ---------------------------------------------------------------------------

interface TriageRowProps {
  item: AiTriageQueueRow;
  onResolve: (id: string, action: "approved" | "rejected") => Promise<void>;
}

function TriageRow({ item, onResolve }: TriageRowProps) {
  const [pending, setPending] = useState<RowAction>(null);

  async function handleAction(resolution: "approved" | "rejected") {
    if (pending) return;
    setPending(resolution === "approved" ? "approving" : "rejecting");
    await onResolve(item.id, resolution);
    // If onResolve fails it will restore the row and show a toast;
    // the button state resets because the row will be re-mounted.
    // If it succeeds the row is unmounted so no reset needed.
  }

  return (
    <div className="rounded border border-zinc-200 bg-white transition-all">
      {/* Header row */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">

        {/* Log ID */}
        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5">
              <FileText className="h-3 w-3 text-zinc-400" strokeWidth={1.75} />
              <span className="font-mono text-[11px] font-medium text-zinc-500">
                Log ID
              </span>
              <span className="font-mono text-[11px] text-zinc-700 truncate max-w-[180px]" title={item.evidence_log_id}>
                {item.evidence_log_id.slice(0, 8)}…{item.evidence_log_id.slice(-4)}
              </span>
            </span>
            <span className="text-[11px] text-zinc-400">
              {new Date(item.created_at).toLocaleString("en-US", {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </span>
          </div>

          {/* Tag comparison */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Developer's tag */}
            <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-zinc-50 p-2.5">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                <Tag className="h-3 w-3" strokeWidth={2} />
                Developer Tagged
              </span>
              <span className="font-mono text-sm font-semibold text-zinc-700">
                {item.original_req_id}
              </span>
            </div>

            {/* AI suggestion */}
            <div className="flex flex-col gap-1 rounded border border-amber-200 bg-amber-50 p-2.5">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                <Brain className="h-3 w-3" strokeWidth={2} />
                AI Suggests
              </span>
              <span className="font-mono text-sm font-semibold text-amber-800">
                {item.suggested_req_id}
              </span>
            </div>
          </div>

          {/* AI Reasoning */}
          <div className="mt-2.5 flex gap-2 rounded border border-zinc-100 bg-zinc-50 p-2.5">
            <Lightbulb
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400"
              strokeWidth={1.75}
            />
            <p className="text-[12px] leading-relaxed text-zinc-600">
              {item.ai_reasoning}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-end">
          {/* Approve */}
          <button
            onClick={() => handleAction("approved")}
            disabled={!!pending}
            aria-label="Approve AI fix — update evidence log tag to AI suggestion"
            className="inline-flex min-w-[130px] items-center justify-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === "approving" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Approving…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                Approve AI Fix
              </>
            )}
          </button>

          {/* Reject */}
          <button
            onClick={() => handleAction("rejected")}
            disabled={!!pending}
            aria-label="Reject AI suggestion — keep developer's original tag"
            className="inline-flex min-w-[130px] items-center justify-center gap-1.5 rounded border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === "rejecting" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Rejecting…
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
                Reject / Keep Original
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface TriageQueueClientProps {
  initialItems: AiTriageQueueRow[];
}

export function TriageQueueClient({ initialItems }: TriageQueueClientProps) {
  const [items, setItems] = useState<AiTriageQueueRow[]>(initialItems);
  const { toasts, add: addToast, dismiss } = useToasts();
  const [, startTransition] = useTransition();

  const handleResolve = useCallback(
    async (id: string, resolution: "approved" | "rejected") => {
      // Optimistic removal
      const removed = items.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));

      startTransition(async () => {
        const result = await resolveTriageItem(id, resolution);
        if (!result.success) {
          // Restore the row on failure
          if (removed) {
            setItems((prev) => {
              // Avoid duplicates if somehow the row was already re-added
              if (prev.some((i) => i.id === id)) return prev;
              return [removed, ...prev];
            });
          }
          addToast(
            "error",
            result.error ?? "Failed to resolve triage item. Please try again."
          );
        } else {
          const action = resolution === "approved" ? "approved" : "rejected";
          addToast(
            "success",
            resolution === "approved"
              ? `AI fix approved — evidence log re-tagged to ${removed?.suggested_req_id ?? ""}.`
              : `Suggestion rejected — original tag ${removed?.original_req_id ?? ""} retained.`
          );
          // Keep the action variable used (satisfies TS)
          void action;
        }
      });
    },
    [items, addToast]
  );

  return (
    <div className="relative">
      {/* Toast stack */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2"
      >
        <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.18 }}
            role="status"
            className={`flex items-start gap-2.5 rounded border px-4 py-3 text-sm font-medium ${
              t.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={2} />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" strokeWidth={2} />
            )}
            <span className="leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="ml-1 shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

      {/* Queue list */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded border border-zinc-200 bg-white py-10 text-center">
          <Inbox className="mb-3 h-10 w-10 text-zinc-300" strokeWidth={1.25} />
          <p className="text-sm font-semibold text-zinc-600">
            Triage inbox is clear
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            No pending AI flags require review.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16, transition: { duration: 0.18, ease: "easeIn" } }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.18 }}
            >
              <TriageRow
                item={item}
                onResolve={handleResolve}
              />
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
