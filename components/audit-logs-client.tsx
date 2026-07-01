"use client";
// omnis-ui/components/audit-logs-client.tsx
//
// Client component for the 21 CFR Part 11 Audit Log viewer.
//
// IMMUTABILITY CONTRACT:
//   This component is STRICTLY READ-ONLY. There are no edit, delete, or action
//   buttons of any kind. The audit trail is a legally immutable ledger under
//   21 CFR Part 11.10(e) — no UI affordance may suggest otherwise.
//
// Responsibilities:
//   - Receives the initial page of audit logs from the server component.
//   - Provides client-side text filtering across timestamp, user, action,
//     entity type, and entity ID fields without a server round-trip.
//   - Renders a clean read-only table with human-readable JSONB changes.
//   - Renders a "Load More" button that calls getAuditLogs() for pagination.

import { useState, useMemo, useTransition } from "react";
import {
  Search,
  Shield,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { getAuditLogs, type AuditLogRow } from "@/app/dashboard/requirements/actions";

// ---------------------------------------------------------------------------
// Action-type badge colours — strict, read-only palette
// ---------------------------------------------------------------------------
const ACTION_STYLES: Record<string, string> = {
  CREATE:
    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  UPDATE:
    "bg-blue-50 text-blue-700 border border-blue-200",
  DELETE:
    "bg-red-50 text-red-700 border border-red-200",
  TRIAGE_RESOLVE:
    "bg-amber-50 text-amber-700 border border-amber-200",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }),
    time: d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }),
  };
}

function truncateUuid(id: string): string {
  if (id.length <= 36 && id.includes("-")) {
    // UUID — show first 8 chars with a tooltip for the full value
    return id.slice(0, 8) + "…";
  }
  // Non-UUID entity IDs (e.g. "SRS-001" or compact JSON) — show as-is up to 40 chars
  if (id.length > 40) return id.slice(0, 40) + "…";
  return id;
}

// ---------------------------------------------------------------------------
// ChangesCell — expandable JSONB diff viewer
// ---------------------------------------------------------------------------

function ChangesCell({ changes }: { changes: AuditLogRow["changes"] }) {
  const [expanded, setExpanded] = useState(false);

  const { before, after } = changes ?? { before: null, after: null };

  // Derive a compact summary for the collapsed state
  const summary = useMemo(() => {
    if (!before && after) {
      const keys = Object.keys(after);
      const preview = keys.slice(0, 2).join(", ");
      return `Created ${keys.length} field${keys.length !== 1 ? "s" : ""}: ${preview}${keys.length > 2 ? "…" : ""}`;
    }
    if (before && !after) {
      return "Record deleted";
    }
    if (before && after) {
      // Show which fields changed
      const changedKeys = Object.keys(after).filter(
        (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]),
      );
      if (changedKeys.length === 0) return "Status updated";
      return `Changed: ${changedKeys.slice(0, 3).join(", ")}${changedKeys.length > 3 ? "…" : ""}`;
    }
    return "No changes recorded";
  }, [before, after]);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-left text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse changes" : "Expand changes"}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-zinc-400" />
        )}
        <span className="truncate">{summary}</span>
      </button>

      {expanded && (
        <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-3 text-xs">
          {before !== null && (
            <div className="mb-2">
              <p className="mb-1 font-semibold text-red-600 uppercase tracking-wide text-[10px]">
                Before
              </p>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-zinc-600 leading-relaxed">
                {JSON.stringify(before, null, 2)}
              </pre>
            </div>
          )}
          {after !== null && (
            <div>
              <p className="mb-1 font-semibold text-emerald-600 uppercase tracking-wide text-[10px]">
                After
              </p>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-zinc-600 leading-relaxed">
                {JSON.stringify(after, null, 2)}
              </pre>
            </div>
          )}
          {before === null && after === null && (
            <p className="text-zinc-400 italic">No payload recorded.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface AuditLogsClientProps {
  initialLogs: AuditLogRow[];
  initialTotal: number;
}

const PAGE_SIZE = 100;

export function AuditLogsClient({
  initialLogs,
  initialTotal,
}: AuditLogsClientProps) {
  const [logs, setLogs] = useState<AuditLogRow[]>(initialLogs);
  const [offset, setOffset] = useState(initialLogs.length);
  const [hasMore, setHasMore] = useState(initialLogs.length < initialTotal);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // -------------------------------------------------------------------------
  // Client-side filter — searches across all text-representable columns
  // -------------------------------------------------------------------------
  const filtered = useMemo(() => {
    if (!query.trim()) return logs;
    const q = query.toLowerCase();
    return logs.filter(
      (log) =>
        log.timestamp.toLowerCase().includes(q) ||
        (log.user_id ?? "").toLowerCase().includes(q) ||
        log.action_type.toLowerCase().includes(q) ||
        log.entity_type.toLowerCase().includes(q) ||
        log.entity_id.toLowerCase().includes(q) ||
        JSON.stringify(log.changes).toLowerCase().includes(q),
    );
  }, [logs, query]);

  // -------------------------------------------------------------------------
  // Load more — server action pagination
  // -------------------------------------------------------------------------
  function handleLoadMore() {
    startTransition(async () => {
      const { logs: next, error } = await getAuditLogs(PAGE_SIZE, offset);
      if (error || !next.length) {
        setHasMore(false);
        return;
      }
      setLogs((prev) => [...prev, ...next]);
      setOffset((prev) => prev + next.length);
      if (next.length < PAGE_SIZE) setHasMore(false);
    });
  }

  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Filter bar                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by date, user ID, action, or entity…"
            aria-label="Filter audit logs"
            className="w-full rounded border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none ring-0 transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        <p className="shrink-0 text-xs text-zinc-400">
          {query.trim()
            ? `${filtered.length} of ${logs.length} record${logs.length !== 1 ? "s" : ""}`
            : `${logs.length} record${logs.length !== 1 ? "s" : ""} loaded`}
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Table                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="overflow-hidden rounded border border-zinc-200 bg-white">
        {/* Compliance banner — reinforces read-only legal status */}
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
          <Shield className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={1.75} />
          <p className="text-[11px] font-medium text-zinc-500 select-none">
            21 CFR Part 11 Immutable Audit Ledger — records cannot be edited or deleted
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Timestamp
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  User
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Action
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Entity
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Entity ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Changes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-zinc-400"
                  >
                    {query.trim()
                      ? "No records match your filter."
                      : "No audit records found."}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const ts = formatTimestamp(log.timestamp);
                  const actionStyle =
                    ACTION_STYLES[log.action_type] ??
                    "bg-zinc-100 text-zinc-600 border border-zinc-200";

                  return (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-zinc-50/60"
                    >
                      {/* Timestamp */}
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <p className="font-mono text-xs font-medium text-zinc-800">
                          {ts.date}
                        </p>
                        <p className="font-mono text-[11px] text-zinc-400">{ts.time}</p>
                      </td>

                      {/* User */}
                      <td className="px-4 py-3 align-top">
                        {log.user_id ? (
                          <span
                            title={log.user_id}
                            className="font-mono text-xs text-zinc-600 cursor-default"
                          >
                            {truncateUuid(log.user_id)}
                          </span>
                        ) : (
                          <span className="text-xs italic text-zinc-400">
                            system
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${actionStyle}`}
                        >
                          {log.action_type}
                        </span>
                      </td>

                      {/* Entity type */}
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <span className="text-xs font-medium text-zinc-700">
                          {log.entity_type}
                        </span>
                      </td>

                      {/* Entity ID */}
                      <td className="px-4 py-3 align-top">
                        <span
                          title={log.entity_id}
                          className="font-mono text-xs text-zinc-500 cursor-default"
                        >
                          {truncateUuid(log.entity_id)}
                        </span>
                      </td>

                      {/* Changes */}
                      <td className="px-4 py-3 align-top max-w-xs">
                        <ChangesCell changes={log.changes} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="border-t border-zinc-100 px-4 py-3 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded border border-zinc-200 bg-white px-5 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load more records"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
