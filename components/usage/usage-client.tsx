"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDeveloperUsage } from "@/app/dashboard/usage/actions";
import type { DeveloperUsageRow, TimeFilter } from "@/app/dashboard/usage/actions";
import { LeaderboardTable } from "@/components/usage/leaderboard-table";
import { LeaderboardSkeleton } from "@/components/usage/usage-skeleton";

// ── Filter label mapping ──────────────────────────────────────────────────
const FILTER_LABELS: Record<TimeFilter, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "all": "All Time",
};

const FILTER_CONTEXT_LABELS: Record<TimeFilter, string> = {
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
  "all": "all time",
};

// ── TimeFilterBar ─────────────────────────────────────────────────────────
interface TimeFilterBarProps {
  activeFilter: TimeFilter;
  isPending: boolean;
  onSelect: (filter: TimeFilter) => void;
}

function TimeFilterBar({ activeFilter, isPending, onSelect }: TimeFilterBarProps) {
  const filters: TimeFilter[] = ["7d", "30d", "90d", "all"];

  return (
    <div
      role="group"
      aria-label="Time range filter"
      className="flex flex-wrap gap-2"
    >
      {filters.map((filter) => {
        const isActive = filter === activeFilter;
        return (
          <motion.button
            key={filter}
            layout
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => onSelect(filter)}
            disabled={isPending}
            aria-pressed={isActive}
            className={[
              "px-3 py-1.5 rounded text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isActive
                ? "border border-foreground text-foreground bg-muted"
                : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {FILTER_LABELS[filter]}
          </motion.button>
        );
      })}
    </div>
  );
}

// ── ErrorState ─────────────────────────────────────────────────────────────
function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-card border border-border rounded p-6">
      <p className="text-sm text-destructive">⚠ {message}</p>
    </div>
  );
}

// ── UsageClient ────────────────────────────────────────────────────────────
interface UsageClientProps {
  initialRows: DeveloperUsageRow[];
  initialFilter: TimeFilter;
}

export function UsageClient({ initialRows, initialFilter }: UsageClientProps) {
  const [rows, setRows] = useState<DeveloperUsageRow[]>(initialRows);
  const [activeFilter, setActiveFilter] = useState<TimeFilter>(initialFilter);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFilterChange = (filter: TimeFilter) => {
    if (filter === activeFilter) return;
    setActiveFilter(filter);
    setError(null);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setError("Request timed out. Please try again.");
    }, 10_000);

    startTransition(async () => {
      const result = await getDeveloperUsage({ timeFilter: filter });
      clearTimeout(timeoutId);
      if (timedOut) return;

      if (result.error) {
        setError(result.error.message);
        setRows([]); // never show stale data on error (Req 4.7)
      } else {
        setRows(result.data ?? []);
        setError(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <TimeFilterBar
        activeFilter={activeFilter}
        isPending={isPending}
        onSelect={handleFilterChange}
      />

      <AnimatePresence mode="wait">
        {isPending ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <LeaderboardSkeleton />
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <ErrorState message={error} />
          </motion.div>
        ) : (
          <motion.div
            key="table"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <LeaderboardTable
              rows={rows}
              activeFilterLabel={FILTER_CONTEXT_LABELS[activeFilter]}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
