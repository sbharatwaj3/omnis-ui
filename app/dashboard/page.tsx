// omnis-ui/app/dashboard/page.tsx
// FDA Assurance Dashboard — Command Center Hub
//
// React Server Component. Fetches ALL evidence_logs + ai_compliance_insights
// at request time and passes them to <DashboardClient> for client-side
// filtering, pagination, and master-detail drawer rendering.
//
// Layout (post-refactor):
//   ┌──────────────────────────────────────────────────────────────┐
//   │  DashboardHeader (top bar — logo, audit link, role badge)    │
//   ├──────────────────────────────────────────────────────────────┤
//   │  Bento row: [Total Executions] [Malfunction Vol.] [Fail %]   │
//   ├────────────────────────────────────┬─────────────────────────┤
//   │  Evidence Log - Traffic Light      │  Live System Telemetry  │
//   │  Matrix (lg:col-span-2)            │  (lg:col-span-1)        │
//   └────────────────────────────────────┴─────────────────────────┘
//
// The four nav cards (Compliance Matrix, Requirements, Triage Inbox, Token
// Usage) have been moved to the persistent AppSidebar. They no longer render
// on this page.
//
// force-dynamic: disables Next.js static/ISR caching so every request fetches
// a fresh snapshot from Supabase.
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldAlert, Activity, Cpu, Wifi, WifiOff } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { adminClient } from "@/utils/supabase/admin";
import { DashboardHeader } from "@/components/dashboard-header";
import {
  DashboardClient,
  TelemetryCards,
  type DashboardRow,
} from "@/components/dashboard-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceLogRow {
  log_id: string;
  execution_timestamp: string;
  execution_status: string;
  raw_command: string;
  event_source: string;
  req_id: string;
}

interface AiInsightRow {
  log_id: string;
  ai_test_suite: string | null;
  ai_result_summary: string | null;
  ai_confidence_score: number | null;
}

function mapSeverity(aiSummary: string | null): DashboardRow["severity"] {
  if (!aiSummary) return "Pending";
  if (/critical|failure|anomaly/i.test(aiSummary)) return "Critical";
  return "Clear";
}

// ---------------------------------------------------------------------------
// Data fetching — no row cap; all logs fetched for client-side filtering
// ---------------------------------------------------------------------------

async function fetchAllLogs(): Promise<DashboardRow[]> {
  // Step 1: Verify the authenticated session with the anon-key session client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Step 2: Resolve org_id via the session client.
  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return [];
  const orgId: string = profile.org_id;

  // Step 3: All DATA queries use adminClient to bypass RBAC-gated RLS.
  // SECURITY: org_id scoping ensures a user only reads their own org's logs.
  let allLogs: EvidenceLogRow[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: batch, error } = await adminClient
      .from("evidence_logs")
      .select(
        "log_id, execution_timestamp, execution_status, raw_command, event_source, req_id",
      )
      .eq("org_id", orgId)
      .neq("is_deprecated", true)
      .order("execution_timestamp", { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) {
      console.error(
        "[dashboard] Supabase error fetching evidence_logs:",
        error.message,
      );
      break;
    }

    if (!batch || batch.length === 0) break;
    allLogs = allLogs.concat(batch as EvidenceLogRow[]);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  if (allLogs.length === 0) return [];

  const logIds = allLogs.map((l) => l.log_id);

  let allInsights: AiInsightRow[] = [];
  for (let i = 0; i < logIds.length; i += 500) {
    const chunk = logIds.slice(i, i + 500);
    const { data: insights, error: insightsError } = await adminClient
      .from("ai_compliance_insights")
      .select("log_id, ai_test_suite, ai_result_summary, ai_confidence_score")
      .in("log_id", chunk);

    if (insightsError) {
      console.error(
        "[dashboard] Supabase error fetching ai_compliance_insights:",
        insightsError.message,
      );
    }
    if (insights) allInsights = allInsights.concat(insights as AiInsightRow[]);
  }

  const insightMap = new Map<string, AiInsightRow>();
  for (const insight of allInsights) {
    insightMap.set(insight.log_id, insight);
  }

  return allLogs.map((log) => {
    const insight = insightMap.get(log.log_id) ?? null;
    const aiSummary = insight?.ai_result_summary ?? null;
    return {
      logId: log.log_id,
      rawExecutionTimestamp: log.execution_timestamp,
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
      rawCommand: log.raw_command ?? log.event_source ?? "",
      executionStatus: log.execution_status,
      aiSummary,
      severity: mapSeverity(aiSummary),
      reqId: log.req_id ?? null,
      eventSource: log.event_source ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Skeleton — shown while the async data fetch streams in
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <>
      {/* Bento metric row skeleton */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-zinc-200">
            <CardHeader className="pb-2">
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 animate-pulse rounded bg-zinc-200" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 2/3 + 1/3 content split skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-64 animate-pulse rounded bg-zinc-100" />
        <div className="lg:col-span-1 min-h-[500px] animate-pulse rounded bg-zinc-100" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Live System Telemetry placeholder card
// ---------------------------------------------------------------------------

function LiveSystemTelemetry() {
  return (
    <Card className="border-zinc-200 bg-white min-h-[500px] flex flex-col">
      <CardHeader className="border-b border-zinc-100 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-zinc-800">
            Live System Telemetry
          </CardTitle>
          <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Real-time ingestion pipeline health and system signals
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 pt-5">
        {/* Placeholder signal rows */}
        {[
          {
            icon: Cpu,
            label: "Ingestion Pipeline",
            status: "Operational",
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            border: "border-emerald-200",
          },
          {
            icon: Wifi,
            label: "Bedrock AI Engine",
            status: "Connected",
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            border: "border-emerald-200",
          },
          {
            icon: Activity,
            label: "Evidence Ledger",
            status: "Writing",
            color: "text-sky-600",
            bg: "bg-sky-50",
            border: "border-sky-200",
          },
          {
            icon: WifiOff,
            label: "DICOM Connector",
            status: "Standby",
            color: "text-zinc-500",
            bg: "bg-zinc-50",
            border: "border-zinc-200",
          },
        ].map(({ icon: Icon, label, status, color, bg, border }) => (
          <div
            key={label}
            className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded ${bg} border ${border}`}
              >
                <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium text-zinc-700">{label}</span>
            </div>
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${bg} ${border} ${color}`}
            >
              {status}
            </span>
          </div>
        ))}

        {/* Filler placeholder area */}
        <div className="mt-2 flex flex-1 flex-col items-center justify-center rounded border border-dashed border-zinc-200 py-10 text-center">
          <Activity className="mb-3 h-8 w-8 text-zinc-300" strokeWidth={1.5} />
          <p className="text-xs font-medium text-zinc-400">
            Live signal stream coming soon
          </p>
          <p className="mt-1 text-[11px] text-zinc-300">
            WebSocket pipeline under construction
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard content — async server component, streams into Suspense
// ---------------------------------------------------------------------------

async function DashboardContent({
  initialViewMode,
}: {
  initialViewMode: "grouped" | "flat";
}) {
  const rows = await fetchAllLogs();

  return (
    <>
      {/* ── Bento metric row ─────────────────────────────────────────────── */}
      {/* TelemetryCards is now rendered at page level so it sits above the
          2/3+1/3 split independently of the client component's internal state. */}
      <TelemetryCards rows={rows} />

      {/* ── 2/3 + 1/3 asymmetric content split ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Evidence Log · Traffic Light Matrix — spans 2 columns */}
        <div className="lg:col-span-2">
          <DashboardClient allRows={rows} initialViewMode={initialViewMode} />
        </div>

        {/* Live System Telemetry placeholder — spans 1 column */}
        <div className="lg:col-span-1">
          <LiveSystemTelemetry />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

interface DashboardPageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const { view } = await searchParams;
  const initialViewMode: "grouped" | "flat" =
    view === "list" ? "flat" : "grouped";

  return (
    <div className="min-h-screen bg-zinc-50">
      <DashboardHeader
        subtitle="FDA Assurance Dashboard · Live"
        centerSlot={
          <Link
            href="/dashboard/audit-logs"
            className="inline-flex items-center gap-1.5 rounded border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Audit Logs
          </Link>
        }
        mobileBar={null}
      />

      <main className="mx-auto max-w-7xl w-full px-8 py-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent initialViewMode={initialViewMode} />
        </Suspense>
      </main>
    </div>
  );
}
