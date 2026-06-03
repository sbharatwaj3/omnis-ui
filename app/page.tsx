// omnis-ui/app/page.tsx
// FDA Assurance Dashboard — Phase 1 (Live Matrix) + Phase 2 (Executive Telemetry)
//
// This is a React Server Component. Data is fetched at request time on the
// server — no useEffect, no client-side loading spinners for the initial render.
// Next.js Suspense boundaries handle graceful loading states.

import { Suspense } from "react";
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
import { ShieldCheck, Activity, AlertTriangle, CheckCircle2, BarChart3 } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { ClickableTableRow } from "@/components/clickable-table-row";

// ---------------------------------------------------------------------------
// Database row types — strictly match the Constitution's DDL schema.
// ---------------------------------------------------------------------------

interface EvidenceLogRow {
  log_id: string;
  execution_timestamp: string;
  execution_status: string;
  raw_command: string;
  event_source: string;
}

interface AiInsightRow {
  log_id: string;
  ai_test_suite: string | null;
  ai_result_summary: string | null;
  ai_confidence_score: number | null;
}

// ---------------------------------------------------------------------------
// Joined row — what the dashboard table renders
// ---------------------------------------------------------------------------

interface DashboardRow {
  logId: string;
  executionTime: string;
  testSuite: string;
  executionStatus: string;
  aiSummary: string | null;
  severity: "Critical" | "Clear" | "Pending";
}

// ---------------------------------------------------------------------------
// SEVERITY MAPPING UTILITY
// Parses the AI result summary and maps it to a traffic-light severity level.
// "Critical Anomaly" (case-insensitive) → Critical (red)
// Any other non-null summary → Clear (green)
// No AI insight yet → Pending (amber)
// ---------------------------------------------------------------------------

function mapSeverity(aiSummary: string | null): DashboardRow["severity"] {
  if (aiSummary === null || aiSummary === undefined) return "Pending";
  if (/critical|failure|anomaly/i.test(aiSummary)) return "Critical";
  return "Clear";
}

// ---------------------------------------------------------------------------
// DATA FETCHING — runs on the server at request time
// Fetches evidence_logs and ai_compliance_insights, then joins on log_id.
// ---------------------------------------------------------------------------

async function fetchDashboardData(): Promise<DashboardRow[]> {
  // createClient() is called inside this function — not at module scope —
  // so that next/headers cookies() reads the request cookies at call time
  // and attaches the user's session to every Supabase query below.
  const supabase = await createClient();

  // Fetch evidence logs — ordered newest first
  const { data: logs, error: logsError } = await supabase
    .from("evidence_logs")
    .select("log_id, execution_timestamp, execution_status, raw_command, event_source")
    .order("execution_timestamp", { ascending: false })
    .limit(100);

  if (logsError) {
    console.error("Supabase error fetching evidence_logs:", logsError.message);
    return [];
  }

  if (!logs || logs.length === 0) return [];

  // Fetch AI insights for the same log IDs
  const logIds = logs.map((l: EvidenceLogRow) => l.log_id);

  const { data: insights, error: insightsError } = await supabase
    .from("ai_compliance_insights")
    .select("log_id, ai_test_suite, ai_result_summary, ai_confidence_score")
    .in("log_id", logIds);

  if (insightsError) {
    // Non-fatal: render rows without AI data rather than crashing the page.
    console.error(
      "Supabase error fetching ai_compliance_insights:",
      insightsError.message,
    );
  }

  // Build a lookup map: log_id → insight
  const insightMap = new Map<string, AiInsightRow>();
  if (insights) {
    for (const insight of insights as AiInsightRow[]) {
      insightMap.set(insight.log_id, insight);
    }
  }

  // Join and map to DashboardRow
  return (logs as EvidenceLogRow[]).map((log) => {
    const insight = insightMap.get(log.log_id) ?? null;
    const aiSummary = insight?.ai_result_summary ?? null;

    return {
      logId: log.log_id,
      executionTime: new Date(log.execution_timestamp).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      }),
      testSuite: insight?.ai_test_suite ?? log.raw_command ?? log.event_source,
      executionStatus: log.execution_status,
      aiSummary,
      severity: mapSeverity(aiSummary),
    };
  });
}

// ---------------------------------------------------------------------------
// SEVERITY BADGE COMPONENT
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: DashboardRow["severity"] }) {
  if (severity === "Critical") {
    return (
      <Badge className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100 font-semibold">
        ● Critical
      </Badge>
    );
  }
  if (severity === "Clear") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 font-medium">
        ● Clear
      </Badge>
    );
  }
  // Pending — AI analysis not yet complete
  return (
    <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100 font-medium">
      ● Pending
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// EXECUTION STATUS BADGE
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status?.toUpperCase() === "SUCCESS";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        isSuccess
          ? "bg-zinc-100 text-zinc-600"
          : "bg-orange-50 text-orange-700"
      }`}
    >
      {status ?? "—"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// METRIC CARD SKELETON — shown while data loads
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 animate-pulse rounded bg-zinc-200" />
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-zinc-100" />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TABLE ROW SKELETON
// ---------------------------------------------------------------------------

function TableRowSkeleton() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableCell key={i}>
          <div className="h-4 animate-pulse rounded bg-zinc-100" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// PHASE 2: EXECUTIVE TELEMETRY CARDS
// Calculates metrics from the live dataset.
// ---------------------------------------------------------------------------

function TelemetryCards({ rows }: { rows: DashboardRow[] }) {
  const total = rows.length;
  const criticalCount = rows.filter((r) => r.severity === "Critical").length;
  const failureRate =
    total > 0 ? ((criticalCount / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* Total Executions */}
      <Card className="border-zinc-200 shadow-sm">
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
          <p className="mt-1 text-xs text-zinc-400">
            Evidence logs ingested
          </p>
        </CardContent>
      </Card>

      {/* Malfunction Volume */}
      <Card
        className={`border-zinc-200 shadow-sm ${
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
          <p className="mt-1 text-xs text-zinc-400">
            Logs flagged as Critical
          </p>
        </CardContent>
      </Card>

      {/* Failure Rate */}
      <Card
        className={`border-zinc-200 shadow-sm ${
          parseFloat(failureRate) > 0 ? "border-orange-200 bg-orange-50/30" : ""
        }`}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Failure Rate
          </CardTitle>
          <CheckCircle2
            className={`h-4 w-4 ${
              parseFloat(failureRate) === 0
                ? "text-emerald-500"
                : "text-orange-500"
            }`}
          />
        </CardHeader>
        <CardContent>
          <p
            className={`text-3xl font-bold tabular-nums ${
              parseFloat(failureRate) === 0
                ? "text-emerald-600"
                : "text-orange-600"
            }`}
          >
            {failureRate}%
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Critical vs total executions
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PHASE 1: LIVE TRAFFIC LIGHT MATRIX TABLE
// ---------------------------------------------------------------------------

function EvidenceTable({ rows }: { rows: DashboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldCheck className="mb-3 h-10 w-10 text-zinc-300" />
        <p className="text-sm font-medium text-zinc-500">No evidence logs found</p>
        <p className="mt-1 text-xs text-zinc-400">
          Run the omnis-run CLI to ingest your first evidence log.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-zinc-50 hover:bg-zinc-50">
          <TableHead className="w-[220px] text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Log ID
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Execution Time
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Test Suite
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Status
          </TableHead>
          <TableHead className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            AI Risk
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <ClickableTableRow
            key={row.logId}
            logId={row.logId}
            isCritical={row.severity === "Critical"}
          >
            <TableCell className="font-mono text-xs text-zinc-400">
              {row.logId.slice(0, 8)}…{row.logId.slice(-4)}
            </TableCell>
            <TableCell className="text-sm text-zinc-600">
              {row.executionTime}
            </TableCell>
            <TableCell className="max-w-[260px] truncate text-sm font-medium text-zinc-800">
              {row.testSuite}
            </TableCell>
            <TableCell>
              <StatusBadge status={row.executionStatus} />
            </TableCell>
            <TableCell>
              <SeverityBadge severity={row.severity} />
            </TableCell>
          </ClickableTableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD CONTENT — async Server Component that fetches and renders
// ---------------------------------------------------------------------------

async function DashboardContent() {
  const rows = await fetchDashboardData();

  return (
    <>
      {/* Phase 2: Executive Telemetry */}
      <TelemetryCards rows={rows} />

      {/* Phase 1: Live Traffic Light Matrix */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-800">
            Evidence Log · Traffic Light Matrix
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Live data from Supabase · evidence_logs ⋈ ai_compliance_insights
          </p>
        </div>
        <EvidenceTable rows={rows} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// LOADING SKELETON — shown by Suspense while DashboardContent fetches
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <>
      {/* Metric card skeletons */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-4">
          <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
          <div className="mt-1.5 h-3 w-64 animate-pulse rounded bg-zinc-100" />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50 hover:bg-zinc-50">
              {["Log ID", "Execution Time", "Test Suite", "Status", "AI Risk"].map(
                (h) => (
                  <TableHead
                    key={h}
                    className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
                  >
                    {h}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ROOT PAGE EXPORT
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-zinc-800" strokeWidth={1.75} />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
              Omnis RegOps
            </h1>
            <p className="text-xs text-zinc-400">
              FDA Assurance Dashboard · Live
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-zinc-600">
              IEC 62304 · 21 CFR Part 11
            </span>
          </div>
        </div>
      </header>

      {/* Main — Suspense wraps the async data fetch */}
      <main className="mx-auto max-w-7xl px-8 py-10">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      </main>
    </div>
  );
}
