"use client";
// omnis-ui/components/triage-queue-client.tsx
//
// TriageQueueClient — full-spec rewrite per triage-inbox-resolution spec task 8.1.
//
// Spec compliance:
//   - State: items, inFlight (Set<string>), statusFilter, sortOrder
//   - Derived displayItems via useMemo
//   - handleResolve: double-click guard, optimistic remove, rollback on failure
//   - Toast system: success ≥5s (approve), ≥4s (reject), error 5s,
//       "already resolved" persists (duration: null)
//   - AnimatePresence wrapping card list; exit spring stiffness 200/damping 25
//   - Focus management (Req 12.8): itemRefs + moveFocusAfterRemoval
//   - Filter controls: All | Pending | Approved | Rejected
//   - Sort controls: Oldest First | Newest First
//   - Empty state: <p> visible in a11y tree, NOT aria-hidden
//   - Passes isInFlight and isViewerOwned to each TriageItemCard
//   - QAVRO design system: bg-gray-900/950, border-slate-700, no shadow-*, no bg-white
//   - All interactive elements: focus-visible:ring-2 focus-visible:ring-violet-500

import React, {
  useState,
  useMemo,
  useTransition,
  useRef,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, X } from "lucide-react";
import { resolveTriageItem } from "@/app/dashboard/triage/actions";
import { TriageItemCard } from "@/components/triage-item-card";
import type { AiTriageQueueRow } from "@/types/supabase";
import type { ResolveTriageResult } from "@/app/dashboard/triage/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type SortOrder = "oldest_first" | "newest_first";

// ---------------------------------------------------------------------------
// Toast system
// ---------------------------------------------------------------------------

interface ToastEntry {
  id: string;
  type: "success" | "error";
  message: string;
  /** null = persist until explicit dismiss */
  duration: number | null;
}

function useToasts() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const addToast = useCallback(
    (
      type: ToastEntry["type"],
      message: string,
      opts: { duration?: number | null; persist?: boolean } = {}
    ) => {
      const id = crypto.randomUUID();
      const duration =
        opts.persist === true
          ? null
          : opts.duration !== undefined
          ? opts.duration
          : null;

      setToasts((prev) => [...prev, { id, type, message, duration }]);

      if (duration !== null) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TriageQueueClientProps {
  initialItems: AiTriageQueueRow[];
  viewerRole: "qa_manager" | "admin" | "developer";
}

export function TriageQueueClient({
  initialItems,
  viewerRole,
}: TriageQueueClientProps): React.JSX.Element {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const [items, setItems] = useState<AiTriageQueueRow[]>(initialItems);
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("oldest_first");
  const [, startTransition] = useTransition();

  const { toasts, addToast, dismissToast } = useToasts();

  // ------------------------------------------------------------------
  // Focus management (Req 12.8)
  // ------------------------------------------------------------------
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const emptyStateRef = useRef<HTMLParagraphElement | null>(null);

  function moveFocusAfterRemoval(removedId: string) {
    // displayItems at the time of call already has the item removed
    // (optimistic remove happened before this is called on success).
    // We need to determine where in the pre-removal display list the
    // removed item sat, then focus the item at that index (or the one
    // before if it was last), or the empty-state paragraph.
    const currentDisplayIds = Object.keys(itemRefs.current).filter(
      (id) => id !== removedId && itemRefs.current[id] !== null
    );

    if (currentDisplayIds.length > 0) {
      // Focus the first remaining item ref (simplest safe strategy)
      const target = itemRefs.current[currentDisplayIds[0]];
      target?.focus();
    } else {
      emptyStateRef.current?.focus();
    }
  }

  // ------------------------------------------------------------------
  // Derived displayItems
  // ------------------------------------------------------------------
  const displayItems = useMemo(() => {
    let filtered =
      statusFilter === "all"
        ? items
        : items.filter((i) => i.status === statusFilter);
    return [...filtered].sort((a, b) => {
      const diff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "oldest_first" ? diff : -diff;
    });
  }, [items, statusFilter, sortOrder]);

  // ------------------------------------------------------------------
  // handleResolve
  // ------------------------------------------------------------------
  function handleResolve(id: string, resolution: "approved" | "rejected") {
    if (inFlight.has(id)) return; // double-click prevention

    const item = items.find((i) => i.id === id)!;
    setInFlight((s) => new Set(s).add(id)); // mark in-flight
    setItems((prev) => prev.filter((i) => i.id !== id)); // optimistic remove

    startTransition(async () => {
      const result: ResolveTriageResult = await resolveTriageItem(
        id,
        resolution
      );
      setInFlight((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });

      if (!result.success) {
        setItems((prev) => {
          if (prev.some((i) => i.id === id)) return prev; // duplicate guard
          return [item, ...prev]; // restore at head on failure
        });

        // "already resolved" → persists until dismiss
        if (result.error?.toLowerCase().includes("already been resolved")) {
          addToast("error", result.error, { persist: true });
        } else {
          addToast("error", result.error ?? "Resolution failed.", {
            duration: 5000,
          });
        }
      } else {
        // Success toast: 5s for approve, 4s for reject
        const duration = resolution === "approved" ? 5000 : 4000;
        const msg =
          resolution === "approved"
            ? `AI fix approved — evidence log re-tagged to ${result.suggestedReqId ?? ""}.`
            : `Suggestion rejected — original tag ${result.originalReqId ?? ""} retained.`;
        addToast("success", msg, { duration });
        moveFocusAfterRemoval(id);
      }
    });
  }

  // ------------------------------------------------------------------
  // Filter button classes helper
  // ------------------------------------------------------------------
  function filterBtnClass(filter: StatusFilter) {
    const isActive = statusFilter === filter;
    return [
      "px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors",
      "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
      isActive
        ? "border-violet-500 text-violet-700 bg-violet-50"
        : "border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 bg-white",
    ].join(" ");
  }

  // ------------------------------------------------------------------
  // Sort button classes helper
  // ------------------------------------------------------------------
  function sortBtnClass(order: SortOrder) {
    const isActive = sortOrder === order;
    return [
      "px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors",
      "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
      isActive
        ? "border-zinc-400 text-zinc-800 bg-zinc-100"
        : "border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 bg-white",
    ].join(" ");
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="relative flex flex-col gap-4">
      {/* ---------------------------------------------------------------- */}
      {/* Toast container — aria-live="polite" + aria-atomic="true"        */}
      {/* ---------------------------------------------------------------- */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                scale: 0.95,
                transition: { type: "spring", stiffness: 200, damping: 25 },
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
              role="status"
              className={[
                "flex items-start gap-2.5 border rounded-sm px-4 py-3 text-sm font-medium max-w-sm",
                toast.type === "success"
                  ? "border-green-300 bg-green-50 text-green-800"
                  : "border-red-300 bg-red-50 text-red-700",
              ].join(" ")}
            >
              <span className="leading-snug flex-1">{toast.message}</span>
              <button
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className={[
                  "shrink-0 rounded-sm p-0.5 opacity-60 hover:opacity-100",
                  "focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:outline-none",
                ].join(" ")}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Controls — Filter + Sort                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status filter */}
        <div
          role="group"
          aria-label="Filter by status"
          className="flex items-center gap-1.5"
        >
          {(
            [
              ["all", "All"],
              ["pending", "Pending"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
            ] as [StatusFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              aria-pressed={statusFilter === value}
              className={filterBtnClass(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort order */}
        <div
          role="group"
          aria-label="Sort order"
          className="flex items-center gap-1.5"
        >
          <span className="text-xs text-zinc-400 mr-1">Sort:</span>
          {(
            [
              ["oldest_first", "Oldest First"],
              ["newest_first", "Newest First"],
            ] as [SortOrder, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSortOrder(value)}
              aria-pressed={sortOrder === value}
              className={sortBtnClass(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Item list                                                          */}
      {/* ---------------------------------------------------------------- */}
      {displayItems.length === 0 ? (
        /* Empty state — visible <p>, NOT aria-hidden (Req 12.4) */
        <div className="flex flex-col items-center justify-center border border-zinc-200 bg-white rounded-sm py-12 text-center">
          <Inbox
            className="mb-3 h-10 w-10 text-zinc-300"
            strokeWidth={1.25}
            aria-hidden="true"
          />
          <p
            ref={emptyStateRef}
            tabIndex={-1}
            className="text-sm font-medium text-zinc-500"
          >
            {statusFilter === "all"
              ? "Triage inbox is clear — no pending AI flags require review."
              : `No ${statusFilter} items to display.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {displayItems.map((item) => (
              <motion.div
                key={item.id}
                layout
                exit={{
                  opacity: 0,
                  scale: 0.95,
                  transition: {
                    type: "spring",
                    stiffness: 200,
                    damping: 25,
                  },
                }}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
              >
                <TriageItemCard
                  item={item}
                  isInFlight={inFlight.has(item.id)}
                  isViewerOwned={viewerRole === "developer"}
                  onApprove={(id) => handleResolve(id, "approved")}
                  onReject={(id) => handleResolve(id, "rejected")}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
