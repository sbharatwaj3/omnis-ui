"use client";
// omnis-ui/components/dashboard-client.tsx
// FDA Assurance Dashboard — Client-side interactive layer.
//
// Receives the full pre-fetched dataset from the server page and owns:
//   1. Timeframe dropdown filter (Today / This Week / This Month / This Year)
//   2. Custom date-range picker (react-day-picker v9 via shadcn Calendar)
//   3. Accordion-grouped view — rows are grouped by Test Suite name.
//      Each group header shows: suite name, total count, failed/pending count.
//      Clicking a header smoothly expands to reveal the underlying log rows.
//   4. "Parse and Simplify" log title helper with raw-command tooltip
//   5. Two-step Quick View → Full View architecture:
//      - Step A: Centered quick-view modal (LogDetailDrawer) with high-level metadata
//      - Step B: "View Full Evidence Log" button in the modal routes to /logs/[id]
//   6. View mode (grouped vs flat) persisted via URL search params (?view=list)

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Rows3,
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
  reqId: string | null;          // regulatory requirement ID
}

// ---------------------------------------------------------------------------
// Grouped suite type
// ---------------------------------------------------------------------------

interface SuiteGroup {
  suiteKey: string;              // unique key for the group (normalised testSuite)
  suiteLabel: string;            // human-readable parsed label
  rows: DashboardRow[];
  totalCount: number;
  criticalCount: number;         // logs with severity Critical
  failedCount: number;           // logs with executionStatus !== SUCCESS
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;      // max groups per page (grouped mode)
const FLAT_PAGE_SIZE = 100; // max rows per page (flat mode)

type Timeframe = "today" | "week" | "month" | "year" | "custom" | "all";
type ViewMode = "grouped" | "flat";

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
    // Use UTC boundaries to match the UTC timestamps stored in the database.
    // setHours(local) would shift the window by the browser's UTC offset —
    // a user in UTC+8 would miss logs inserted after 16:00 UTC, and a user
    // in UTC-5 would include logs from the previous UTC day.
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { from, to };
  }
  if (timeframe === "week") {
    // Week boundary: Sunday 00:00:00 UTC → now (end of today UTC)
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay(), 0, 0, 0, 0));
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { from, to };
  }
  if (timeframe === "month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { from, to };
  }
  if (timeframe === "year") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { from, to };
  }
  return null;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Grouping helper — groups DashboardRows by normalised testSuite key.
// Rows within each group are sorted newest-first.
// Groups are sorted by: most-critical first, then most-recent execution.
// ---------------------------------------------------------------------------

function groupBySuite(rows: DashboardRow[]): SuiteGroup[] {
  const map = new Map<string, DashboardRow[]>();

  for (const row of rows) {
    // Normalise the suite key: use the parsed label so that minor
    // variations in the raw command still collapse into one group.
    const key = parseLogTitle(row.rawCommand || row.testSuite);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }

  const groups: SuiteGroup[] = [];
  for (const [suiteLabel, suiteRows] of map.entries()) {
    // Sort rows inside the group newest-first
    const sorted = [...suiteRows].sort(
      (a, b) =>
        new Date(b.rawExecutionTimestamp).getTime() -
        new Date(a.rawExecutionTimestamp).getTime(),
    );

    const criticalCount = sorted.filter((r) => r.severity === "Critical").length;
    const failedCount = sorted.filter(
      (r) => r.executionStatus?.toUpperCase() !== "SUCCESS",
    ).length;

    groups.push({
      suiteKey: suiteLabel,
      suiteLabel,
      rows: sorted,
      totalCount: sorted.length,
      criticalCount,
      failedCount,
    });
  }

  // Sort groups: critical groups first, then by most-recent execution descending
  groups.sort((a, b) => {
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
    const aLatest = new Date(a.rows[0]?.rawExecutionTimestamp ?? 0).getTime();
    const bLatest = new Date(b.rows[0]?.rawExecutionTimestamp ?? 0).getTime();
    return bLatest - aLatest;
  });

  return groups;
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
  const normalized = status?.toUpperCase();
  const isSuccess = normalized === "SUCCESS" || normalized === "PASS";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
        isSuccess
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-orange-50 text-orange-700 border border-orange-200"
      }`}
    >
      {status ?? "—"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Suite header badge — shows issue count pill in the accordion header
// ---------------------------------------------------------------------------

function SuiteIssuePill({ criticalCount, failedCount }: { criticalCount: number; failedCount: number }) {
  if (criticalCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        <AlertTriangle className="h-2.5 w-2.5" />
        {criticalCount} critical
      </span>
    );
  }
  if (failedCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
        {failedCount} failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
      <CheckCircle2 className="h-2.5 w-2.5" />
      all clear
    </span>
  );
}

// ---------------------------------------------------------------------------
// Telemetry cards — based on the *currently filtered* slice
// ---------------------------------------------------------------------------

// Animation for staggered card entrance — easeOut, zero bounce
// Uses inline animate/transition (not variants) to avoid framer-motion v12 Easing type strictness
function TelemetryCards({ rows }: { rows: DashboardRow[] }) {
  const total = rows.length;
  const criticalCount = rows.filter((r) => r.severity === "Critical").length;
  const failureRate = total > 0 ? ((criticalCount / total) * 100).toFixed(1) : "0.0";

  const cardMotion = (i: number) => ({
    initial: { opacity: 0, y: 8 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { type: "tween" as const, ease: "easeOut" as const, duration: 0.2, delay: i * 0.06 },
  });

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <motion.div {...cardMotion(0)}>
        <Card className="border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Total Executions
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-zinc-800">
              {total}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Evidence logs in current view</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...cardMotion(1)}>
        <Card
          className={`border-zinc-200 ${
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
                criticalCount > 0 ? "text-red-600" : "text-zinc-800"
              }`}
            >
              {criticalCount}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Logs flagged as Critical</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...cardMotion(2)}>
        <Card
          className={`border-zinc-200 ${
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
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suite accordion item — renders the header + expandable rows for one group
// ---------------------------------------------------------------------------

interface SuiteAccordionItemProps {
  group: SuiteGroup;
  isOpen: boolean;
  onToggle: () => void;
  onOpenDrawer: (logId: string) => void;
  activeDrawerLogId: string | null;
  isLast: boolean;
}

function SuiteAccordionItem({
  group,
  isOpen,
  onToggle,
  onOpenDrawer,
  activeDrawerLogId,
  isLast,
}: SuiteAccordionItemProps & { isLast: boolean }) {
  return (
    // Task 1: no individual borders/rounding — parent wrapper manages the block.
    // Task 2: no coloured left-accent or status borders at all.
    // Bottom border on every row except the last (handled by parent via isLast prop).
    <div className={`overflow-hidden bg-white ${!isLast ? "border-b border-slate-200" : ""}`}>

      {/* ── Accordion trigger ─────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 md:px-6"
      >
        {/* Chevron — flush left anchor */}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        />

        {/* Task 3: Suite name — medium weight, dark anchor colour */}
        <span className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate">
          {group.suiteLabel}
        </span>

        {/* Task 3: Subordinate meta — lighter, smaller */}
        <span className="hidden sm:block shrink-0 text-sm text-slate-500 tabular-nums">
          {group.totalCount} log{group.totalCount !== 1 ? "s" : ""}
        </span>

        {/* Task 2: Status badge only — all using consistent soft-fill pattern */}
        <div className="shrink-0 ml-3">
          <SuiteIssuePill
            criticalCount={group.criticalCount}
            failedCount={group.failedCount}
          />
        </div>
      </button>

      {/* ── Expandable panel ──────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isOpen && (
        <motion.div
          key="accordion-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "tween", ease: "easeOut", duration: 0.18 }}
          className="overflow-hidden"
          aria-hidden={!isOpen}
        >
        {/* Task 4: subtle tinted background separates child data from parent shell */}
        <div className="bg-slate-50 border-t border-slate-200">

          {/* Mobile card list */}
          <div className="flex flex-col divide-y divide-slate-100 md:hidden">
            {group.rows.map((row) => (
              <button
                key={row.logId}
                onClick={() => onOpenDrawer(row.logId)}
                className={[
                  "w-full text-left px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                  activeDrawerLogId === row.logId
                    ? "bg-slate-100"
                    : "active:bg-slate-100",
                ].join(" ")}
              >
                {/* Primary: parsed log name for immediate context */}
                <p className="text-sm font-medium text-slate-800 truncate">
                  {parseLogTitle(row.rawCommand || row.testSuite)}
                </p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <StatusBadge status={row.executionStatus} />
                  <SeverityBadge severity={row.severity} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {/* Task 3: subordinate text — slate-500, text-xs */}
                  <p className="text-xs text-slate-500 truncate">{row.executionTime}</p>
                  <code className="shrink-0 font-mono text-[10px] text-slate-400">
                    {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
                  </code>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table — full-width, edge-to-edge inside the tinted panel.
              Cell padding px-4 md:px-6 mirrors the trigger's own horizontal padding
              so columns feel anchored to the same grid as the header above. */}
          <div className="hidden md:block overflow-x-auto w-full">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-slate-100 hover:bg-slate-100 border-b border-slate-200">
                  <TableHead className="py-2 pl-4 md:pl-6 w-[35%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Log Name
                  </TableHead>
                  <TableHead className="py-2 w-[12%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </TableHead>
                  <TableHead className="py-2 w-[12%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                    AI Risk
                  </TableHead>
                  <TableHead className="py-2 w-[26%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Execution Time
                  </TableHead>
                  <TableHead className="py-2 pr-4 md:pr-6 w-[15%] text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Log ID
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((row) => (
                  <TableRow
                    key={row.logId}
                    onClick={() => onOpenDrawer(row.logId)}
                    className={[
                      "cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors",
                      activeDrawerLogId === row.logId
                        ? "bg-slate-100"
                        : "hover:bg-slate-100",
                    ].join(" ")}
                  >
                    <TableCell className="py-2 pl-4 md:pl-6">
                      <span
                        className="block text-xs font-medium text-slate-700 truncate"
                        title={parseLogTitle(row.rawCommand || row.testSuite)}
                      >
                        {parseLogTitle(row.rawCommand || row.testSuite)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge status={row.executionStatus} />
                    </TableCell>
                    <TableCell className="py-2">
                      <SeverityBadge severity={row.severity} />
                    </TableCell>
                    <TableCell className="py-2 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {row.executionTime}
                    </TableCell>
                    <TableCell className="py-2 pr-4 md:pr-6 text-right font-mono text-xs text-slate-400">
                      {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface DashboardClientProps {
  allRows: DashboardRow[];
  /** Initial view mode read from URL search params by the server page. */
  initialViewMode?: ViewMode;
}

export function DashboardClient({ allRows, initialViewMode = "grouped" }: DashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ── View mode (grouped accordion vs flat list) ────────────────────────────
  // Initialised from the URL param so it survives navigation back to the page.
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  // ── Sync viewMode changes back into the URL ───────────────────────────────
  const setViewModeAndSync = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    if (mode === "flat") {
      params.set("view", "list");
    } else {
      params.delete("view");
    }
    // Replace (not push) so the toggle doesn't pollute the history stack
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  // ── Accordion open state — track which suite keys are expanded ────────────
  const [openSuites, setOpenSuites] = useState<Set<string>>(new Set());

  // ── Pagination state (over groups, not rows) ──────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);

  // ── Flat-mode pagination ──────────────────────────────────────────────────
  const [flatPage, setFlatPage] = useState(1);

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

  // ── Group filtered rows by suite ──────────────────────────────────────────
  const suiteGroups = useMemo(() => groupBySuite(filteredRows), [filteredRows]);

  // ── Pagination (over groups) ──────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(suiteGroups.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageGroups = suiteGroups.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // ── Flat-mode pagination (over individual rows) ───────────────────────────
  // Sort flat rows newest-first to match the order inside each accordion group.
  const flatRows = useMemo(
    () =>
      [...filteredRows].sort(
        (a, b) =>
          new Date(b.rawExecutionTimestamp).getTime() -
          new Date(a.rawExecutionTimestamp).getTime(),
      ),
    [filteredRows],
  );
  const flatTotalPages = Math.max(1, Math.ceil(flatRows.length / FLAT_PAGE_SIZE));
  const safeFlatPage = Math.min(flatPage, flatTotalPages);
  const pageFlatRows = flatRows.slice(
    (safeFlatPage - 1) * FLAT_PAGE_SIZE,
    safeFlatPage * FLAT_PAGE_SIZE,
  );

  // Reset to page 1 when filter changes; also collapse all groups
  const setTimeframeAndReset = useCallback((tf: Timeframe) => {
    setTimeframe(tf);
    setCurrentPage(1);
    setFlatPage(1);
    setOpenSuites(new Set());
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

  // ── Accordion toggle ─────────────────────────────────────────────────────
  function toggleSuite(suiteKey: string) {
    setOpenSuites((prev) => {
      const next = new Set(prev);
      if (next.has(suiteKey)) next.delete(suiteKey);
      else next.add(suiteKey);
      return next;
    });
  }

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

      <div className="rounded border border-zinc-200 bg-white overflow-hidden">
        {/* Table header with filter controls */}
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">
              Evidence Log · Traffic Light Matrix
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {viewMode === "grouped" ? (
                <>
                  {filteredRows.length} log{filteredRows.length !== 1 ? "s" : ""} across{" "}
                  {suiteGroups.length} test suite{suiteGroups.length !== 1 ? "s" : ""} ·{" "}
                  <span className="font-medium text-zinc-500">{activeFilterLabel}</span>
                  {totalPages > 1 && ` · Page ${safePage} of ${totalPages}`}
                </>
              ) : (
                <>
                  {filteredRows.length} log{filteredRows.length !== 1 ? "s" : ""} ·{" "}
                  <span className="font-medium text-zinc-500">{activeFilterLabel}</span>
                  {flatTotalPages > 1 && ` · Page ${safeFlatPage} of ${flatTotalPages}`}
                </>
              )}
            </p>
          </div>

          {/* Filter controls */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* View mode toggle — Grouped | List */}
            <div className="flex items-center rounded border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                onClick={() => { setViewModeAndSync("grouped"); setCurrentPage(1); }}
                className={[
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all",
                  viewMode === "grouped"
                    ? "bg-white text-zinc-900 border border-zinc-200"
                    : "text-zinc-500 hover:text-zinc-700",
                ].join(" ")}
                aria-pressed={viewMode === "grouped"}
                title="Grouped by test suite"
              >
                <Rows3 className="h-3.5 w-3.5" />
                Grouped
              </button>
              <button
                onClick={() => { setViewModeAndSync("flat"); setFlatPage(1); }}
                className={[
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all",
                  viewMode === "flat"
                    ? "bg-white text-zinc-900 border border-zinc-200"
                    : "text-zinc-500 hover:text-zinc-700",
                ].join(" ")}
                aria-pressed={viewMode === "flat"}
                title="Flat list of all logs"
              >
                <LayoutList className="h-3.5 w-3.5" />
                List
              </button>
            </div>

            {/* Timeframe quick-select — scrollable on mobile */}
            <div className="flex items-center overflow-x-auto rounded border border-zinc-200 bg-zinc-50 p-0.5 max-w-full">
              {(["today", "week", "month", "year", "all"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframeAndReset(tf)}
                  className={[
                    "shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-all",
                    timeframe === tf && timeframe !== "custom"
                      ? "bg-white text-zinc-900 border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-700",
                  ].join(" ")}
                >
                  {TIMEFRAME_LABELS[tf]}
                </button>
              ))}
            </div>

            {/* Custom date range + clear chip */}
            <div className="flex items-center gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={[
                      "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-all",
                      timeframe === "custom"
                        ? "border-zinc-800 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {timeframe === "custom" && customRange?.from ? activeFilterLabel : "Custom Range"}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={6}
                  className="w-auto p-0 border-zinc-200"
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
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200"
                >
                  <X className="h-3 w-3" />
                  Clear filter
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-500">No evidence logs for this period</p>
            <p className="mt-1 text-xs text-zinc-400">
              Try a different timeframe or clear the date filter.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
          {viewMode === "grouped" ? (
          // ── Grouped accordion view ─────────────────────────────────────────
          <motion.div
            key="grouped"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.12 }}
            className="border border-slate-200 rounded overflow-hidden mx-4 my-4 md:mx-6 md:my-5"
          >
            {pageGroups.map((group, idx) => (
              <SuiteAccordionItem
                key={group.suiteKey}
                group={group}
                isOpen={openSuites.has(group.suiteKey)}
                onToggle={() => toggleSuite(group.suiteKey)}
                onOpenDrawer={openDrawer}
                activeDrawerLogId={drawerLogId}
                isLast={idx === pageGroups.length - 1}
              />
            ))}
          </motion.div>
          ) : (
          // ── Flat list view — reuses exact same row styling as accordion body ─
          <motion.div
            key="flat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.12 }}
            className="border border-slate-200 rounded overflow-hidden mx-4 my-4 md:mx-6 md:my-5 bg-slate-50"
          >
            {/* Mobile card list */}
            <div className="flex flex-col divide-y divide-slate-100 md:hidden">
              {pageFlatRows.map((row) => (
                <button
                  key={row.logId}
                  onClick={() => openDrawer(row.logId)}
                  className={[
                    "w-full text-left px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                    drawerLogId === row.logId
                      ? "bg-slate-100"
                      : "active:bg-slate-100",
                  ].join(" ")}
                >
                  {/* Primary: test suite name */}
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {parseLogTitle(row.rawCommand || row.testSuite)}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <StatusBadge status={row.executionStatus} />
                    <SeverityBadge severity={row.severity} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 truncate">{row.executionTime}</p>
                    <code className="shrink-0 font-mono text-[10px] text-slate-400">
                      {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
                    </code>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop table — same grid columns + styling as the accordion body */}
            <div className="hidden md:block overflow-x-auto w-full">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow className="bg-slate-100 hover:bg-slate-100 border-b border-slate-200">
                    <TableHead className="py-2 pl-4 md:pl-6 w-[35%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Test Suite
                    </TableHead>
                    <TableHead className="py-2 w-[12%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </TableHead>
                    <TableHead className="py-2 w-[12%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                      AI Risk
                    </TableHead>
                    <TableHead className="py-2 w-[26%] text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Execution Time
                    </TableHead>
                    <TableHead className="py-2 pr-4 md:pr-6 w-[15%] text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Log ID
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageFlatRows.map((row) => (
                    <TableRow
                      key={row.logId}
                      onClick={() => openDrawer(row.logId)}
                      className={[
                        "cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors",
                        drawerLogId === row.logId
                          ? "bg-slate-100"
                          : "hover:bg-slate-100",
                      ].join(" ")}
                    >
                      <TableCell className="py-2 pl-4 md:pl-6">
                        <span className="block text-sm font-medium text-slate-800 truncate" title={parseLogTitle(row.rawCommand || row.testSuite)}>
                          {parseLogTitle(row.rawCommand || row.testSuite)}
                        </span>
                        <code className="mt-0.5 block font-mono text-[10px] text-slate-400 truncate" title={row.logId}>
                          {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
                        </code>
                      </TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={row.executionStatus} />
                      </TableCell>
                      <TableCell className="py-2">
                        <SeverityBadge severity={row.severity} />
                      </TableCell>
                      <TableCell className="py-2 text-xs text-slate-500 whitespace-nowrap">
                        {row.executionTime}
                      </TableCell>
                      <TableCell className="py-2 pr-4 md:pr-6 text-right font-mono text-xs text-slate-400">
                        {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
          )}
          </AnimatePresence>
        )}

        {/* Pagination footer — grouped mode */}
        {viewMode === "grouped" && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 md:px-6">
            <p className="text-xs text-zinc-400">
              Showing suites {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, suiteGroups.length)} of{" "}
              {suiteGroups.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  if (Math.abs(p - safePage) <= 1) return true;
                  return false;
                })
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (
                    idx > 0 &&
                    typeof arr[idx - 1] === "number" &&
                    (p as number) - (arr[idx - 1] as number) > 1
                  ) {
                    acc.push("…");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-zinc-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item as number)}
                      className={[
                        "flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-medium transition-colors",
                        safePage === item
                          ? "bg-zinc-900 text-white"
                          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      {item}
                    </button>
                  ),
                )}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Pagination footer — flat mode */}
        {viewMode === "flat" && flatTotalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 md:px-6">
            <p className="text-xs text-zinc-400">
              Showing rows {(safeFlatPage - 1) * FLAT_PAGE_SIZE + 1}–
              {Math.min(safeFlatPage * FLAT_PAGE_SIZE, flatRows.length)} of{" "}
              {flatRows.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFlatPage((p) => Math.max(1, p - 1))}
                disabled={safeFlatPage === 1}
                className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {Array.from({ length: flatTotalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (flatTotalPages <= 7) return true;
                  if (p === 1 || p === flatTotalPages) return true;
                  if (Math.abs(p - safeFlatPage) <= 1) return true;
                  return false;
                })
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (
                    idx > 0 &&
                    typeof arr[idx - 1] === "number" &&
                    (p as number) - (arr[idx - 1] as number) > 1
                  ) {
                    acc.push("…");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-zinc-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setFlatPage(item as number)}
                      className={[
                        "flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-medium transition-colors",
                        safeFlatPage === item
                          ? "bg-zinc-900 text-white"
                          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      {item}
                    </button>
                  ),
                )}

              <button
                onClick={() => setFlatPage((p) => Math.min(flatTotalPages, p + 1))}
                disabled={safeFlatPage === flatTotalPages}
                className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick View Modal */}
      <LogDetailDrawer logId={drawerLogId} onClose={closeDrawer} viewMode={viewMode} />
    </>
  );
}
