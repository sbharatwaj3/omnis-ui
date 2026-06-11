"use client";
// omnis-ui/components/dashboard-client.tsx
// FDA Assurance Dashboard — Client-side interactive layer.
//
// Receives the full pre-fetched dataset from the server page and owns:
//   1. Timeframe dropdown filter (Today / This Week / This Month / This Year)
//   2. Custom date-range picker (react-day-picker v9 via shadcn Calendar)
//   3. Strict pagination — 50 logs per page
//   4. "Parse and Simplify" log title helper with raw-command tooltip
//   5. Two-step Quick View → Full View architecture:
//      - Step A: Centered quick-view modal (LogDetailDrawer) with high-level metadata
//      - Step B: "View Full Evidence Log" button in the modal routes to /logs/[id]

import { useState, useMemo, useCallback } from "react";
import type { DateRange } from "react-day-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LogDetailDrawer } from "@/components/log-detail-drawer";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types — must match the server page's DashboardRow shape
// ---------------------------------------------------------------------------

export interface DashboardRow {
  logId: string;
  executionTime: string;
  rawExecutionTimestamp: string; // ISO string for date comparisons
  testSuite: string;             // raw value (ai_test_suite or raw_command)
  rawCommand: string;            // the original CLI command string
  executionStatus: string;
  aiSummary: string | null;
  severity: "Critical" | "Clear" | "Pending";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

type Timeframe = "today" | "week" | "month" | "year" | "custom" | "all";

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
  custom: "Custom Range",
  all: "All Time",
};

// ---------------------------------------------------------------------------
// Log title parser
//
// Converts raw CLI strings like:
//   "python -m pytest tests/cfr820/test_capa.py -v"
// into readable titles like:
//   "CFR 820: CAPA Test"
//
// Falls back gracefully to a cleaned version of the raw string.
// The original raw string is kept accessible via tooltip.
// ---------------------------------------------------------------------------

const TITLE_PATTERNS: Array<[RegExp, string]> = [
  // CFR 820 tests
  [/cfr.?820.*test[_-]?capa/i, "CFR 820: CAPA Test"],
  [/cfr.?820.*test[_-]?design/i, "CFR 820: Design Control Test"],
  [/cfr.?820.*test[_-]?risk/i, "CFR 820: Risk Management Test"],
  [/cfr.?820.*test[_-]?validation/i, "CFR 820: Process Validation Test"],
  [/cfr.?820/i, "CFR 820: Compliance Test"],
  // IEC 62304 tests
  [/iec.?62304.*unit/i, "IEC 62304: Unit Verification"],
  [/iec.?62304.*integration/i, "IEC 62304: Integration Test"],
  [/iec.?62304.*software.?req/i, "IEC 62304: Software Requirements"],
  [/iec.?62304/i, "IEC 62304: Compliance Test"],
  // 21 CFR Part 11
  [/cfr.?11.*audit/i, "21 CFR Part 11: Audit Trail Test"],
  [/cfr.?11.*elec/i, "21 CFR Part 11: Electronic Signature Test"],
  [/cfr.?11/i, "21 CFR Part 11: Compliance Test"],
  // DICOM
  [/dicom.*corrupt/i, "DICOM: Corruption Handling Test"],
  [/dicom.*bound/i, "DICOM: Boundary Conditions Test"],
  [/dicom.*pars/i, "DICOM: Parser Test"],
  [/dicom/i, "DICOM: Compliance Test"],
  // PHI / anonymization
  [/phi.*anon/i, "PHI Anonymizer: Compliance Test"],
  [/phi/i, "PHI: Data Handling Test"],
  // CGM
  [/cgm.*alert/i, "CGM: Alert Threshold Test"],
  [/cgm/i, "CGM: Device Test"],
  // ECG / S3 pipeline
  [/ecg.*pipeline/i, "ECG: S3 Pipeline Test"],
  [/ecg/i, "ECG: Signal Test"],
  // SOUP
  [/soup.*codec/i, "SOUP: Codec Verification"],
  [/soup/i, "SOUP: Dependency Verification"],
  // Generic pytest file names — extract test module name
  [/test[_-](\w+)\.py/i, ""],  // handled procedurally below
];

function parseLogTitle(raw: string): string {
  if (!raw) return "Unknown Test";

  // Try named patterns first
  for (const [pattern, label] of TITLE_PATTERNS) {
    if (label && pattern.test(raw)) return label;
  }

  // Extract pytest test file name and humanize it
  const fileMatch = raw.match(/test[_-](\w+)\.py/i);
  if (fileMatch) {
    const name = fileMatch[1]
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `Test: ${name}`;
  }

  // Clean up a raw pytest command as last resort
  const cleaned = raw
    .replace(/python\s+-m\s+pytest\s*/i, "")
    .replace(/\s+-[a-z]+\s*/gi, " ")
    .replace(/tests\/|test_/gi, "")
    .replace(/\.py/gi, "")
    .replace(/\//g, " › ")
    .trim();

  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned || "Test Execution";
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function getTimeframeRange(timeframe: Timeframe): { from: Date; to: Date } | null {
  const now = new Date();
  if (timeframe === "today") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (timeframe === "week") {
    const from = new Date(now);
    from.setDate(now.getDate() - now.getDay());
    from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (timeframe === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (timeframe === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  return null;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: DashboardRow["severity"] }) {
  if (severity === "Critical")
    return (
      <Badge className="border border-red-200 bg-red-100 text-red-700 hover:bg-red-100 font-semibold">
        ● Critical
      </Badge>
    );
  if (severity === "Clear")
    return (
      <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-medium">
        ● Clear
      </Badge>
    );
  return (
    <Badge className="border border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100 font-medium">
      ● Pending
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status?.toUpperCase() === "SUCCESS";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        isSuccess ? "bg-zinc-100 text-zinc-600" : "bg-orange-50 text-orange-700"
      }`}
    >
      {status ?? "—"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Telemetry cards — based on the *currently filtered* slice
// ---------------------------------------------------------------------------

function TelemetryCards({ rows }: { rows: DashboardRow[] }) {
  const total = rows.length;
  const criticalCount = rows.filter((r) => r.severity === "Critical").length;
  const failureRate = total > 0 ? ((criticalCount / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Total Executions
          </CardTitle>
          <BarChart3 className="h-4 w-4 text-zinc-400" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
            {total}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Evidence logs in current view</p>
        </CardContent>
      </Card>

      <Card
        className={`border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
          criticalCount > 0 ? "border-red-200 bg-red-50/40" : ""
        }`}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Malfunction Volume
          </CardTitle>
          <AlertTriangle
            className={`h-4 w-4 ${criticalCount > 0 ? "text-red-500" : "text-zinc-300"}`}
          />
        </CardHeader>
        <CardContent>
          <p
            className={`text-3xl font-bold tabular-nums ${
              criticalCount > 0 ? "text-red-600" : "text-zinc-800 dark:text-zinc-100"
            }`}
          >
            {criticalCount}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Logs flagged as Critical</p>
        </CardContent>
      </Card>

      <Card
        className={`border-zinc-200 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
          parseFloat(failureRate) > 0 ? "border-orange-200 bg-orange-50/30" : ""
        }`}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Failure Rate
          </CardTitle>
          <CheckCircle2
            className={`h-4 w-4 ${
              parseFloat(failureRate) === 0 ? "text-emerald-500" : "text-orange-500"
            }`}
          />
        </CardHeader>
        <CardContent>
          <p
            className={`text-3xl font-bold tabular-nums ${
              parseFloat(failureRate) === 0 ? "text-emerald-600" : "text-orange-600"
            }`}
          >
            {failureRate}%
          </p>
          <p className="mt-1 text-xs text-zinc-400">Critical vs total executions</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface DashboardClientProps {
  allRows: DashboardRow[];
}

export function DashboardClient({ allRows }: DashboardClientProps) {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ── Pagination state ──────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [drawerLogId, setDrawerLogId] = useState<string | null>(null);

  // ── Filtering logic ───────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let range: { from: Date; to: Date } | null = null;

    if (timeframe === "custom" && customRange?.from) {
      const to = customRange.to ?? customRange.from;
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      range = { from: customRange.from, to: toEnd };
    } else if (timeframe !== "all") {
      range = getTimeframeRange(timeframe);
    }

    if (!range) return allRows;

    return allRows.filter((row) => {
      const ts = new Date(row.rawExecutionTimestamp);
      return ts >= range!.from && ts <= range!.to;
    });
  }, [allRows, timeframe, customRange]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filter changes
  const setTimeframeAndReset = useCallback((tf: Timeframe) => {
    setTimeframe(tf);
    setCurrentPage(1);
  }, []);

  // ── Active filter label ───────────────────────────────────────────────────
  const activeFilterLabel = useMemo(() => {
    if (timeframe === "custom") {
      if (customRange?.from && customRange?.to) {
        return `${formatDateLabel(customRange.from)} – ${formatDateLabel(customRange.to)}`;
      }
      if (customRange?.from) return formatDateLabel(customRange.from);
    }
    return TIMEFRAME_LABELS[timeframe];
  }, [timeframe, customRange]);

  // ── Modal open/close handlers ────────────────────────────────────────────
  function openDrawer(logId: string) {
    setDrawerLogId(logId);
  }

  function closeDrawer() {
    setDrawerLogId(null);
  }

  // ── Clear custom range ────────────────────────────────────────────────────
  function clearCustomRange() {
    setCustomRange(undefined);
    setTimeframeAndReset("all");
  }

  return (
    <>
      <TelemetryCards rows={filteredRows} />

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
        {/* Table header with filter controls */}
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Evidence Log · Traffic Light Matrix
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {filteredRows.length} log{filteredRows.length !== 1 ? "s" : ""} ·{" "}
              <span className="font-medium text-zinc-500">{activeFilterLabel}</span>
              {" · "}Page {safePage} of {totalPages}
            </p>
          </div>

          {/* Filter controls */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Timeframe quick-select — scrollable on mobile */}
            <div className="flex items-center overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800 max-w-full">
              {(["today", "week", "month", "year", "all"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframeAndReset(tf)}
                  className={[
                    "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    timeframe === tf && timeframe !== "custom"
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
                  ].join(" ")}
                >
                  {TIMEFRAME_LABELS[tf]}
                </button>
              ))}
            </div>

            {/* Custom date range + clear pill */}
            <div className="flex items-center gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={[
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                      timeframe === "custom"
                        ? "border-zinc-800 bg-zinc-900 text-white dark:border-zinc-300 dark:bg-zinc-700 dark:text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
                    ].join(" ")}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {timeframe === "custom" && customRange?.from ? activeFilterLabel : "Custom Range"}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={6}
                  className="w-auto p-0 border-zinc-200 shadow-lg"
                >
                  <div className="p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                      Select date range
                    </p>
                    <Calendar
                      mode="range"
                      selected={customRange}
                      onSelect={(range) => {
                        setCustomRange(range);
                        setTimeframeAndReset("custom");
                        if (range?.from && range?.to) {
                          setCalendarOpen(false);
                        }
                      }}
                      numberOfMonths={1}
                      disabled={(date) => date > new Date()}
                    />
                    {customRange?.from && (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => {
                            clearCustomRange();
                            setCalendarOpen(false);
                          }}
                          className="text-xs text-zinc-400 hover:text-zinc-600"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {timeframe === "custom" && customRange?.from && (
                <button
                  onClick={clearCustomRange}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200"
                >
                  <X className="h-3 w-3" />
                  Clear filter
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-500">No evidence logs for this period</p>
            <p className="mt-1 text-xs text-zinc-400">
              Try a different timeframe or clear the date filter.
            </p>
          </div>
        ) : (
          <>
            {/* ── MOBILE CARD LIST (hidden on md+) ───────────────────── */}
            <div className="flex flex-col divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
              {pageRows.map((row) => {
                const parsedTitle = parseLogTitle(row.rawCommand || row.testSuite);
                const isCritical = row.severity === "Critical";

                return (
                  <button
                    key={row.logId}
                    onClick={() => openDrawer(row.logId)}
                    className={[
                      "w-full text-left px-4 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                      drawerLogId === row.logId
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : isCritical
                        ? "bg-red-50/60 active:bg-red-100"
                        : "active:bg-zinc-50",
                    ].join(" ")}
                  >
                    {/* Row 1: Test Suite name */}
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                      {parsedTitle}
                    </p>

                    {/* Row 2: Badges */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <StatusBadge status={row.executionStatus} />
                      <SeverityBadge severity={row.severity} />
                    </div>

                    {/* Row 3: Execution time + Log ID (secondary metadata) */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-zinc-500 truncate">{row.executionTime}</p>
                      <code className="shrink-0 font-mono text-[10px] text-zinc-400">
                        {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
                      </code>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── DESKTOP TABLE (hidden below md) ────────────────────── */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50 hover:bg-zinc-50 dark:bg-zinc-900">
                    {["Status", "AI Risk", "Test Suite", "Execution Time", "Log ID"].map((h) => (
                      <TableHead
                        key={h}
                        className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((row) => {
                    const parsedTitle = parseLogTitle(row.rawCommand || row.testSuite);
                    const rawTitle = row.rawCommand || row.testSuite;
                    const isCritical = row.severity === "Critical";

                    return (
                      <TableRow
                        key={row.logId}
                        onClick={() => openDrawer(row.logId)}
                        className={[
                          "cursor-pointer transition-colors",
                          drawerLogId === row.logId
                            ? "bg-zinc-100 dark:bg-zinc-800"
                            : isCritical
                            ? "bg-red-50/60 hover:bg-red-100"
                            : "hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        {/* 1. Status */}
                        <TableCell>
                          <StatusBadge status={row.executionStatus} />
                        </TableCell>
                        {/* 2. AI Risk */}
                        <TableCell>
                          <SeverityBadge severity={row.severity} />
                        </TableCell>
                        {/* 3. Test Suite */}
                        <TableCell className="max-w-[280px]">
                          <span
                            title={rawTitle}
                            className="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-200 cursor-help"
                          >
                            {parsedTitle}
                          </span>
                          {parsedTitle !== rawTitle && (
                            <span className="block truncate font-mono text-[10px] text-zinc-400 mt-0.5">
                              {rawTitle.length > 55 ? rawTitle.slice(0, 52) + "…" : rawTitle}
                            </span>
                          )}
                        </TableCell>
                        {/* 4. Execution Time */}
                        <TableCell className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {row.executionTime}
                        </TableCell>
                        {/* 5. Log ID */}
                        <TableCell className="font-mono text-xs text-zinc-400">
                          {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800 md:px-6">
            <p className="text-xs text-zinc-400">
              Showing {((safePage - 1) * PAGE_SIZE) + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredRows.length)} of{" "}
              {filteredRows.length} logs
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {/* Page number pills — show up to 7, with ellipsis */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  if (Math.abs(p - safePage) <= 1) return true;
                  return false;
                })
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
                    acc.push("…");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-zinc-400">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item as number)}
                      className={[
                        "flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-xs font-medium transition-colors",
                        safePage === item
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
                      ].join(" ")}
                    >
                      {item}
                    </button>
                  )
                )}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick View Modal */}
      <LogDetailDrawer logId={drawerLogId} onClose={closeDrawer} />
    </>
  );
}
